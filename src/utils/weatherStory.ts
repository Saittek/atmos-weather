import type { WeatherData } from '../api/types'
import type { Units } from './format'
import { convertTemp, formatTemp, parseWeatherLocal } from './format'
import {
  displayOptsFromWeather,
  effectiveWeatherCode,
  getWeatherInfo,
} from './weatherCodes'
import { isDaytimeNow } from './daylight'
import type { AirQualityData } from '../api/types'
import { willIGetWet } from './wetSummary'
import { precipTimingShort } from './precipTiming'

/** Index of "today" in daily arrays when past_days may prepend history */
export function todayDailyIndex(weather: WeatherData): number {
  const tz = weather.timezone
  const now = new Date()
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now) // YYYY-MM-DD

  const idx = weather.daily.time.findIndex((t) => t.startsWith(todayStr))
  return idx >= 0 ? idx : 0
}

export function yesterdayDailyIndex(weather: WeatherData): number | null {
  const today = todayDailyIndex(weather)
  return today > 0 ? today - 1 : null
}

export function weatherStory(
  weather: WeatherData,
  units: Units,
  placeName: string,
  air?: AirQualityData | null,
): string {
  const ti = todayDailyIndex(weather)
  const d = weather.daily
  const c = weather.current
  const displayCode = effectiveWeatherCode(
    c.weather_code,
    displayOptsFromWeather(weather, air),
  )
  const info = getWeatherInfo(displayCode, isDaytimeNow(weather))
  const wet = willIGetWet(weather)
  const hi = formatTemp(d.temperature_2m_max[ti], units)
  const lo = formatTemp(d.temperature_2m_min[ti], units)
  const pop = d.precipitation_probability_max[ti] ?? 0
  const wind = d.wind_speed_10m_max[ti] ?? c.wind_speed_10m
  const uv = d.uv_index_max[ti] ?? 0

  const parts: string[] = []
  parts.push(
    `Right now in ${placeName}: ${info.description.toLowerCase()}, ${formatTemp(c.temperature_2m, units)} (feels ${formatTemp(c.apparent_temperature, units)}).`,
  )
  parts.push(`Today’s range is about ${lo} to ${hi}.`)

  if (pop >= 50 || (d.precipitation_sum[ti] ?? 0) >= 1) {
    parts.push(`Rain is in the picture (up to ${pop}% chance).`)
  } else if (pop >= 25) {
    parts.push(`A slight chance of showers (${pop}%).`)
  } else {
    parts.push('Precipitation chances look low.')
  }

  parts.push(wet.detail)

  if (uv >= 7) parts.push(`UV peaks near ${uv.toFixed(0)} — sun protection midday.`)
  if (wind >= 40) parts.push('Breezy to windy at times — secure loose outdoor items.')

  const yIdx = yesterdayDailyIndex(weather)
  if (yIdx != null) {
    const yHi = convertTemp(d.temperature_2m_max[yIdx], units)
    const tHi = convertTemp(d.temperature_2m_max[ti], units)
    const diff = Math.round(tHi - yHi)
    if (Math.abs(diff) >= 2) {
      parts.push(
        diff > 0
          ? `Running about ${diff}° warmer than yesterday’s high.`
          : `About ${Math.abs(diff)}° cooler than yesterday’s high.`,
      )
    } else {
      parts.push('Similar temperatures to yesterday.')
    }
  }

  return parts.join(' ')
}

export function nextPrecipLabel(weather: WeatherData): string | null {
  const short = precipTimingShort(weather)
  if (short) return short
  const h = weather.hourly
  const tz = weather.timezone
  const now = Date.now()
  for (let i = 0; i < h.time.length; i++) {
    const ms = parseWeatherLocal(h.time[i], tz)
    if (ms + 60 * 60 * 1000 < now) continue
    const mm = h.precipitation[i] ?? 0
    const pop = h.precipitation_probability[i] ?? 0
    if (mm >= 0.2 || pop >= 50) {
      const mins = Math.max(0, Math.round((ms - now) / 60000))
      if (mins < 45) return mm >= 0.2 ? 'Rain in the next hour' : `Showers possible soon (${pop}%)`
      const label = new Date(ms).toLocaleTimeString(undefined, {
        hour: 'numeric',
        timeZone: tz,
      })
      return `Next rain risk ~${label}`
    }
  }
  return null
}

export function pressureTrend(weather: WeatherData): {
  label: string
  detail: string
  dir: 'up' | 'down' | 'steady'
} {
  const h = weather.hourly
  const tz = weather.timezone
  const now = Date.now()
  const points: { ms: number; p: number }[] = []
  for (let i = 0; i < h.time.length; i++) {
    const ms = parseWeatherLocal(h.time[i], tz)
    if (ms > now + 60 * 60 * 1000) continue
    if (ms < now - 6 * 60 * 60 * 1000) continue
    const p = h.pressure_msl[i]
    if (p != null) points.push({ ms, p })
  }
  if (points.length < 2) {
    return {
      label: 'Steady',
      detail: `${Math.round(weather.current.pressure_msl)} hPa`,
      dir: 'steady',
    }
  }
  points.sort((a, b) => a.ms - b.ms)
  const delta = points[points.length - 1].p - points[0].p
  if (delta > 1.5)
    return {
      label: 'Rising',
      detail: `+${delta.toFixed(1)} hPa over ~6h — often improving weather`,
      dir: 'up',
    }
  if (delta < -1.5)
    return {
      label: 'Falling',
      detail: `${delta.toFixed(1)} hPa over ~6h — weather may deteriorate`,
      dir: 'down',
    }
  return {
    label: 'Steady',
    detail: `${Math.round(weather.current.pressure_msl)} hPa, little change`,
    dir: 'steady',
  }
}
