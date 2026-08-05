/**
 * Stargazing / astrophotography conditions from forecast + sky extras.
 * Score 0–100 (higher = better). Bortle, seeing, dew, smoke, aurora fold in.
 */
import type { AirQualityData, WeatherData } from '../api/types'
import { estimateBortle, bortleScorePenalty, type BortleEstimate } from './bortleEstimate'
import { parseSunTime } from './daylight'
import { fireSmokeRisk } from './fireRisk'
import { parseWeatherLocal } from './format'
import { moonPhase } from './moon'
import { suggestTargets, type SkyTarget } from './stargazeTargets'
import { todayDailyIndex } from './weatherStory'

export type StargazeGrade = 'excellent' | 'good' | 'fair' | 'poor' | 'daylight'
export type GoNoGo = 'go' | 'maybe' | 'nogo'

export interface StargazeHour {
  time: string
  ms: number
  label: string
  score: number
  grade: StargazeGrade
  cloud: number
  humidity: number
  windKmh: number
  pop: number
  precipMm: number
  visibilityM: number
  isNight: boolean
  isDark: boolean
  seeing: number
  dewRisk: number
}

export interface StargazeWindow {
  startMs: number
  endMs: number
  startLabel: string
  endLabel: string
  avgScore: number
  hours: number
}

export interface NightCard {
  dateKey: string
  label: string
  score: number
  grade: StargazeGrade
  cloudAvg: number
  moonIllum: number
  go: GoNoGo
}

export interface StargazeBrief {
  placeReady: boolean
  lat: number
  lon: number
  nowScore: number
  nowGrade: StargazeGrade
  tonightScore: number
  tonightGrade: StargazeGrade
  /** Composite after Bortle / smoke / etc. */
  imagingScore: number
  imagingGrade: StargazeGrade
  go: GoNoGo
  goLabel: string
  goDetail: string
  moon: ReturnType<typeof moonPhase>
  bortle: BortleEstimate
  seeingNow: number
  seeingLabel: string
  dewRisk: number
  dewLabel: string
  smokeNote: string | null
  sunset?: string
  sunrise?: string
  sunsetMs: number | null
  sunriseNextMs: number | null
  darkStartMs: number | null
  darkEndMs: number | null
  darkStartLabel: string | null
  darkEndLabel: string | null
  hours: StargazeHour[]
  bestWindow: StargazeWindow | null
  nights: NightCard[]
  targets: SkyTarget[]
  tips: string[]
  factors: { label: string; value: string; tone: 'good' | 'ok' | 'bad' }[]
  summary: string
  auroraKp?: number
  auroraLabel?: string
  auroraLikely: boolean
}

/** Solar elevation (deg) — Meeus-ish approximation, good enough for twilight. */
export function solarElevationDeg(lat: number, lon: number, ms: number): number {
  const d = new Date(ms)
  const rad = Math.PI / 180
  const start = Date.UTC(d.getUTCFullYear(), 0, 0)
  const day = (ms - start) / 86400000
  const gamma = (2 * Math.PI) / 365 * (day - 1 + (d.getUTCHours() - 12) / 24)
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma)
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma))
  const timeOffset = eqTime + 4 * lon
  const tst =
    d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 + timeOffset
  const ha = (tst / 4 - 180) * rad
  const latR = lat * rad
  const sinEl =
    Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(ha)
  return Math.asin(Math.max(-1, Math.min(1, sinEl))) / rad
}

/** Astronomical night: sun below −18°. Nautical −12, civil −6. */
export function isAstronomicalDark(lat: number, lon: number, ms: number): boolean {
  return solarElevationDeg(lat, lon, ms) < -18
}

