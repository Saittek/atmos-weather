/**
 * Storm-chaser oriented risk proxies from model fields, CAPE/CIN/LI, and sounding.
 * Not a substitute for SPC/NWS/ECCC official products.
 */
import type { StormEnvSnapshot } from '../api/weather'
import type { PressureLevelProfile, WeatherAlert, WeatherData } from '../api/types'
import type { Units } from './format'
import {
  convertSpeed,
  formatHour,
  formatPrecip,
  formatSpeed,
  formatTemp,
  parseWeatherLocal,
  speedUnit,
} from './format'
import { todayDailyIndex } from './weatherStory'

export type HazardLevel = 'low' | 'slight' | 'enhanced' | 'moderate' | 'high'

export type HazardId = 'tornado' | 'hail' | 'wind' | 'flood' | 'overall'

export interface HazardCard {
  id: HazardId
  label: string
  emoji: string
  level: HazardLevel
  score: number
  summary: string
  factors: string[]
}

export interface StormTimelineSlot {
  time: string
  label: string
  ms: number
  /** 0–10 activity score for the hour */
  activity: number
  level: HazardLevel
  thunder: boolean
  precipMm: number
  pop: number
  gustKmh: number
  cape: number | null
  note: string
}

export interface StormChaserBrief {
  overall: HazardCard
  tornado: HazardCard
  hail: HazardCard
  wind: HazardCard
  flood: HazardCard
  peaks: {
    gustKmh: number
    windKmh: number
    pop: number
    precip12hMm: number
    thunderLikely: boolean
    nextStormLabel: string | null
  }
  atmosphere: {
    lapse850_500: number | null
    t850: number | null
    t500: number | null
    shearProxy: number | null
    cape: number | null
    capePeak: number | null
    cin: number | null
    liftedIndex: number | null
    note: string
  }
  timeline: StormTimelineSlot[]
  watchList: string[]
  shareText: string
}

function levelFromScore(score: number): HazardLevel {
  if (score >= 8) return 'high'
  if (score >= 6) return 'moderate'
  if (score >= 4) return 'enhanced'
  if (score >= 2) return 'slight'
  return 'low'
}

function levelWord(l: HazardLevel): string {
  switch (l) {
    case 'high':
      return 'High'
    case 'moderate':
      return 'Moderate'
    case 'enhanced':
      return 'Enhanced'
    case 'slight':
      return 'Slight'
    default:
      return 'Low'
  }
}

function profileLevel(
  profile: PressureLevelProfile | null,
  hPa: number,
): { t: number | null; ws: number | null; wd: number | null } {
  if (!profile?.levels?.length) return { t: null, ws: null, wd: null }
  const i = profile.levels.indexOf(hPa)
  if (i < 0) return { t: null, ws: null, wd: null }
  return {
    t: profile.temperature[i] ?? null,
    ws: profile.wind_speed[i] ?? null,
    wd: profile.wind_direction[i] ?? null,
  }
}

/** Shear proxy: surface vs 500 hPa wind speed difference (km/h) */
function shearProxy(weather: WeatherData, profile: PressureLevelProfile | null): number | null {
  const sfc = weather.current.wind_speed_10m
  const u500 = profileLevel(profile, 500).ws
  if (u500 == null) return null
  return Math.abs(u500 - sfc)
}

function isThunderCode(code: number): boolean {
  return [95, 96, 99].includes(code)
}

function capeScoreBoost(cape: number | null): number {
  if (cape == null) return 0
  if (cape >= 3000) return 4
  if (cape >= 2000) return 3
  if (cape >= 1000) return 2
  if (cape >= 500) return 1
  return 0
}

function formatCape(cape: number | null): string {
  if (cape == null) return '—'
  return `${Math.round(cape)} J/kg`
}

function formatLi(li: number | null): string {
  if (li == null) return '—'
  const s = li > 0 ? `+${li.toFixed(1)}` : li.toFixed(1)
  return s
}

/** Match nearest CAPE hour to a weather hourly ISO (same timezone local strings) */
function capeAtTime(env: StormEnvSnapshot | null, iso: string): number | null {
  if (!env?.hourly?.time?.length) return null
  const prefix = iso.slice(0, 13) // YYYY-MM-DDTHH
  const i = env.hourly.time.findIndex((t) => t.startsWith(prefix) || t.slice(0, 13) === prefix)
  if (i < 0) {
    // fallback: closest by hour string equality on date+hour
    const idx = env.hourly.time.findIndex((t) => t.slice(0, 13) === iso.slice(0, 13))
    if (idx < 0) return null
    const v = env.hourly.cape[idx]
    return v != null && Number.isFinite(v) ? v : null
  }
  const v = env.hourly.cape[i]
  return v != null && Number.isFinite(v) ? v : null
}

