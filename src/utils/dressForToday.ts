import type { AirQualityData, WeatherData } from '../api/types'
import type { Units } from './format'
import { formatSpeed, formatTemp, parseWeatherLocal } from './format'
import { willIGetWet } from './wetSummary'
import { todayDailyIndex } from './weatherStory'

export interface DressAdvice {
  title: string
  summary: string
  items: string[]
  layers: 'light' | 'moderate' | 'warm' | 'winter'
  emoji: string
}

/** Plain-English outfit advice from current + next ~8h conditions */
export function dressForToday(
  weather: WeatherData,
  units: Units,
  air: AirQualityData | null,
): DressAdvice {
  const c = weather.current
  const feels = c.apparent_temperature
  const wind = c.wind_speed_10m
  const wet = willIGetWet(weather)
  const ti = todayDailyIndex(weather)
  const high = weather.daily.temperature_2m_max[ti]
  const low = weather.daily.temperature_2m_min[ti]
  const aqi = air?.current?.us_aqi ?? null

  // Peak UV next ~8h
  let maxUv = 0
  const now = Date.now()
  const h = weather.hourly
  for (let i = 0; i < h.time.length; i++) {
    const ms = parseWeatherLocal(h.time[i], weather.timezone)
    if (ms < now - 30 * 60_000) continue
    if (ms > now + 8 * 3600_000) break
    maxUv = Math.max(maxUv, h.uv_index?.[i] ?? 0)
  }

  let layers: DressAdvice['layers'] = 'moderate'
  let emoji = '👕'
  if (feels <= 0) {
    layers = 'winter'
    emoji = '🧥'
  } else if (feels <= 8) {
    layers = 'warm'
    emoji = '🧣'
  } else if (feels <= 16) {
    layers = 'moderate'
    emoji = '🧥'
  } else if (feels <= 24) {
    layers = 'light'
    emoji = '👕'
  } else {
    layers = 'light'
    emoji = '🩳'
  }

  const items: string[] = []

  if (layers === 'winter') {
    items.push('Heavy coat, hat, gloves')
    items.push('Warm layers under your outer shell')
  } else if (layers === 'warm') {
    items.push('Warm jacket or heavy hoodie')
    items.push('Long pants — it’s chilly out')
  } else if (layers === 'moderate') {
    items.push('Light jacket or sweater you can peel off')
    if (high - low >= 10) items.push('Dress in layers — big day/night swing')
  } else if (feels > 26) {
    items.push('Light, breathable clothes')
    items.push('Stay hydrated if you’re outside long')
  } else {
    items.push('T-shirt weather for most people')
  }

  if (wet.umbrella || wet.level === 'wet') {
    items.push('Umbrella or waterproof shell')
  } else if (wet.level === 'maybe') {
    items.push('Pack a compact umbrella just in case')
  }

  if (wind >= 35) {
    items.push(`Windy (${formatSpeed(wind, units)}) — windproof outer layer helps`)
  } else if (wind >= 22) {
    items.push(`Breezy (${formatSpeed(wind, units)})`)
  }

  if (maxUv >= 6) items.push('Sunglasses + SPF — UV is strong')
  else if (maxUv >= 3) items.push('Sunscreen if you’ll be out midday')

  if (aqi != null && aqi >= 100) {
    items.push(`Air quality elevated (AQI ${aqi}) — limit hard outdoor exercise`)
  }

  const title =
    layers === 'winter'
      ? 'Bundle up'
      : layers === 'warm'
        ? 'Dress warm'
        : feels > 26
          ? 'Dress light'
          : wet.level === 'wet'
            ? 'Rain gear day'
            : 'Comfortable layers'

  const summary = `Feels like ${formatTemp(feels, units)} · H ${formatTemp(high, units)} / L ${formatTemp(low, units)} · ${wet.title}`

  return { title, summary, items: items.slice(0, 5), layers, emoji }
}
