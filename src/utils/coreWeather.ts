import type { WeatherData } from '../api/types'
import type { Units } from './format'
import {
  convertTemp,
  formatPrecip,
  formatSpeed,
  formatTemp,
  parseWeatherLocal,
} from './format'
import { getWeatherInfo } from './weatherCodes'
import { todayDailyIndex, yesterdayDailyIndex } from './weatherStory'

export type DayPart = 'night' | 'morning' | 'afternoon' | 'evening'

export interface DayPartSummary {
  id: DayPart
  label: string
  emoji: string
  /** Representative hour index in hourly arrays */
  hourIndex: number
  temp: number
  pop: number
  precip: number
  code: number
  wind: number
  summary: string
  isPast: boolean
  isNow: boolean
}

export interface HazardBadge {
  id: string
  label: string
  detail: string
  level: 'info' | 'watch' | 'warn'
}

export interface VsYesterday {
  highDiff: number
  lowDiff: number
  precipDiff: number
  summary: string
}

export interface WeekDayChip {
  date: string
  weekday: string
  code: number
  high: number
  low: number
  pop: number
  precip: number
  isToday: boolean
}

function hourInTz(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date(ms))
  return Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24
}

/** Pick best hour index near target local hour on a given calendar day */
function nearestHourIndex(
  weather: WeatherData,
  dayStr: string,
  targetHour: number,
): number {
  const h = weather.hourly
  let best = -1
  let bestDist = Infinity
  for (let i = 0; i < h.time.length; i++) {
    if (!h.time[i].startsWith(dayStr)) continue
    const ms = parseWeatherLocal(h.time[i], weather.timezone)
    const hr = hourInTz(ms, weather.timezone)
    const dist = Math.abs(hr - targetHour)
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  return best
}

function avgRange(
  weather: WeatherData,
  dayStr: string,
  startH: number,
  endH: number,
  pick: (i: number) => number,
): { avg: number; max: number; code: number; i: number } {
  const h = weather.hourly
  const vals: number[] = []
  let max = -Infinity
  let code = weather.current.weather_code
  let rep = -1
  for (let i = 0; i < h.time.length; i++) {
    if (!h.time[i].startsWith(dayStr)) continue
    const ms = parseWeatherLocal(h.time[i], weather.timezone)
    const hr = hourInTz(ms, weather.timezone)
    if (hr < startH || hr >= endH) continue
    const v = pick(i)
    vals.push(v)
    if (v > max) {
      max = v
      rep = i
      code = h.weather_code[i] ?? code
    }
  }
  if (!vals.length) {
    const fallback = nearestHourIndex(weather, dayStr, Math.floor((startH + endH) / 2))
    return {
      avg: fallback >= 0 ? pick(fallback) : weather.current.temperature_2m,
      max: fallback >= 0 ? pick(fallback) : 0,
      code: fallback >= 0 ? (h.weather_code[fallback] ?? code) : code,
      i: fallback,
    }
  }
  return {
    avg: vals.reduce((a, b) => a + b, 0) / vals.length,
    max: max === -Infinity ? 0 : max,
    code,
    i: rep >= 0 ? rep : 0,
  }
}

/** Morning / afternoon / evening / overnight blocks for today */
export function todayDayParts(weather: WeatherData): DayPartSummary[] {
  const ti = todayDailyIndex(weather)
  const dayStr = weather.daily.time[ti]?.slice(0, 10) ?? ''
  const tz = weather.timezone
  const now = Date.now()
  const nowH = hourInTz(now, tz)

  const defs: {
    id: DayPart
    label: string
    emoji: string
    start: number
    end: number
    target: number
  }[] = [
    { id: 'morning', label: 'Morning', emoji: '🌅', start: 5, end: 12, target: 9 },
    { id: 'afternoon', label: 'Afternoon', emoji: '☀️', start: 12, end: 17, target: 15 },
    { id: 'evening', label: 'Evening', emoji: '🌇', start: 17, end: 21, target: 19 },
    { id: 'night', label: 'Overnight', emoji: '🌙', start: 21, end: 29, target: 23 },
  ]

  return defs.map((d) => {
    // Overnight spans past midnight → use end-of-day hours 21–24
    const start = d.start
    const end = d.id === 'night' ? 24 : d.end
    const temp = avgRange(weather, dayStr, start, end, (i) => weather.hourly.temperature_2m[i])
    const pop = avgRange(weather, dayStr, start, end, (i) => weather.hourly.precipitation_probability[i] ?? 0)
    const precip = avgRange(weather, dayStr, start, end, (i) => weather.hourly.precipitation[i] ?? 0)
    const wind = avgRange(weather, dayStr, start, end, (i) => weather.hourly.wind_speed_10m[i] ?? 0)
    const info = getWeatherInfo(temp.code, d.id !== 'night')
    const isPast = nowH >= end
    const isNow = nowH >= start && nowH < end

    let summary = info.label
    if (pop.max >= 50) summary = `Wet · ${info.label}`
    else if (pop.max >= 30) summary = `Possible showers`

    return {
      id: d.id,
      label: d.label,
      emoji: d.emoji,
      hourIndex: temp.i,
      temp: temp.avg,
      pop: Math.round(pop.max),
      precip: precip.max,
      code: temp.code,
      wind: wind.avg,
      summary,
      isPast,
      isNow,
    }
  })
}

/** Actionable hazard chips from current + daily */
export function hazardBadges(weather: WeatherData, units: Units): HazardBadge[] {
  const c = weather.current
  const ti = todayDailyIndex(weather)
  const d = weather.daily
  const badges: HazardBadge[] = []
  const tempC = c.temperature_2m
  const feels = c.apparent_temperature
  const wind = c.wind_speed_10m
  const gust = c.wind_gusts_10m
  const uvNow = (() => {
    const h = weather.hourly
    const now = Date.now()
    for (let i = 0; i < h.time.length; i++) {
      const ms = parseWeatherLocal(h.time[i], weather.timezone)
      if (ms + 45 * 60 * 1000 >= now) return h.uv_index[i] ?? 0
    }
    return d.uv_index_max[ti] ?? 0
  })()
  const vis = (() => {
    const h = weather.hourly
    const now = Date.now()
    for (let i = 0; i < h.time.length; i++) {
      const ms = parseWeatherLocal(h.time[i], weather.timezone)
      if (ms + 45 * 60 * 1000 >= now) return h.visibility[i]
    }
    return null
  })()

  // Freeze / frost
  if (tempC <= 0 || feels <= -2 || (d.temperature_2m_min[ti] ?? 99) <= 0) {
    badges.push({
      id: 'freeze',
      label: tempC <= 0 ? 'Freezing' : 'Frost risk',
      detail: `Low near ${formatTemp(d.temperature_2m_min[ti], units)}`,
      level: tempC <= -5 ? 'warn' : 'watch',
    })
  }

  // Heat
  if (feels >= 32 || tempC >= 33 || (d.temperature_2m_max[ti] ?? 0) >= 33) {
    badges.push({
      id: 'heat',
      label: feels >= 38 ? 'Extreme heat' : 'Hot',
      detail: `Feels ${formatTemp(feels, units)}`,
      level: feels >= 38 ? 'warn' : 'watch',
    })
  }

  // Wind
  if (gust >= 60 || wind >= 45 || (d.wind_gusts_10m_max[ti] ?? 0) >= 70) {
    badges.push({
      id: 'wind',
      label: gust >= 80 ? 'Damaging wind' : 'Windy',
      detail: `Gusts ${formatSpeed(Math.max(gust, d.wind_gusts_10m_max[ti] ?? 0), units)}`,
      level: gust >= 80 ? 'warn' : 'watch',
    })
  }

  // UV
  if (uvNow >= 6 || (d.uv_index_max[ti] ?? 0) >= 7) {
    badges.push({
      id: 'uv',
      label: uvNow >= 8 ? 'Very high UV' : 'High UV',
      detail: `UV now ~${uvNow.toFixed(0)} · max ${Math.round(d.uv_index_max[ti] ?? uvNow)}`,
      level: uvNow >= 8 ? 'warn' : 'watch',
    })
  }

  // Visibility / fog
  if (vis != null && vis < 2000) {
    badges.push({
      id: 'fog',
      label: vis < 500 ? 'Dense fog' : 'Low visibility',
      detail: `~${vis < 1000 ? `${Math.round(vis)} m` : `${(vis / 1000).toFixed(1)} km`}`,
      level: vis < 500 ? 'warn' : 'watch',
    })
  } else if (c.weather_code === 45 || c.weather_code === 48) {
    badges.push({
      id: 'fog',
      label: 'Fog',
      detail: 'Reduced visibility',
      level: 'watch',
    })
  }

  // Heavy precip today
  const pop = d.precipitation_probability_max[ti] ?? 0
  const precip = d.precipitation_sum[ti] ?? 0
  if (precip >= 15 || (pop >= 70 && precip >= 5)) {
    badges.push({
      id: 'rain',
      label: precip >= 25 ? 'Heavy rain day' : 'Wet day',
      detail: `${formatPrecip(precip, units)} · up to ${pop}%`,
      level: precip >= 25 ? 'warn' : 'watch',
    })
  }

  // Snow
  const snow = d.snowfall_sum[ti] ?? 0
  if (snow >= 1 || c.snowfall > 0) {
    badges.push({
      id: 'snow',
      label: snow >= 5 ? 'Significant snow' : 'Snow',
      detail: `${snow.toFixed(1)} cm expected today`,
      level: snow >= 5 ? 'warn' : 'info',
    })
  }

  // Thunder codes
  const nowMs = Date.now()
  if (
    [95, 96, 99].includes(c.weather_code) ||
    weather.hourly.weather_code.some((code, i) => {
      const ms = parseWeatherLocal(weather.hourly.time[i], weather.timezone)
      return ms >= nowMs && ms < nowMs + 6 * 3600_000 && [95, 96, 99].includes(code)
    })
  ) {
    badges.push({
      id: 'thunder',
      label: 'Thunderstorms',
      detail: 'Possible in the next several hours',
      level: 'warn',
    })
  }

  return badges.slice(0, 6)
}

export function vsYesterday(weather: WeatherData, units: Units): VsYesterday | null {
  const ti = todayDailyIndex(weather)
  const yi = yesterdayDailyIndex(weather)
  if (yi == null) return null
  const d = weather.daily
  const highDiff = Math.round(
    convertTemp(d.temperature_2m_max[ti], units) - convertTemp(d.temperature_2m_max[yi], units),
  )
  const lowDiff = Math.round(
    convertTemp(d.temperature_2m_min[ti], units) - convertTemp(d.temperature_2m_min[yi], units),
  )
  const precipDiff = (d.precipitation_sum[ti] ?? 0) - (d.precipitation_sum[yi] ?? 0)

  let summary: string
  if (Math.abs(highDiff) <= 1 && Math.abs(lowDiff) <= 1) {
    summary = 'Similar to yesterday'
  } else if (highDiff >= 2) {
    summary = `${highDiff}° warmer high than yesterday`
  } else if (highDiff <= -2) {
    summary = `${Math.abs(highDiff)}° cooler high than yesterday`
  } else if (lowDiff >= 2) {
    summary = `Milder overnight (+${lowDiff}° low)`
  } else {
    summary = `Cooler overnight (${lowDiff}° low)`
  }

  return { highDiff, lowDiff, precipDiff, summary }
}

/** Next 7 calendar days including today */
export function weekStrip(weather: WeatherData): WeekDayChip[] {
  const ti = todayDailyIndex(weather)
  const d = weather.daily
  const chips: WeekDayChip[] = []
  for (let i = ti; i < d.time.length && chips.length < 7; i++) {
    chips.push({
      date: d.time[i],
      weekday: i === ti ? 'Today' : new Date(d.time[i] + 'T12:00:00').toLocaleDateString(undefined, {
        weekday: 'short',
        timeZone: weather.timezone,
      }),
      code: d.weather_code[i],
      high: d.temperature_2m_max[i],
      low: d.temperature_2m_min[i],
      pop: d.precipitation_probability_max[i] ?? 0,
      precip: d.precipitation_sum[i] ?? 0,
      isToday: i === ti,
    })
  }
  return chips
}

/** Dew point comfort label */
export function dewPointComfort(dewC: number): { label: string; level: 'dry' | 'ok' | 'humid' | 'muggy' } {
  if (dewC < 10) return { label: 'Dry air', level: 'dry' }
  if (dewC < 16) return { label: 'Comfortable', level: 'ok' }
  if (dewC < 20) return { label: 'A bit humid', level: 'humid' }
  return { label: 'Muggy', level: 'muggy' }
}

export function currentDewPoint(weather: WeatherData): number | null {
  const h = weather.hourly
  const now = Date.now()
  for (let i = 0; i < h.time.length; i++) {
    const ms = parseWeatherLocal(h.time[i], weather.timezone)
    if (ms + 45 * 60 * 1000 >= now) return h.dew_point_2m[i] ?? null
  }
  return h.dew_point_2m[0] ?? null
}