function buildTimeline(
  weather: WeatherData,
  env: StormEnvSnapshot | null,
  units: Units,
  hours = 12,
): StormTimelineSlot[] {
  const h = weather.hourly
  const tz = weather.timezone
  const now = Date.now()
  const slots: StormTimelineSlot[] = []
  const end = now + hours * 3600_000

  for (let i = 0; i < h.time.length; i++) {
    const ms = parseWeatherLocal(h.time[i], tz)
    if (ms < now - 45 * 60_000) continue
    if (ms > end) break

    const precip = h.precipitation[i] ?? 0
    const pop = h.precipitation_probability[i] ?? 0
    const gust = h.wind_gusts_10m[i] ?? 0
    const code = h.weather_code[i] ?? 0
    const thunder = isThunderCode(code)
    const cape = capeAtTime(env, h.time[i])

    let activity = 0
    if (thunder) activity += 4
    if (precip >= 5) activity += 3
    else if (precip >= 1) activity += 2
    else if (precip >= 0.2 || pop >= 50) activity += 1
    if (gust >= 80) activity += 3
    else if (gust >= 60) activity += 2
    else if (gust >= 45) activity += 1
    if (cape != null && cape >= 2000) activity += 2
    else if (cape != null && cape >= 1000) activity += 1
    activity = Math.min(10, activity)

    const notes: string[] = []
    if (thunder) notes.push('Thunder')
    if (precip >= 0.2) notes.push(formatPrecip(precip, units))
    else if (pop >= 40) notes.push(`PoP ${Math.round(pop)}%`)
    if (gust >= 50) notes.push(formatSpeed(gust, units))
    if (cape != null && cape >= 800) notes.push(`CAPE ${Math.round(cape)}`)
    if (!notes.length) notes.push(activity >= 2 ? 'Watch' : 'Quiet')

    let label = formatHour(h.time[i], tz)
    const mins = Math.round((ms - now) / 60_000)
    if (mins <= 30) label = 'Now'
    else if (mins <= 75) label = 'Soon'

    slots.push({
      time: h.time[i],
      label,
      ms,
      activity,
      level: levelFromScore(activity),
      thunder,
      precipMm: precip,
      pop,
      gustKmh: gust,
      cape,
      note: notes.slice(0, 3).join(' · '),
    })
  }

  return slots.slice(0, hours)
}

