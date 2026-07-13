import type { AirQualityData, WeatherData } from '../api/types'
import type { Units } from './format'
import {
  formatSpeed,
  formatTemp,
  hasPrecipMm,
  parseWeatherLocal,
} from './format'
import { willIGetWet } from './wetSummary'

export type ActivityModeId = 'commute' | 'school' | 'outdoor' | 'evening'

export interface ActivityMode {
  id: ActivityModeId
  label: string
  emoji: string
  blurb: string
}

export const ACTIVITY_MODES: ActivityMode[] = [
  { id: 'commute', label: 'Commute', emoji: '🚗', blurb: 'Leave ~7:30 · 30–45 min' },
  { id: 'school', label: 'School run', emoji: '🎒', blurb: 'Pickup/drop ~8:00 & 15:00' },
  { id: 'outdoor', label: 'Outdoor', emoji: '🏃', blurb: 'Next 3 hours outside' },
  { id: 'evening', label: 'Evening plans', emoji: '🌆', blurb: 'After 17:00 today' },
]

export interface ModeAdvice {
  mode: ActivityMode
  verdict: 'go' | 'caution' | 'avoid'
  title: string
  points: string[]
}

function hoursInWindow(
  weather: WeatherData,
  startH: number,
  endH: number,
): number[] {
  const tz = weather.timezone
  const h = weather.hourly
  const idxs: number[] = []
  const now = Date.now()
  for (let i = 0; i < h.time.length; i++) {
    const ms = parseWeatherLocal(h.time[i], tz)
    if (ms < now - 30 * 60_000) continue
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date(ms))
    const hr = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24
    if (hr >= startH && hr < endH) idxs.push(i)
    if (idxs.length >= 6) break
  }
  return idxs
}

export function adviseActivityMode(
  modeId: ActivityModeId,
  weather: WeatherData,
  units: Units,
  air: AirQualityData | null,
): ModeAdvice {
  const mode = ACTIVITY_MODES.find((m) => m.id === modeId)!
  const wet = willIGetWet(weather)
  const aqi = air?.current?.us_aqi ?? null

  let idxs: number[] = []
  if (modeId === 'commute') idxs = hoursInWindow(weather, 7, 9)
  else if (modeId === 'school')
    idxs = [...hoursInWindow(weather, 7, 9), ...hoursInWindow(weather, 14, 16)]
  else if (modeId === 'outdoor') {
    const now = Date.now()
    const h = weather.hourly
    for (let i = 0; i < h.time.length && idxs.length < 4; i++) {
      const ms = parseWeatherLocal(h.time[i], weather.timezone)
      if (ms >= now && ms < now + 3 * 3600_000) idxs.push(i)
    }
  } else idxs = hoursInWindow(weather, 17, 22)

  if (!idxs.length) {
    return {
      mode,
      verdict: 'caution',
      title: 'Limited forecast detail for that window',
      points: ['Check radar before you leave', wet.detail],
    }
  }

  const precip = Math.max(...idxs.map((i) => weather.hourly.precipitation[i] ?? 0))
  const pop = Math.max(
    ...idxs.map((i) => weather.hourly.precipitation_probability[i] ?? 0),
  )
  const gust = Math.max(...idxs.map((i) => weather.hourly.wind_gusts_10m[i] ?? 0))
  const uv = Math.max(...idxs.map((i) => weather.hourly.uv_index[i] ?? 0))
  const temp = idxs.map((i) => weather.hourly.temperature_2m[i]).filter((t) => t != null)
  const avgT = temp.length ? temp.reduce((a, b) => a + b, 0) / temp.length : weather.current.temperature_2m
  const vis = Math.min(
    ...idxs.map((i) => weather.hourly.visibility[i] ?? 20000),
  )

  const points: string[] = []
  let score = 0

  if (hasPrecipMm(precip) || pop >= 50 || wet.umbrella) {
    score += pop >= 70 || precip >= 2 ? 2 : 1
    points.push(
      wet.umbrella
        ? 'Bring rain gear / umbrella'
        : `Wet risk (up to ${pop}% · ~${precip.toFixed(1)} mm)`,
    )
  } else {
    points.push('Looks mostly dry for that window')
  }

  if (gust >= 50) {
    score += 2
    points.push(`Windy — gusts ${formatSpeed(gust, units)}`)
  } else if (gust >= 35) {
    score += 1
    points.push(`Breezy · gusts ${formatSpeed(gust, units)}`)
  }

  if (modeId === 'outdoor' && uv >= 6) {
    score += 1
    points.push(`UV up to ${uv.toFixed(0)} — sunscreen / hat`)
  }

  if (vis < 2000) {
    score += 2
    points.push('Low visibility — drive carefully')
  }

  if (aqi != null && aqi >= 100) {
    score += aqi >= 150 ? 2 : 1
    points.push(`Air quality AQI ${aqi} — sensitive groups limit outdoor time`)
  }

  points.push(`About ${formatTemp(avgT, units)} during the window`)

  const verdict: ModeAdvice['verdict'] =
    score >= 4 ? 'avoid' : score >= 2 ? 'caution' : 'go'
  const title =
    verdict === 'go'
      ? 'Good to go'
      : verdict === 'caution'
        ? 'Go with a plan'
        : 'Consider rescheduling'

  return { mode, verdict, title, points: points.slice(0, 5) }
}
