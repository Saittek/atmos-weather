/**
 * Stargazing / astrophotography conditions from Open-Meteo-style forecast.
 * Score 0–100 (higher = better sky). Moon illumination hurts DSO imaging.
 */
import type { WeatherData } from '../api/types'
import { parseSunTime } from './daylight'
import { parseWeatherLocal } from './format'
import { moonPhase } from './moon'
import { todayDailyIndex } from './weatherStory'

export type StargazeGrade = 'excellent' | 'good' | 'fair' | 'poor' | 'daylight'

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
}

export interface StargazeWindow {
  startMs: number
  endMs: number
  startLabel: string
  endLabel: string
  avgScore: number
  hours: number
}

export interface StargazeBrief {
  placeReady: boolean
  nowScore: number
  nowGrade: StargazeGrade
  tonightScore: number
  tonightGrade: StargazeGrade
  moon: ReturnType<typeof moonPhase>
  sunset?: string
  sunrise?: string
  sunsetMs: number | null
  sunriseNextMs: number | null
  /** Approx astronomical dark start (sunset + ~80 min) */
  darkStartMs: number | null
  darkEndMs: number | null
  darkStartLabel: string | null
  darkEndLabel: string | null
  hours: StargazeHour[]
  bestWindow: StargazeWindow | null
  tips: string[]
  factors: { label: string; value: string; tone: 'good' | 'ok' | 'bad' }[]
  summary: string
}

const ASTRONOMICAL_TWILIGHT_MS = 80 * 60_000 // ~1h20 after sunset / before sunrise

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