export function buildStormChaserBrief(
  weather: WeatherData,
  profile: PressureLevelProfile | null,
  alerts: WeatherAlert[],
  units: Units,
  env: StormEnvSnapshot | null = null,
  placeName = 'this location',
): StormChaserBrief {
  const c = weather.current
  const h = weather.hourly
  const ti = todayDailyIndex(weather)
  const now = Date.now()
  const tz = weather.timezone

  let maxGust = c.wind_gusts_10m ?? 0
  let maxWind = c.wind_speed_10m ?? 0
  let maxPop = 0
  let precip12h = 0
  let thunderLikely = isThunderCode(c.weather_code)
  let nextStormLabel: string | null = null

  for (let i = 0; i < h.time.length; i++) {
    const ms = parseWeatherLocal(h.time[i], tz)
    if (ms < now - 30 * 60_000) continue
    if (ms > now + 24 * 3600_000) break
    maxGust = Math.max(maxGust, h.wind_gusts_10m[i] ?? 0)
    maxWind = Math.max(maxWind, h.wind_speed_10m[i] ?? 0)
    maxPop = Math.max(maxPop, h.precipitation_probability[i] ?? 0)
    if (ms <= now + 12 * 3600_000) {
      precip12h += h.precipitation[i] ?? 0
    }
    const code = h.weather_code[i]
    if (isThunderCode(code)) {
      thunderLikely = true
      if (!nextStormLabel) {
        try {
          nextStormLabel = new Date(ms).toLocaleTimeString(undefined, {
            hour: 'numeric',
            timeZone: tz,
          })
        } catch {
          nextStormLabel = 'later today'
        }
      }
    }
  }

  maxGust = Math.max(maxGust, weather.daily.wind_gusts_10m_max[ti] ?? 0)
  maxPop = Math.max(maxPop, weather.daily.precipitation_probability_max[ti] ?? 0)
  const dailyPrecip = weather.daily.precipitation_sum[ti] ?? 0

  const p850 = profileLevel(profile, 850)
  const p500 = profileLevel(profile, 500)
  const lapse = p850.t != null && p500.t != null ? p850.t - p500.t : null
  const shear = shearProxy(weather, profile)

  const capeNow = env?.now.cape ?? env?.peak12h.cape ?? null
  const capePeak = env?.peak12h.cape ?? capeNow
  const cinNow = env?.now.cin ?? env?.peak12h.cinMin ?? null
  const liNow = env?.now.liftedIndex ?? env?.peak12h.liMin ?? null
  const capeBoost = capeScoreBoost(capePeak)

  const alertText = alerts.map((a) => `${a.event} ${a.headline}`.toLowerCase()).join(' ')
  const hasTorAlert = /tornado/.test(alertText)
  const hasSvrAlert = /severe thunderstorm|thunderstorm warning|severe weather/.test(alertText)
  const hasHailAlert = /hail/.test(alertText)
  const hasWindAlert = /wind|high wind|gale/.test(alertText)
  const hasFloodAlert = /flood|flash flood|excessive rain|hydrolog/.test(alertText)

  // —— Wind ——
  const windFactors: string[] = []
  let windScore = 0
  if (maxGust >= 100) {
    windScore += 5
    windFactors.push(`Damaging gust potential ${formatSpeed(maxGust, units)}`)
  } else if (maxGust >= 80) {
    windScore += 4
    windFactors.push(`Strong gusts ${formatSpeed(maxGust, units)}`)
  } else if (maxGust >= 60) {
    windScore += 3
    windFactors.push(`Gusty to ${formatSpeed(maxGust, units)}`)
  } else if (maxGust >= 45) {
    windScore += 1
    windFactors.push(`Breezy gusts ${formatSpeed(maxGust, units)}`)
  } else {
    windFactors.push(`Peak gusts ${formatSpeed(maxGust, units)}`)
  }
  if (hasWindAlert || hasSvrAlert) {
    windScore += 2
    windFactors.push('Wind-related alert in effect')
  }
  if (shear != null && shear >= 40) {
    windScore += 1
    windFactors.push('Elevated deep-layer speed shear proxy')
  }
  if (capeBoost >= 2 && thunderLikely) {
    windScore += 1
    windFactors.push('CAPE supports strong downdrafts')
  }

  // —— Hail ——
  const hailFactors: string[] = []
  let hailScore = 0
  if (hasHailAlert) {
    hailScore += 4
    hailFactors.push('Hail mentioned in active alerts')
  }
  if (capePeak != null && capePeak >= 2000 && thunderLikely) {
    hailScore += 3
    hailFactors.push(`Elevated CAPE (~${Math.round(capePeak)} J/kg)`)
  } else if (capePeak != null && capePeak >= 1000) {
    hailScore += 2
    hailFactors.push(`CAPE ~${Math.round(capePeak)} J/kg`)
  } else if (capePeak != null) {
    hailFactors.push(`CAPE ${formatCape(capePeak)}`)
  }
  if (liNow != null && liNow <= -4) {
    hailScore += 2
    hailFactors.push(`Strong LI ${formatLi(liNow)}`)
  } else if (liNow != null && liNow <= -2) {
    hailScore += 1
    hailFactors.push(`Unstable LI ${formatLi(liNow)}`)
  }
  if (thunderLikely && lapse != null && lapse >= 30) {
    hailScore += 2
    hailFactors.push(`Steep mid-level lapse (~${lapse.toFixed(0)}°C 850–500)`)
  } else if (lapse != null && lapse >= 28) {
    hailScore += 1
    hailFactors.push(`Unstable mid-levels (~${lapse.toFixed(0)}°C 850–500)`)
  } else if (lapse != null) {
    hailFactors.push(`Lapse 850–500 ≈ ${lapse.toFixed(0)}°C`)
  }
  if (thunderLikely && maxPop >= 50) {
    hailScore += 1
    hailFactors.push('Thunder + elevated PoP')
  }
  if ([96, 99].includes(c.weather_code)) {
    hailScore += 2
    hailFactors.push('Thunderstorm with hail signal in weather code')
  }
  if (!hailFactors.length) hailFactors.push('No strong hail signal in model fields')

  // —— Tornado ——
  const torFactors: string[] = []
  let torScore = 0
  if (hasTorAlert) {
    torScore += 5
    torFactors.push('Tornado watch/warning or alert language active')
  }
  if (hasSvrAlert) {
    torScore += 2
    torFactors.push('Severe thunderstorm alert nearby')
  }
  if (shear != null && shear >= 50 && thunderLikely) {
    torScore += 2
    torFactors.push('Shear + thunder combo elevates supercell concern')
  } else if (shear != null && shear >= 35) {
    torScore += 1
    torFactors.push(`Speed shear proxy ~${formatSpeed(shear, units)}`)
  }
  if (capeBoost >= 2 && shear != null && shear >= 35) {
    torScore += 1
    torFactors.push('CAPE + shear favor organized storms')
  }
  // Low CIN helps initiation; Open-Meteo CIN is often positive magnitude
  if (cinNow != null && cinNow < 25 && capeBoost >= 2) {
    torScore += 1
    torFactors.push('Weak CIN — storms can fire if lift arrives')
  } else if (cinNow != null && cinNow > 100 && capeBoost >= 2) {
    torFactors.push('Stronger CIN may delay initiation')
  }
  if (thunderLikely && maxGust >= 70) {
    torScore += 1
    torFactors.push('Strong storms capable of organization')
  }
  if (!torFactors.length) {
    torFactors.push('Low discrete tornado signal — still verify SPC/NWS')
  }

  // —— Flood ——
  const floodFactors: string[] = []
  let floodScore = 0
  if (hasFloodAlert) {
    floodScore += 5
    floodFactors.push('Flood / flash flood language in active alerts')
  }
  if (precip12h >= 40 || dailyPrecip >= 50) {
    floodScore += 4
    floodFactors.push(`Heavy total ${formatPrecip(Math.max(precip12h, dailyPrecip), units)}`)
  } else if (precip12h >= 20 || dailyPrecip >= 25) {
    floodScore += 3
    floodFactors.push(`Elevated precip ${formatPrecip(Math.max(precip12h, dailyPrecip), units)}`)
  } else if (precip12h >= 8 || dailyPrecip >= 10) {
    floodScore += 2
    floodFactors.push(`Moderate totals ${formatPrecip(Math.max(precip12h, dailyPrecip), units)}`)
  } else {
    floodFactors.push(`12h precip ~${formatPrecip(precip12h, units)}`)
  }
  // Peak hourly rate next 12h
  let peakHourly = 0
  for (let i = 0; i < h.time.length; i++) {
    const ms = parseWeatherLocal(h.time[i], tz)
    if (ms < now - 30 * 60_000 || ms > now + 12 * 3600_000) continue
    peakHourly = Math.max(peakHourly, h.precipitation[i] ?? 0)
  }
  if (peakHourly >= 15) {
    floodScore += 3
    floodFactors.push(`Intense rates ~${formatPrecip(peakHourly, units)}/hr`)
  } else if (peakHourly >= 8) {
    floodScore += 2
    floodFactors.push(`Heavy rates ~${formatPrecip(peakHourly, units)}/hr`)
  } else if (peakHourly >= 3) {
    floodScore += 1
    floodFactors.push(`Steady rain ~${formatPrecip(peakHourly, units)}/hr peak`)
  }
  if (maxPop >= 70 && precip12h >= 5) {
    floodScore += 1
    floodFactors.push('High PoP with accumulating rain')
  }
  if (!floodFactors.length) floodFactors.push('No strong flood signal in model fields')

  // Cap scores
  windScore = Math.min(10, windScore)
  hailScore = Math.min(10, hailScore)
  torScore = Math.min(10, torScore)
  floodScore = Math.min(10, floodScore)
  const overallScore = Math.min(
    10,
    Math.round(
      Math.max(windScore, hailScore, torScore, floodScore) * 0.65 +
        (windScore + hailScore + torScore + floodScore) / 12,
    ),
  )

  const wind: HazardCard = {
    id: 'wind',
    label: 'Damaging wind',
    emoji: '💨',
    level: levelFromScore(windScore),
    score: windScore,
    summary: `${levelWord(levelFromScore(windScore))} · ${formatSpeed(maxGust, units)}`,
    factors: windFactors.slice(0, 3),
  }
  const hail: HazardCard = {
    id: 'hail',
    label: 'Hail',
    emoji: '🧊',
    level: levelFromScore(hailScore),
    score: hailScore,
    summary: `${levelWord(levelFromScore(hailScore))} hail risk`,
    factors: hailFactors.slice(0, 3),
  }
  const tornado: HazardCard = {
    id: 'tornado',
    label: 'Tornado',
    emoji: '🌪️',
    level: levelFromScore(torScore),
    score: torScore,
    summary: `${levelWord(levelFromScore(torScore))} · use SPC`,
    factors: torFactors.slice(0, 3),
  }
  const flood: HazardCard = {
    id: 'flood',
    label: 'Flood',
    emoji: '🌊',
    level: levelFromScore(floodScore),
    score: floodScore,
    summary: `${levelWord(levelFromScore(floodScore))} · ${formatPrecip(precip12h, units)}/12h`,
    factors: floodFactors.slice(0, 3),
  }
  const overall: HazardCard = {
    id: 'overall',
    label: 'Storm environment',
    emoji: '🌩',
    level: levelFromScore(overallScore),
    score: overallScore,
    summary:
      overallScore >= 6
        ? 'Active storm environment — radar + official products first'
        : overallScore >= 3
          ? 'Some severe ingredients — stay weather-aware'
          : 'Quiet to mild storm signal in current fields',
    factors: [
      ...new Set([
        ...tornado.factors.slice(0, 1),
        ...hail.factors.slice(0, 1),
        ...wind.factors.slice(0, 1),
        ...flood.factors.slice(0, 1),
      ]),
    ].slice(0, 3),
  }

  const watchList: string[] = []
  if (hasTorAlert) watchList.push('Follow tornado alerts immediately')
  if (hasSvrAlert) watchList.push('Severe thunderstorm products in effect')
  if (hasFloodAlert) watchList.push('Flash flood threat — avoid flooded roads')
  if (thunderLikely) watchList.push('Keep radar looping — storms possible')
  if (maxGust >= 70) watchList.push('Secure loose outdoor items')
  if (capePeak != null && capePeak >= 1500) {
    watchList.push(`CAPE peaking near ${Math.round(capePeak)} J/kg — monitor initiation`)
  }
  if (p850.t != null && p850.t >= 12 && lapse != null && lapse >= 28) {
    watchList.push('Warm 850 hPa + steep lapse — hail watch if storms fire')
  }
  watchList.push('Cross-check SPC convective outlooks before chasing')
  watchList.push('Never drive into a core or flood-prone road')

  const noteParts: string[] = []
  if (capePeak != null) noteParts.push(`CAPE peak ${formatCape(capePeak)}`)
  if (cinNow != null) noteParts.push(`CIN ${Math.round(cinNow)}`)
  if (liNow != null) noteParts.push(`LI ${formatLi(liNow)}`)
  if (lapse != null) noteParts.push(`850–500 lapse ${lapse.toFixed(1)}°C`)
  if (p850.t != null) noteParts.push(`850 hPa ${formatTemp(p850.t, units)}`)
  if (p500.t != null) noteParts.push(`500 hPa ${formatTemp(p500.t, units)}`)
  if (shear != null) {
    noteParts.push(`sfc–500 ΔV ~${Math.round(convertSpeed(shear, units))} ${speedUnit(units)}`)
  }

  const timeline = buildTimeline(weather, env, units, 12)

  const shareLines = [
    `Solara Storm Chasers — ${placeName}`,
    `${overall.emoji} ${overall.summary}`,
    `Tornado ${levelWord(tornado.level)} · Hail ${levelWord(hail.level)} · Wind ${levelWord(wind.level)} · Flood ${levelWord(flood.level)}`,
    `Peak gusts ${formatSpeed(maxGust, units)} · PoP max ${Math.round(maxPop)}%`,
    capePeak != null ? `CAPE peak ~${Math.round(capePeak)} J/kg` : null,
    thunderLikely
      ? `Thunder possible${nextStormLabel ? ` ~${nextStormLabel}` : ''}`
      : 'Limited thunder signal',
    'Not official guidance — check NWS/ECCC/SPC.',
  ].filter(Boolean) as string[]

  return {
    overall,
    tornado,
    hail,
    wind,
    flood,
    peaks: {
      gustKmh: maxGust,
      windKmh: maxWind,
      pop: maxPop,
      precip12hMm: precip12h,
      thunderLikely,
      nextStormLabel,
    },
    atmosphere: {
      lapse850_500: lapse,
      t850: p850.t,
      t500: p500.t,
      shearProxy: shear,
      cape: capeNow,
      capePeak,
      cin: cinNow,
      liftedIndex: liNow,
      note: noteParts.join(' · ') || 'Profile limited — relying on surface fields',
    },
    timeline,
    watchList: watchList.slice(0, 7),
    shareText: shareLines.join('\n'),
  }
}