export function isNightSun(lat: number, lon: number, ms: number): boolean {
  return solarElevationDeg(lat, lon, ms) < -0.8
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

export function gradeFromScore(score: number, isNight: boolean): StargazeGrade {
  if (!isNight) return 'daylight'
  if (score >= 80) return 'excellent'
  if (score >= 62) return 'good'
  if (score >= 42) return 'fair'
  return 'poor'
}

export function gradeLabel(g: StargazeGrade): string {
  switch (g) {
    case 'excellent':
      return 'Excellent'
    case 'good':
      return 'Good'
    case 'fair':
      return 'Fair'
    case 'poor':
      return 'Poor'
    case 'daylight':
      return 'Daytime'
  }
}

export function goFromScore(score: number): GoNoGo {
  if (score >= 68) return 'go'
  if (score >= 45) return 'maybe'
  return 'nogo'
}

export function goLabels(go: GoNoGo): { label: string; detail: string } {
  if (go === 'go') {
    return {
      label: 'Pack the scope',
      detail: 'Conditions look solid for a session — clear-enough sky and workable transparency.',
    }
  }
  if (go === 'maybe') {
    return {
      label: 'Maybe · pick your window',
      detail: 'Mixed skies — short sessions or wait for the best hourly gap.',
    }
  }
  return {
    label: 'Stay home',
    detail: 'Clouds, precip, haze, or bright moon make deep-sky tough tonight.',
  }
}

/** Seeing 0–100 (higher = steadier). Heuristic from wind + RH. */
export function estimateSeeing(windKmh: number, humidity: number, gustKmh?: number): number {
  let s = 88
  const w = Math.max(windKmh, (gustKmh ?? 0) * 0.7)
  if (w > 10) s -= (w - 10) * 1.4
  if (w > 30) s -= 10
  if (humidity > 70) s -= (humidity - 70) * 0.45
  if (humidity > 90) s -= 8
  return Math.round(clamp(s, 5, 98))
}

export function seeingLabel(s: number): string {
  if (s >= 75) return 'Steady'
  if (s >= 55) return 'Average'
  if (s >= 35) return 'Soft'
  return 'Poor'
}

/** Dew risk 0–100 (higher = more dew on optics). */
export function estimateDewRisk(
  tempC: number,
  dewC: number,
  humidity: number,
  windKmh: number,
): number {
  const spread = tempC - dewC
  let risk = 20
  if (spread < 5) risk += 35
  else if (spread < 8) risk += 20
  else if (spread < 12) risk += 8
  if (humidity > 80) risk += 25
  else if (humidity > 65) risk += 12
  if (windKmh < 5) risk += 15
  if (windKmh > 20) risk -= 10
  return Math.round(clamp(risk, 0, 100))
}

export function dewLabel(risk: number): string {
  if (risk >= 70) return 'High dew risk — heaters on'
  if (risk >= 45) return 'Moderate dew — watch correctors'
  return 'Low dew risk'
}

export function scoreSkyHour(opts: {
  cloud: number
  humidity: number
  windKmh: number
  pop: number
  precipMm: number
  visibilityM: number
  moonIllum: number
  isNight: boolean
  isDark: boolean
  seeing: number
  dewRisk: number
  bortleClass: number
  smokePenalty: number
}): number {
  if (!opts.isNight) return 0

  let score = 100
  const cloud = clamp(opts.cloud, 0, 100)
  if (cloud <= 10) score -= cloud * 0.4
  else if (cloud <= 30) score -= 4 + (cloud - 10) * 1.1
  else if (cloud <= 60) score -= 26 + (cloud - 30) * 1.35
  else score -= 66 + (cloud - 60) * 0.85

  const rh = clamp(opts.humidity, 0, 100)
  if (rh > 55) score -= (rh - 55) * 0.55
  if (rh > 85) score -= 8

  const wind = Math.max(0, opts.windKmh)
  if (wind > 15) score -= (wind - 15) * 0.9
  if (wind > 35) score -= 12

  const pop = clamp(opts.pop, 0, 100)
  if (pop >= 20) score -= (pop - 15) * 0.7
  if (opts.precipMm >= 0.1) score -= 25
  if (opts.precipMm >= 0.5) score -= 30

  const vis = opts.visibilityM > 0 ? opts.visibilityM : 20000
  if (vis < 8000) score -= 18
  else if (vis < 12000) score -= 8

  const illum = clamp(opts.moonIllum, 0, 100)
  if (illum > 25) score -= (illum - 25) * 0.28
  if (illum > 70) score -= 6

  if (!opts.isDark) score -= 12

  // Seeing / dew / light pollution / smoke
  if (opts.seeing < 50) score -= (50 - opts.seeing) * 0.25
  if (opts.dewRisk > 55) score -= (opts.dewRisk - 55) * 0.15
  score -= bortleScorePenalty(opts.bortleClass) * 0.85
  score -= opts.smokePenalty

  return Math.round(clamp(score, 0, 100))
}

function hourLabel(ms: number, tz?: string): string {
  try {
    return new Date(ms).toLocaleTimeString(undefined, {
      hour: 'numeric',
      timeZone: tz,
    })
  } catch {
    return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric' })
  }
}

function rangeLabel(ms: number, tz?: string): string {
  try {
    return new Date(ms).toLocaleString(undefined, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz,
    })
  } catch {
    return new Date(ms).toLocaleString(undefined, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
  }
}

function dayLabel(ms: number, tz?: string): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: tz,
    })
  } catch {
    return new Date(ms).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }
}