/**
 * Component score for one hour. Moon is applied as a separate soft penalty
 * so “planetary” nights with a bright moon still score if clear.
 */
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
}): number {
  if (!opts.isNight) return 0

  let score = 100

  // Clouds dominate
  const cloud = clamp(opts.cloud, 0, 100)
  if (cloud <= 10) score -= cloud * 0.4
  else if (cloud <= 30) score -= 4 + (cloud - 10) * 1.1
  else if (cloud <= 60) score -= 26 + (cloud - 30) * 1.35
  else score -= 66 + (cloud - 60) * 0.85

  // Humidity → transparency proxy
  const rh = clamp(opts.humidity, 0, 100)
  if (rh > 55) score -= (rh - 55) * 0.55
  if (rh > 85) score -= 8

  // Wind → tracking / seeing proxy
  const wind = Math.max(0, opts.windKmh)
  if (wind > 15) score -= (wind - 15) * 0.9
  if (wind > 35) score -= 12
  if (wind > 50) score -= 15

  // Precip kills the night
  const pop = clamp(opts.pop, 0, 100)
  if (pop >= 20) score -= (pop - 15) * 0.7
  if (opts.precipMm >= 0.1) score -= 25
  if (opts.precipMm >= 0.5) score -= 30

  // Visibility
  const vis = opts.visibilityM > 0 ? opts.visibilityM : 20000
  if (vis < 8000) score -= 18
  else if (vis < 12000) score -= 8

  // Moon wash for DSOs (soft — clear full moon can still be “good” for planets)
  const illum = clamp(opts.moonIllum, 0, 100)
  if (illum > 25) score -= (illum - 25) * 0.28
  if (illum > 70) score -= 6

  // Prefer true astronomical dark over civil twilight
  if (!opts.isDark) score -= 12

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

function findBestWindow(hours: StargazeHour[]): StargazeWindow | null {
  const night = hours.filter((h) => h.isNight && h.score >= 40)
  if (night.length < 2) {
    // Allow shorter window if one solid hour
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

  // Sliding window of consecutive night hours, maximize avg * sqrt(length)
  let best: StargazeWindow | null = null
  let bestMetric = -1
  for (let i = 0; i < night.length; i++) {
    let sum = 0
    for (let j = i; j < night.length; j++) {
      // Must be consecutive in original hours list
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

function buildTips(brief: {
  tonightScore: number
  moonIllum: number
  bestWindow: StargazeWindow | null
  cloudNow: number
  humidityNow: number
  windNow: number
  popMaxNight: number
  isDay: boolean
}): string[] {
  const tips: string[] = []
  if (brief.isDay) {
    tips.push('Sun is up — scores below are for tonight’s dark hours.')
  }
  if (brief.tonightScore >= 80) {
    tips.push('Great night for deep-sky targets if you have dark skies nearby.')
  } else if (brief.tonightScore >= 62) {
    tips.push('Solid conditions — prioritize brighter DSOs and planets.')
  } else if (brief.tonightScore >= 42) {
    tips.push('Mixed skies — short imaging sessions between clouds may work.')
  } else {
    tips.push('Tough night for faint objects — consider planets, Moon, or waiting.')
  }

  if (brief.moonIllum >= 70) {
    tips.push(
      `Bright moon (~${brief.moonIllum}% lit) will wash out faint nebulae — try planets, clusters, or narrowband.`,
    )
  } else if (brief.moonIllum <= 15) {
    tips.push('Dark moon window — ideal for galaxies and faint nebulae.')
  }

  if (brief.cloudNow >= 60) {
    tips.push('Clouds are high right now — check the hourly strip for clearer gaps.')
  }
  if (brief.humidityNow >= 85) {
    tips.push('High humidity can haze the sky and dew up optics — pack a dew heater.')
  }
  if (brief.windNow >= 30) {
    tips.push('Breezy — use a sturdy mount and shorter exposures if tracking struggles.')
  }
  if (brief.popMaxNight >= 40) {
    tips.push('Precip chance overnight — keep gear covered and watch radar.')
  }
  if (brief.bestWindow) {
    tips.push(
      `Best stretch looks like ${brief.bestWindow.startLabel}–${brief.bestWindow.endLabel} (score ~${brief.bestWindow.avgScore}).`,
    )
  }
  tips.push('Light pollution still matters — darker sites beat suburbs even on clear nights.')
  return tips.slice(0, 6)
}

export function buildStargazeBrief(weather: WeatherData, atMs = Date.now()): StargazeBrief {
  const tz = weather.timezone
  const ti = todayDailyIndex(weather)
  const moon = moonPhase(new Date(atMs))
  const h = weather.hourly
  const sunset = weather.daily.sunset[ti]
  const sunriseToday = weather.daily.sunrise[ti]
  const sunriseNext = weather.daily.sunrise[ti + 1] ?? sunriseToday

  const sunsetMs = parseSunTime(sunset, tz)
  const sunriseNextMs = parseSunTime(sunriseNext, tz)
  // If next sunrise is before sunset (data hole), fall back +12h from sunset
  let riseMs = sunriseNextMs
  if (sunsetMs != null && riseMs != null && riseMs <= sunsetMs) {
    riseMs = sunsetMs + 12 * 3600_000
  }
  const darkStartMs = sunsetMs != null ? sunsetMs + ASTRONOMICAL_TWILIGHT_MS : null
  const darkEndMs = riseMs != null ? riseMs - ASTRONOMICAL_TWILIGHT_MS : null

  const hours: StargazeHour[] = []
  const horizon = atMs + 36 * 3600_000
  for (let i = 0; i < h.time.length; i++) {
    const ms = parseWeatherLocal(h.time[i], tz)
    if (ms < atMs - 30 * 60_000) continue
    if (ms > horizon) break

    const cloud = h.cloud_cover[i] ?? weather.current.cloud_cover ?? 50
    const humidity = h.relative_humidity_2m[i] ?? weather.current.relative_humidity_2m ?? 60
    const windKmh = h.wind_speed_10m[i] ?? weather.current.wind_speed_10m ?? 0
    const pop = h.precipitation_probability[i] ?? 0
    const precipMm = h.precipitation[i] ?? 0
    const visibilityM = h.visibility[i] ?? 20000

    // Night = after sunset or before next sunrise
    let isNight = true
    if (sunsetMs != null && riseMs != null) {
      // Between today's sunset and next sunrise
      isNight = ms >= sunsetMs && ms < riseMs
      // Also allow early morning before today's sunrise if still before sunset chain
      const sunriseTodayMs = parseSunTime(sunriseToday, tz)
      if (sunriseTodayMs != null && ms < sunriseTodayMs) isNight = true
      if (ms >= riseMs) {
        // Next calendar day — use following sunset if available
        const nextSet = parseSunTime(weather.daily.sunset[ti + 1], tz)
        const nextRise = parseSunTime(weather.daily.sunrise[ti + 2] ?? weather.daily.sunrise[ti + 1], tz)
        if (nextSet != null && nextRise != null) {
          isNight = ms >= nextSet && ms < nextRise
        } else {
          isNight = h.is_day?.[i] === 0
        }
      }
    } else if (h.is_day?.[i] != null) {
      isNight = h.is_day[i] === 0
    }

    const isDark =
      isNight &&
      (darkStartMs == null || darkEndMs == null
        ? isNight
        : ms >= darkStartMs && ms < darkEndMs)

    const score = scoreSkyHour({
      cloud,
      humidity,
      windKmh,
      pop,
      precipMm,
      visibilityM,
      moonIllum: moon.illumination,
      isNight,
      isDark,
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
    })
  }

  // Current hour score
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

  // Tonight = from next dark start (or now if already dark) through sunrise
  const nightHours = hours.filter((x) => x.isNight)
  const tonightPool =
    darkStartMs != null
      ? nightHours.filter((x) => x.ms >= Math.min(atMs, darkStartMs) - 3600_000)
      : nightHours
  const tonightScore =
    tonightPool.length > 0
      ? Math.round(tonightPool.reduce((s, x) => s + x.score, 0) / tonightPool.length)
      : nowH?.score ?? 0

  const bestWindow = findBestWindow(hours)

  const c = weather.current
  const factors: StargazeBrief['factors'] = [
    {
      label: 'Clouds',
      value: `${Math.round(c.cloud_cover)}%`,
      tone: c.cloud_cover < 25 ? 'good' : c.cloud_cover < 55 ? 'ok' : 'bad',
    },
    {
      label: 'Humidity',
      value: `${Math.round(c.relative_humidity_2m)}%`,
      tone: c.relative_humidity_2m < 60 ? 'good' : c.relative_humidity_2m < 80 ? 'ok' : 'bad',
    },
    {
      label: 'Wind',
      value: `${Math.round(c.wind_speed_10m)} km/h`,
      tone: c.wind_speed_10m < 18 ? 'good' : c.wind_speed_10m < 32 ? 'ok' : 'bad',
    },
    {
      label: 'Moon',
      value: `${moon.illumination}% lit`,
      tone: moon.illumination < 30 ? 'good' : moon.illumination < 65 ? 'ok' : 'bad',
    },
  ]

  const tips = buildTips({
    tonightScore,
    moonIllum: moon.illumination,
    bestWindow,
    cloudNow: c.cloud_cover,
    humidityNow: c.relative_humidity_2m,
    windNow: c.wind_speed_10m,
    popMaxNight: Math.max(0, ...nightHours.map((x) => x.pop)),
    isDay,
  })

  const nowScore = nowH?.score ?? 0
  const nowGrade = gradeFromScore(nowScore, !isDay)
  const tonightGrade = gradeFromScore(tonightScore, true)

  let summary = ''
  if (isDay) {
    summary =
      tonightGrade === 'excellent' || tonightGrade === 'good'
        ? `Tonight looks ${gradeLabel(tonightGrade).toLowerCase()} for stargazing — clear enough after dark.`
        : `Tonight looks ${gradeLabel(tonightGrade).toLowerCase()} for deep-sky work. Check the hourly strip for gaps.`
  } else {
    summary =
      nowGrade === 'excellent' || nowGrade === 'good'
        ? `Skies are ${gradeLabel(nowGrade).toLowerCase()} right now — good window if you’re free.`
        : `Conditions are ${gradeLabel(nowGrade).toLowerCase()} right now. ${bestWindow ? `Better stretch later: ${bestWindow.startLabel}.` : 'Stay flexible.'}`
  }

  return {
    placeReady: true,
    nowScore,
    nowGrade,
    tonightScore,
    tonightGrade,
    moon,
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
    tips,
    factors,
    summary,
  }
}
