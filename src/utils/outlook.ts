import type { WeatherData } from '../api/types'
import type { Units } from './format'
import { convertTemp, formatPrecip, formatTemp } from './format'
import { getWeatherInfo } from './weatherCodes'

function localWeekday(iso: string, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    }).formatToParts(new Date(iso))
    const w = parts.find((p) => p.type === 'weekday')?.value
    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    }
    return map[w ?? ''] ?? new Date(iso).getDay()
  } catch {
    return new Date(iso).getDay()
  }
}

export function weekendOutlook(weather: WeatherData, units: Units): string {
  const d = weather.daily
  const tz = weather.timezone
  const lines: string[] = []

  const weekendIdx: number[] = []
  for (let i = 0; i < Math.min(d.time.length, 8); i++) {
    const wd = localWeekday(d.time[i], tz)
    if (wd === 0 || wd === 6) weekendIdx.push(i)
  }

  const idxs = weekendIdx.length
    ? weekendIdx.slice(0, 2)
    : [1, 2].filter((i) => i < d.time.length)

  if (!idxs.length) return 'Not enough data for a weekend outlook yet.'

  for (const i of idxs) {
    const info = getWeatherInfo(d.weather_code[i], true)
    const label = new Date(d.time[i]).toLocaleDateString(undefined, {
      weekday: 'long',
      timeZone: tz,
    })
    const hi = formatTemp(d.temperature_2m_max[i], units)
    const lo = formatTemp(d.temperature_2m_min[i], units)
    const pop = d.precipitation_probability_max[i] ?? 0
    const precip = d.precipitation_sum[i] ?? 0
    let rain =
      pop >= 50
        ? `Rain likely (${pop}% chance, ~${formatPrecip(precip, units)})`
        : pop >= 30
          ? `A shower possible (${pop}%)`
          : 'Mostly dry'
    if ((d.snowfall_sum[i] ?? 0) > 0.1) rain = `Snow possible (${pop}%)`
    lines.push(`${label}: ${info.label}, high ${hi} / low ${lo}. ${rain}.`)
  }

  const avgs = idxs.map((i) => convertTemp(d.temperature_2m_max[i], units))
  const avgHi = avgs.reduce((a, b) => a + b, 0) / avgs.length
  const warm = units === 'metric' ? avgHi >= 25 : avgHi >= 78
  const cold = units === 'metric' ? avgHi <= 10 : avgHi <= 50
  const wet = idxs.some((i) => (d.precipitation_probability_max[i] ?? 0) >= 50)

  let vibe = 'A mixed weekend overall.'
  if (warm && !wet) vibe = 'Looks like a warm, outdoor-friendly weekend.'
  else if (cold && wet) vibe = 'Bundle up — cool and unsettled.'
  else if (wet) vibe = 'Plan indoor backups; wet weather is in play.'
  else if (warm) vibe = 'Warm stretch with only minor weather nuisances.'
  else if (cold) vibe = 'On the cool side — dress in layers.'
  else vibe = 'Mild weekend — nothing too extreme in the signal.'

  return `${vibe}\n\n${lines.join('\n')}`
}

export function dayCompareSummary(weather: WeatherData, units: Units): string {
  const d = weather.daily
  if (d.time.length < 2) return ''
  const t0 = convertTemp(d.temperature_2m_max[0], units)
  const t1 = convertTemp(d.temperature_2m_max[1], units)
  const diff = Math.round(t1 - t0)
  const unit = units === 'metric' ? '°C' : '°F'
  if (Math.abs(diff) < 2) {
    return `Tomorrow looks similar to today (high near ${formatTemp(d.temperature_2m_max[1], units)}).`
  }
  if (diff > 0) {
    return `Tomorrow warms up by about ${diff}${unit} (high ${formatTemp(d.temperature_2m_max[1], units)}).`
  }
  return `Tomorrow cools by about ${Math.abs(diff)}${unit} (high ${formatTemp(d.temperature_2m_max[1], units)}).`
}