function findBestWindow(hours: StargazeHour[]): StargazeWindow | null {
  const night = hours.filter((h) => h.isNight && h.score >= 40)
  if (!night.length) {
    const best = hours.filter((h) => h.isNight).sort((a, b) => b.score - a.score)[0]
    if (!best || best.score < 35) return null
    return {
      startMs: best.ms,
      endMs: best.ms + 60 * 60_000,
      startLabel: best.label,
      endLabel: hourLabel(best.ms + 60 * 60_000),
      avgScore: best.score,
      hours: 1,
    }
  }

  let best: StargazeWindow | null = null
  let bestMetric = -1
  for (let i = 0; i < night.length; i++) {
    let sum = 0
    for (let j = i; j < night.length; j++) {
      if (j > i && night[j].ms - night[j - 1].ms > 90 * 60_000) break
      sum += night[j].score
      const n = j - i + 1
      if (n < 2 && night.length >= 2) continue
      const avg = sum / n
      if (avg < 40 && n < 3) continue
      const metric = avg * Math.sqrt(n)
      if (metric > bestMetric) {
        bestMetric = metric
        best = {
          startMs: night[i].ms,
          endMs: night[j].ms + 60 * 60_000,
          startLabel: night[i].label,
          endLabel: hourLabel(night[j].ms + 60 * 60_000),
          avgScore: Math.round(avg),
          hours: n,
        }
      }
    }
  }
  return best
}

function buildNights(hours: StargazeHour[], _lat: number, _lon: number, tz?: string): NightCard[] {
  const byDay = new Map<string, StargazeHour[]>()
  for (const h of hours) {
    if (!h.isNight) continue
    const key = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(h.ms + 3 * 3600_000)) // shift so late evening counts as “tonight”
    const arr = byDay.get(key) ?? []
    arr.push(h)
    byDay.set(key, arr)
  }
  const cards: NightCard[] = []
  for (const [dateKey, list] of byDay) {
    if (!list.length) continue
    const score = Math.round(list.reduce((s, x) => s + x.score, 0) / list.length)
    const cloudAvg = Math.round(list.reduce((s, x) => s + x.cloud, 0) / list.length)
    const moonIllum = moonPhase(new Date(list[0].ms)).illumination
    cards.push({
      dateKey,
      label: dayLabel(list[0].ms, tz),
      score,
      grade: gradeFromScore(score, true),
      cloudAvg,
      moonIllum,
      go: goFromScore(score),
    })
  }
  // Sort chronologically, take 7
  cards.sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  return cards.slice(0, 7)
}

