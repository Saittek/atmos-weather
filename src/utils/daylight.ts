/**
 * Day vs night for icons/labels — always from location sunrise/sunset,
 * not the API is_day flag (which is often wrong after blends / TZ bugs).
 */
import type { WeatherData } from '../api/types'
import { parseWeatherLocal } from './format'
import { todayDailyIndex } from './weatherStory'

/** Parse Open-Meteo / ECCC sunrise-sunset strings to UTC ms */
export function parseSunTime(iso: string | undefined | null, timeZone?: string): number | null {
  if (!iso || typeof iso !== 'string') return null
  const s = iso.trim()
  if (!s) return null

  // Absolute instants (ECCC riseSet often ends with Z)
  if (/[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
    const t = Date.parse(s)
    return Number.isFinite(t) ? t : null
  }

  // Wall clock in forecast timezone (Open-Meteo with timezone=…)
  if (s.includes('T')) {
    const t = parseWeatherLocal(s, timeZone)
    return Number.isFinite(t) ? t : null
  }

  const t = Date.parse(s)
  return Number.isFinite(t) ? t : null
}

function calendarDayInTz(ms: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || undefined,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms))
}

/**
 * True when the sun is above the horizon at `atMs` for this location,
 * using daily sunrise/sunset arrays.
 */
export function isSunUpAt(weather: WeatherData, atMs: number = Date.now()): boolean {
  const tz = weather.timezone
  const d = weather.daily
  const sunrises = d?.sunrise
  const sunsets = d?.sunset

  if (sunrises?.length && sunsets?.length) {
    const dayStr = calendarDayInTz(atMs, tz)
    let idx = d.time?.findIndex((t) => t.startsWith(dayStr)) ?? -1
    if (idx < 0) idx = todayDailyIndex(weather)

    // Check today first, then neighbors (late evening / early morning edges)
    const order = [idx, idx - 1, idx + 1].filter(
      (i) => i >= 0 && i < sunrises.length && i < sunsets.length,
    )

    for (const i of order) {
      const rise = parseSunTime(sunrises[i], tz)
      const set = parseSunTime(sunsets[i], tz)
      if (rise == null || set == null) continue
      if (set > rise) {
        if (atMs >= rise && atMs < set) return true
        // On this calendar day but outside the window → night for that day
        if (d.time?.[i]) {
          const dayStart = parseWeatherLocal(
            `${d.time[i].slice(0, 10)}T00:00:00`,
            tz,
          )
          const dayEnd = dayStart + 24 * 60 * 60 * 1000
          if (atMs >= dayStart && atMs < dayEnd) return false
        }
      }
    }

    // Any day whose rise→set contains atMs (handles polar / odd offsets)
    for (let i = 0; i < sunrises.length; i++) {
      const rise = parseSunTime(sunrises[i], tz)
      const set = parseSunTime(sunsets[i], tz)
      if (rise == null || set == null || set <= rise) continue
      if (atMs >= rise && atMs < set) return true
    }

    // We had sun tables but no containing window → night
    return false
  }

  // No sunrise data: nearest hourly is_day, then current
  const h = weather.hourly
  if (h?.time?.length && h.is_day?.length) {
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < h.time.length; i++) {
      const t = parseWeatherLocal(h.time[i], tz)
      const dist = Math.abs(t - atMs)
      if (dist < bestDist) {
        bestDist = dist
        best = i
      }
    }
    if (h.is_day[best] != null) return h.is_day[best] === 1
  }

  if (weather.current?.is_day != null) return weather.current.is_day === 1
  // Safe default: day (avoids moon while sun is out when data is missing)
  return true
}

/** Convenience for “right now” at the forecast location */
export function isDaytimeNow(weather: WeatherData): boolean {
  return isSunUpAt(weather, Date.now())
}
