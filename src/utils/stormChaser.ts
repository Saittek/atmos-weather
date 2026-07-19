/**
 * Storm-chaser oriented risk proxies from model fields + sounding.
 * Not a substitute for SPC/NWS official products.
 */
import type { PressureLevelProfile, WeatherAlert, WeatherData } from '../api/types'
import type { Units } from './format'
import {
  convertSpeed,
  formatSpeed,
  formatTemp,
  parseWeatherLocal,
  speedUnit,
} from './format'
import { todayDailyIndex } from './weatherStory'

export type HazardLevel = 'low' | 'slight' | 'enhanced' | 'moderate' | 'high'

export interface HazardCard {
  id: 'tornado' | 'hail' | 'wind' | 'overall'
  label: string
  emoji: string
  level: HazardLevel
  score: number
  summary: string
  factors: string[]
}

export interface StormChaserBrief {
  overall: HazardCard
  tornado: HazardCard
  hail: HazardCard
  wind: HazardCard
  peaks: {
    gustKmh: number
    windKmh: number
    pop: number
    thunderLikely: boolean
    nextStormLabel: string | null
  }
  atmosphere: {
    lapse850_500: number | null
    t850: number | null
    t500: number | null
    shearProxy: number | null
    note: string
  }
  watchList: string[]
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

export function buildStormChaserBrief(
  weather: WeatherData,
  profile: PressureLevelProfile | null,
  alerts: WeatherAlert[],
  units: Units,
): StormChaserBrief {
  const c = weather.current
  const h = weather.hourly
  const ti = todayDailyIndex(weather)
  const now = Date.now()
  const tz = weather.timezone

  let maxGust = c.wind_gusts_10m ?? 0
  let maxWind = c.wind_speed_10m ?? 0
  let maxPop = 0
  let thunderLikely = [95, 96, 99].includes(c.weather_code)
  let nextStormLabel: string | null = null

  for (let i = 0; i < h.time.length; i++) {
    const ms = parseWeatherLocal(h.time[i], tz)
    if (ms < now - 30 * 60_000) continue
    if (ms > now + 24 * 3600_000) break
    maxGust = Math.max(maxGust, h.wind_gusts_10m[i] ?? 0)
    maxWind = Math.max(maxWind, h.wind_speed_10m[i] ?? 0)
    maxPop = Math.max(maxPop, h.precipitation_probability[i] ?? 0)
    const code = h.weather_code[i]
    if ([95, 96, 99].includes(code)) {
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

  const p850 = profileLevel(profile, 850)
  const p500 = profileLevel(profile, 500)
  const lapse =
    p850.t != null && p500.t != null ? p850.t - p500.t : null
  const shear = shearProxy(weather, profile)

  const alertText = alerts.map((a) => `${a.event} ${a.headline}`.toLowerCase()).join(' ')
  const hasTorAlert = /tornado/.test(alertText)
  const hasSvrAlert = /severe thunderstorm|thunderstorm warning|severe weather/.test(alertText)
  const hasHailAlert = /hail/.test(alertText)
  const hasWindAlert = /wind|high wind|gale/.test(alertText)

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

  // —— Hail ——
  const hailFactors: string[] = []
  let hailScore = 0
  if (hasHailAlert) {
    hailScore += 4
    hailFactors.push('Hail mentioned in active alerts')
  }
  if (thunderLikely && lapse != null && lapse >= 30) {
    hailScore += 3
    hailFactors.push(`Steep mid-level lapse (~${lapse.toFixed(0)}°C 850–500)`)
  } else if (lapse != null && lapse >= 28) {
    hailScore += 2
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
  if (thunderLikely && maxGust >= 70) {
    torScore += 1
    torFactors.push('Strong storms capable of organization')
  }
  if (!torFactors.length) {
    torFactors.push('Low discrete tornado signal — still verify SPC/NWS')
  }

  // Cap scores
  windScore = Math.min(10, windScore)
  hailScore = Math.min(10, hailScore)
  torScore = Math.min(10, torScore)
  const overallScore = Math.min(
    10,
    Math.round(Math.max(windScore, hailScore, torScore) * 0.7 + (windScore + hailScore + torScore) / 10),
  )

  const wind: HazardCard = {
    id: 'wind',
    label: 'Damaging wind',
    emoji: '💨',
    level: levelFromScore(windScore),
    score: windScore,
    summary: `${levelWord(levelFromScore(windScore))} wind risk · peak ${formatSpeed(maxGust, units)}`,
    factors: windFactors.slice(0, 4),
  }
  const hail: HazardCard = {
    id: 'hail',
    label: 'Hail',
    emoji: '🧊',
    level: levelFromScore(hailScore),
    score: hailScore,
    summary: `${levelWord(levelFromScore(hailScore))} hail risk from instability / alerts`,
    factors: hailFactors.slice(0, 4),
  }
  const tornado: HazardCard = {
    id: 'tornado',
    label: 'Tornado',
    emoji: '🌪️',
    level: levelFromScore(torScore),
    score: torScore,
    summary: `${levelWord(levelFromScore(torScore))} tornado risk (proxy — use SPC)`,
    factors: torFactors.slice(0, 4),
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
      ]),
    ].slice(0, 4),
  }

  const watchList: string[] = []
  if (hasTorAlert) watchList.push('Follow tornado alerts immediately')
  if (hasSvrAlert) watchList.push('Severe thunderstorm products in effect')
  if (thunderLikely) watchList.push('Keep radar looping — storms possible')
  if (maxGust >= 70) watchList.push('Secure loose outdoor items')
  if (p850.t != null && p850.t >= 12 && lapse != null && lapse >= 28) {
    watchList.push('Warm 850 hPa + steep lapse — hail watch if storms fire')
  }
  watchList.push('Cross-check SPC convective outlooks before chasing')
  watchList.push('Never drive into a core or flood-prone road')

  const noteParts: string[] = []
  if (lapse != null) noteParts.push(`850–500 lapse ${lapse.toFixed(1)}°C`)
  if (p850.t != null) noteParts.push(`850 hPa ${formatTemp(p850.t, units)}`)
  if (p500.t != null) noteParts.push(`500 hPa ${formatTemp(p500.t, units)}`)
  if (shear != null) noteParts.push(`sfc–500 ΔV ~${Math.round(convertSpeed(shear, units))} ${speedUnit(units)}`)

  return {
    overall,
    tornado,
    hail,
    wind,
    peaks: {
      gustKmh: maxGust,
      windKmh: maxWind,
      pop: maxPop,
      thunderLikely,
      nextStormLabel,
    },
    atmosphere: {
      lapse850_500: lapse,
      t850: p850.t,
      t500: p500.t,
      shearProxy: shear,
      note: noteParts.join(' · ') || 'Profile limited — relying on surface fields',
    },
    watchList: watchList.slice(0, 6),
  }
}