export function buildStargazeBrief(
  weather: WeatherData,
  opts?: {
    atMs?: number
    lat?: number
    lon?: number
    air?: AirQualityData | null
    auroraKp?: number | null
  },
): StargazeBrief {
  const atMs = opts?.atMs ?? Date.now()
  const lat = opts?.lat ?? weather.latitude
  const lon = opts?.lon ?? weather.longitude
  const tz = weather.timezone
  const ti = todayDailyIndex(weather)
  const moon = moonPhase(new Date(atMs))
  const bortle = estimateBortle(lat, lon)
  const h = weather.hourly
  const sunset = weather.daily.sunset[ti]
  const sunriseToday = weather.daily.sunrise[ti]
  const sunriseNext = weather.daily.sunrise[ti + 1] ?? sunriseToday

  const sunsetMs = parseSunTime(sunset, tz)
  let riseMs = parseSunTime(sunriseNext, tz)
  if (sunsetMs != null && riseMs != null && riseMs <= sunsetMs) {
    riseMs = sunsetMs + 12 * 3600_000
  }

  // Prefer solar-elevation astronomical dark when we have lat/lon
  let darkStartMs: number | null = null
  let darkEndMs: number | null = null
  if (sunsetMs != null && riseMs != null) {
    // Scan from sunset toward midnight for sun < -18
    for (let t = sunsetMs; t < riseMs; t += 10 * 60_000) {
      if (isAstronomicalDark(lat, lon, t)) {
        darkStartMs = t
        break
      }
    }
    for (let t = riseMs; t > (darkStartMs ?? sunsetMs); t -= 10 * 60_000) {
      if (isAstronomicalDark(lat, lon, t)) {
        darkEndMs = t
        break
      }
    }
    if (darkStartMs == null) darkStartMs = sunsetMs + 80 * 60_000
    if (darkEndMs == null) darkEndMs = riseMs - 80 * 60_000
  }

  const smoke = fireSmokeRisk(weather, opts?.air ?? null)
  let smokePenalty = 0
  let smokeNote: string | null = null
  const pm = smoke.pm25
  const aqi = opts?.air?.current?.us_aqi ?? 0
  if ((pm != null && pm >= 35) || aqi >= 100) {
    smokePenalty = 18
    smokeNote = 'Smoke / poor air quality will haze the sky even if “clear.”'
  } else if ((pm != null && pm >= 20) || aqi >= 70) {
    smokePenalty = 8
    smokeNote = 'Mild haze possible — transparency may suffer.'
  }

  const auroraKp = opts?.auroraKp ?? null
  const auroraLikely =
    auroraKp != null &&
    ((auroraKp >= 5 && Math.abs(lat) > 45) ||
      (auroraKp >= 4 && Math.abs(lat) > 52) ||
      (auroraKp >= 3 && Math.abs(lat) > 58))

  const hours: StargazeHour[] = []
  const horizon = atMs + 7.5 * 24 * 3600_000
  for (let i = 0; i < h.time.length; i++) {
    const ms = parseWeatherLocal(h.time[i], tz)
    if (ms < atMs - 30 * 60_000) continue
    if (ms > horizon) break

    const cloud = h.cloud_cover[i] ?? weather.current.cloud_cover ?? 50
    const humidity = h.relative_humidity_2m[i] ?? weather.current.relative_humidity_2m ?? 60
    const windKmh = h.wind_speed_10m[i] ?? weather.current.wind_speed_10m ?? 0
    const gust = h.wind_gusts_10m[i] ?? windKmh
    const pop = h.precipitation_probability[i] ?? 0
    const precipMm = h.precipitation[i] ?? 0
    const visibilityM = h.visibility[i] ?? 20000
    const temp = h.temperature_2m[i] ?? weather.current.temperature_2m
    const dew = h.dew_point_2m[i] ?? temp - 5

    const isNight = isNightSun(lat, lon, ms)
    const isDark = isNight && isAstronomicalDark(lat, lon, ms)
    const seeing = estimateSeeing(windKmh, humidity, gust)
    const dewRisk = estimateDewRisk(temp, dew, humidity, windKmh)

    const score = scoreSkyHour({
      cloud,
      humidity,
      windKmh,
      pop,
      precipMm,
      visibilityM,
      moonIllum: moonPhase(new Date(ms)).illumination,
      isNight,
      isDark,
      seeing,
      dewRisk,
      bortleClass: bortle.class,
      smokePenalty,
    })

    hours.push({
      time: h.time[i],
      ms,
      label: hourLabel(ms, tz),
      score,
      grade: gradeFromScore(score, isNight),
      cloud: Math.round(cloud),
      humidity: Math.round(humidity),
      windKmh,
      pop: Math.round(pop),
      precipMm,
      visibilityM,
      isNight,
      isDark,
      seeing,
      dewRisk,
    })
  }

  let nowIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < hours.length; i++) {
    const d = Math.abs(hours[i].ms - atMs)
    if (d < bestDist) {
      bestDist = d
      nowIdx = i
    }
  }
  const nowH = hours[nowIdx]
  const isDay = !nowH?.isNight

  const nightHours = hours.filter((x) => x.isNight)
  const tonightEnd = riseMs ?? atMs + 14 * 3600_000
  const tonightPool = nightHours.filter((x) => x.ms <= tonightEnd + 3600_000)
  const tonightScore =
    tonightPool.length > 0
      ? Math.round(tonightPool.reduce((s, x) => s + x.score, 0) / tonightPool.length)
      : nowH?.score ?? 0

  const bestWindow = findBestWindow(hours.filter((x) => x.ms <= atMs + 36 * 3600_000))
  const nights = buildNights(hours, lat, lon, tz)

  const c = weather.current
  const seeingNow = estimateSeeing(
    c.wind_speed_10m,
    c.relative_humidity_2m,
    c.wind_gusts_10m,
  )
  const dewNow = estimateDewRisk(
    c.temperature_2m,
    h.dew_point_2m[nowIdx] ?? c.temperature_2m - 5,
    c.relative_humidity_2m,
    c.wind_speed_10m,
  )

  const imagingScore = tonightScore
  const go = goFromScore(imagingScore)
  const { label: goLabel, detail: goDetail } = goLabels(go)

  const factors: StargazeBrief['factors'] = [
    {
      label: 'Clouds',
      value: `${Math.round(c.cloud_cover)}%`,
      tone: c.cloud_cover < 25 ? 'good' : c.cloud_cover < 55 ? 'ok' : 'bad',
    },
    {
      label: 'Seeing',
      value: seeingLabel(seeingNow),
      tone: seeingNow >= 70 ? 'good' : seeingNow >= 45 ? 'ok' : 'bad',
    },
    {
      label: 'Dew',
      value: dewNow >= 70 ? 'High' : dewNow >= 45 ? 'Med' : 'Low',
      tone: dewNow < 45 ? 'good' : dewNow < 70 ? 'ok' : 'bad',
    },
    {
      label: 'Moon',
      value: `${moon.illumination}%`,
      tone: moon.illumination < 30 ? 'good' : moon.illumination < 65 ? 'ok' : 'bad',
    },
    {
      label: 'Bortle',
      value: `~${bortle.class}`,
      tone: bortle.tone,
    },
    {
      label: 'Humidity',
      value: `${Math.round(c.relative_humidity_2m)}%`,
      tone: c.relative_humidity_2m < 60 ? 'good' : c.relative_humidity_2m < 80 ? 'ok' : 'bad',
    },
  ]

  const targets = suggestTargets({
    date: new Date(atMs),
    moonIllum: moon.illumination,
    tonightScore: imagingScore,
    bortleClass: bortle.class,
    lat,
    auroraLikely,
  })

  const tips: string[] = []
  if (isDay) tips.push('Scores below are for tonight’s dark hours.')
  tips.push(goDetail)
  if (bortle.class >= 6) {
    tips.push(`${bortle.label} — drive to darker skies for faint DSOs, or stick to planets/clusters.`)
  } else {
    tips.push(`${bortle.label}. ${bortle.detail}`)
  }
  if (dewNow >= 55) tips.push(dewLabel(dewNow))
  if (seeingNow < 50) tips.push(`Seeing looks ${seeingLabel(seeingNow).toLowerCase()} — shorter exposures help.`)
  if (smokeNote) tips.push(smokeNote)
  if (auroraLikely) tips.push('Aurora possible — check northern horizon and Kp updates.')
  if (bestWindow) {
    tips.push(
      `Best stretch: ${bestWindow.startLabel}–${bestWindow.endLabel} (avg ${bestWindow.avgScore}).`,
    )
  }
  if (moon.illumination >= 70) {
    tips.push('Bright moon — lunar/planetary or narrowband over broadband galaxies.')
  }
  const tipsOut = tips.slice(0, 7)

  const nowScore = nowH?.score ?? 0
  const summary = isDay
    ? `Tonight looks ${gradeLabel(gradeFromScore(tonightScore, true)).toLowerCase()} for stargazing (${tonightScore}/100). ${goLabel}.`
    : `Sky is ${gradeLabel(gradeFromScore(nowScore, true)).toLowerCase()} right now (${nowScore}/100). ${goLabel}.`

  return {
    placeReady: true,
    lat,
    lon,
    nowScore,
    nowGrade: gradeFromScore(nowScore, !isDay),
    tonightScore,
    tonightGrade: gradeFromScore(tonightScore, true),
    imagingScore,
    imagingGrade: gradeFromScore(imagingScore, true),
    go,
    goLabel,
    goDetail,
    moon,
    bortle,
    seeingNow,
    seeingLabel: seeingLabel(seeingNow),
    dewRisk: dewNow,
    dewLabel: dewLabel(dewNow),
    smokeNote,
    sunset,
    sunrise: sunriseNext,
    sunsetMs,
    sunriseNextMs: riseMs,
    darkStartMs,
    darkEndMs,
    darkStartLabel: darkStartMs != null ? rangeLabel(darkStartMs, tz) : null,
    darkEndLabel: darkEndMs != null ? rangeLabel(darkEndMs, tz) : null,
    hours,
    bestWindow,
    nights,
    targets,
    tips: tipsOut,
    factors,
    summary,
    auroraKp: auroraKp ?? undefined,
    auroraLabel:
      auroraKp != null
        ? auroraKp >= 5
          ? `Kp ${auroraKp.toFixed(1)} · storm risk`
          : `Kp ${auroraKp.toFixed(1)}`
        : undefined,
    auroraLikely,
  }
}

const CACHE_KEY = 'solara-stargaze-cache-v1'

export function cacheStargazeBrief(
  placeKey: string,
  brief: StargazeBrief,
): void {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ placeKey, at: Date.now(), brief }),
    )
  } catch {
    /* ignore */
  }
}

export function loadCachedStargazeBrief(
  placeKey: string,
): StargazeBrief | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as { placeKey: string; at: number; brief: StargazeBrief }
    if (o.placeKey !== placeKey) return null
    if (Date.now() - o.at > 3 * 3600_000) return null
    return o.brief
  } catch {
    return null
  }
}
