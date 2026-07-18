import type { AirQualityData, WeatherData } from '../api/types'
import type { Units } from './format'
import { formatSpeed, formatTemp, parseWeatherLocal } from './format'
import { willIGetWet } from './wetSummary'
import { todayDailyIndex } from './weatherStory'

export interface DressAdvice {
  title: string
  summary: string
  items: string[]
  layers: 'light' | 'moderate' | 'warm' | 'winter' | 'hot'
  emoji: string
}

/** Temperatures from APIs are always °C; never treat imperial display values as thresholds. */
function effectiveFeelsC(weather: WeatherData): number {
  const air = weather.current.temperature_2m
  const feels = weather.current.apparent_temperature
  // Guard bad overlays (e.g. stale wind chill on a hot day)
  if (!Number.isFinite(feels)) return air
  if (!Number.isFinite(air)) return feels
  // Feels-like should stay near air temp; if it diverges wildly, trust the air temp
  if (Math.abs(feels - air) > 18) return air
  // Hot day but "feels" much colder → ignore bad chill
  if (air >= 18 && feels < air - 8) return air
  // Cold day but "feels" much hotter → ignore bad humidex
  if (air <= 5 && feels > air + 8) return air
  return feels
}

/** Plain-English outfit advice from current + next ~8h conditions (°C logic) */
export function dressForToday(
  weather: WeatherData,
  units: Units,
  air: AirQualityData | null,
): DressAdvice {
  const c = weather.current
  const airC = c.temperature_2m
  const feels = effectiveFeelsC(weather)
  // Dress for the warmer of now vs today's high when planning the day
  const ti = todayDailyIndex(weather)
  const high = weather.daily.temperature_2m_max[ti]
  const low = weather.daily.temperature_2m_min[ti]
  const guide = Number.isFinite(high) ? Math.max(feels, high * 0.85 + feels * 0.15) : feels

  const wind = c.wind_speed_10m
  const wet = willIGetWet(weather)
  const aqi = air?.current?.us_aqi ?? null

  let maxUv = 0
  const now = Date.now()
  const h = weather.hourly
  for (let i = 0; i < h.time.length; i++) {
    const ms = parseWeatherLocal(h.time[i], weather.timezone)
    if (ms < now - 30 * 60_000) continue
    if (ms > now + 8 * 3600_000) break
    maxUv = Math.max(maxUv, h.uv_index?.[i] ?? 0)
  }

  // Thresholds in °C based on feels / daytime guide temp
  let layers: DressAdvice['layers'] = 'moderate'
  let emoji = '👕'
  if (guide <= -5 || feels <= -5) {
    layers = 'winter'
    emoji = '🧥'
  } else if (guide <= 5 || feels <= 5) {
    layers = 'warm'
    emoji = '🧣'
  } else if (guide <= 12 || feels <= 12) {
    layers = 'moderate'
    emoji = '🧥'
  } else if (guide <= 22) {
    layers = 'light'
    emoji = '👕'
  } else if (guide <= 28) {
    layers = 'hot'
    emoji = '☀️'
  } else {
    layers = 'hot'
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
    if (Number.isFinite(high) && Number.isFinite(low) && high - low >= 10) {
      items.push('Dress in layers — big day/night swing')
    }
  } else if (layers === 'hot' && guide >= 28) {
    items.push('Light, breathable clothes')
    items.push('Stay hydrated if you’re outside long')
    if (guide >= 32) items.push('Limit hard outdoor work in midday heat')
  } else {
    // light / mild-hot
    items.push('T-shirt weather for most people')
    if (guide >= 24) items.push('Shorts are fine if you’re comfortable')
  }

  if (wet.umbrella || wet.level === 'wet') {
    items.push('Umbrella or waterproof shell')
  } else if (wet.level === 'maybe') {
    items.push('Pack a compact umbrella just in case')
  }

  if (wind >= 35) {
    items.push(`Windy (${formatSpeed(wind, units)}) — windproof outer layer helps`)
  } else if (wind >= 22 && feels <= 15) {
    items.push(`Breezy (${formatSpeed(wind, units)}) — may feel cooler`)
  } else if (wind >= 22) {
    items.push(`Breezy (${formatSpeed(wind, units)})`)
  }

  if (maxUv >= 6) items.push('Sunglasses + SPF — UV is strong')
  else if (maxUv >= 3 && guide >= 15) items.push('Sunscreen if you’ll be out midday')

  if (aqi != null && aqi >= 100) {
    items.push(`Air quality elevated (AQI ${aqi}) — limit hard outdoor exercise`)
  }

  const title =
    layers === 'winter'
      ? 'Bundle up'
      : layers === 'warm'
        ? 'Dress warm'
        : layers === 'hot'
          ? guide >= 30
            ? 'Dress for the heat'
            : 'Dress light'
          : wet.level === 'wet'
            ? 'Rain gear day'
            : guide >= 20
              ? 'Dress light'
              : 'Comfortable layers'

  const summary = `Feels like ${formatTemp(feels, units)} · Now ${formatTemp(airC, units)} · H ${formatTemp(high, units)} / L ${formatTemp(low, units)} · ${wet.title}`

  return { title, summary, items: items.slice(0, 5), layers, emoji }
}
