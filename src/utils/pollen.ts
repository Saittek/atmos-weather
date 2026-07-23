import type { AirQualityData, WeatherData } from '../api/types'
import { parseWeatherLocal } from './format'

export interface PollenItem {
  name: string
  value: number
  level: 'none' | 'low' | 'moderate' | 'high' | 'very high'
  color: string
  key: string
}

export type AllergyRiskLevel = 'low' | 'moderate' | 'high' | 'very high' | 'unknown'

export interface AllergyRisk {
  level: AllergyRiskLevel
  color: string
  label: string
  score: number
  topName: string | null
}

export interface PollenPeakHour {
  time: string
  ms: number
  name: string
  value: number
}

export interface MoldRisk {
  level: 'low' | 'moderate' | 'high'
  color: string
  label: string
  detail: string
}

const LEVELS: { max: number; level: PollenItem['level']; color: string }[] = [
  { max: 0, level: 'none', color: '#64748b' },
  { max: 20, level: 'low', color: '#22c55e' },
  { max: 50, level: 'moderate', color: '#eab308' },
  { max: 100, level: 'high', color: '#f97316' },
  { max: Infinity, level: 'very high', color: '#ef4444' },
]

const RISK_META: Record<
  Exclude<AllergyRiskLevel, 'unknown'>,
  { color: string; label: string }
> = {
  low: { color: '#22c55e', label: 'Low' },
  moderate: { color: '#eab308', label: 'Moderate' },
  high: { color: '#f97316', label: 'High' },
  'very high': { color: '#ef4444', label: 'Very high' },
}

function levelOf(v: number): Pick<PollenItem, 'level' | 'color'> {
  for (const L of LEVELS) {
    if (v <= L.max) return { level: L.level, color: L.color }
  }
  return { level: 'very high', color: '#ef4444' }
}

const KEYS: { key: keyof AirQualityData['current']; name: string }[] = [
  { key: 'grass_pollen', name: 'Grass' },
  { key: 'birch_pollen', name: 'Birch' },
  { key: 'alder_pollen', name: 'Alder' },
  { key: 'olive_pollen', name: 'Olive' },
  { key: 'mugwort_pollen', name: 'Mugwort' },
  { key: 'ragweed_pollen', name: 'Ragweed' },
]

export function extractPollen(air: AirQualityData | null): PollenItem[] {
  if (!air?.current) return []
  const items: PollenItem[] = []
  for (const { key, name } of KEYS) {
    const raw = air.current[key]
    if (raw == null || Number.isNaN(Number(raw))) continue
    const value = Math.round(Number(raw))
    const { level, color } = levelOf(value)
    items.push({ name, value, level, color, key: String(key) })
  }
  return items.sort((a, b) => b.value - a.value)
}

export function overallAllergyRisk(items: PollenItem[]): AllergyRisk {
  if (!items.length) {
    return {
      level: 'unknown',
      color: '#94a3b8',
      label: 'No data',
      score: 0,
      topName: null,
    }
  }
  const top = items[0]
  const score = items.reduce((s, p) => s + p.value, 0)
  // Rank by worst type, nudge up if several allergens are elevated
  let level: Exclude<AllergyRiskLevel, 'unknown'> =
    top.level === 'none' ? 'low' : top.level
  const elevated = items.filter((p) => p.level === 'high' || p.level === 'very high')
  if (elevated.length >= 2 && level === 'high') level = 'very high'
  const modPlus = items.filter(
    (p) => p.level === 'moderate' || p.level === 'high' || p.level === 'very high',
  )
  if (level === 'low' && modPlus.length >= 2) level = 'moderate'

  const meta = RISK_META[level]
  return {
    level,
    color: meta.color,
    label: meta.label,
    score,
    topName: top.value > 0 ? top.name : null,
  }
}

export function pollenAdvice(items: PollenItem[]): string {
  if (!items.length) {
    return 'Pollen detail isn’t available for this spot (coverage varies by region).'
  }
  const risk = overallAllergyRisk(items)
  if (risk.level === 'low') {
    return 'Pollen looks manageable for most people today.'
  }
  if (risk.level === 'moderate') {
    return `${risk.topName ?? 'Pollen'} is moderate — sensitive folks may want meds handy.`
  }
  return `${risk.topName ?? 'Pollen'} is ${risk.level.replace('_', ' ')}. Keep windows closed peak hours; shower after being outside.`
}

/** Next ~18h peak for the strongest pollen type that has hourly data */
export function pollenPeakHours(
  air: AirQualityData | null,
  timezone?: string,
  hoursAhead = 18,
): PollenPeakHour[] {
  if (!air?.hourly?.time?.length) return []
  const now = Date.now()
  const end = now + hoursAhead * 3600_000
  const peaks: PollenPeakHour[] = []

  for (const { key, name } of KEYS) {
    const series = air.hourly[key as keyof AirQualityData['hourly']] as
      | (number | null)[]
      | undefined
    if (!series?.length) continue

    let bestVal = -1
    let bestI = -1
    for (let i = 0; i < air.hourly.time.length; i++) {
      const ms = parseWeatherLocal(air.hourly.time[i], timezone || air.timezone)
      if (ms < now - 30 * 60_000 || ms > end) continue
      const v = series[i]
      if (v == null || !Number.isFinite(Number(v))) continue
      const n = Number(v)
      if (n > bestVal) {
        bestVal = n
        bestI = i
      }
    }
    if (bestI >= 0 && bestVal > 0) {
      peaks.push({
        time: air.hourly.time[bestI],
        ms: parseWeatherLocal(air.hourly.time[bestI], timezone || air.timezone),
        name,
        value: Math.round(bestVal),
      })
    }
  }

  return peaks.sort((a, b) => b.value - a.value).slice(0, 3)
}

/**
 * Mold / damp-air risk heuristic (no dedicated mold API on free tier).
 * High humidity + mild temps after rain favors mold spores.
 */
export function moldRiskFromWeather(weather: WeatherData | null): MoldRisk | null {
  if (!weather?.current) return null
  const rh = weather.current.relative_humidity_2m ?? 50
  const temp = weather.current.temperature_2m
  const precip =
    weather.current.precipitation ??
    weather.daily?.precipitation_sum?.[0] ??
    0

  let score = 0
  if (rh >= 80) score += 2
  else if (rh >= 65) score += 1
  if (temp >= 15 && temp <= 30) score += 1
  if (precip >= 1) score += 1
  if (precip >= 5) score += 1

  if (score >= 4) {
    return {
      level: 'high',
      color: '#f97316',
      label: 'High mold-friendly air',
      detail: `Humidity ${Math.round(rh)}% · damp conditions favor spores`,
    }
  }
  if (score >= 2) {
    return {
      level: 'moderate',
      color: '#eab308',
      label: 'Moderate mold risk',
      detail: `Humidity ${Math.round(rh)}% · watch indoor damp spots`,
    }
  }
  return {
    level: 'low',
    color: '#22c55e',
    label: 'Low mold risk',
    detail: `Humidity ${Math.round(rh)}% · air is relatively dry for spores`,
  }
}

export function allergyTips(
  items: PollenItem[],
  risk: AllergyRisk,
  mold: MoldRisk | null,
  weather: WeatherData | null,
): string[] {
  const tips: string[] = []
  if (risk.level === 'high' || risk.level === 'very high') {
    tips.push('Take allergy meds before going out if your doctor recommends them')
    tips.push('Keep windows closed; use recirculate in the car')
    tips.push('Change clothes / shower after outdoor time to drop pollen load')
  } else if (risk.level === 'moderate') {
    tips.push('Sensitive noses: short outdoor bursts, rinse sinuses if needed')
    tips.push('Dry laundry indoors if pollen is climbing')
  } else if (risk.level === 'low' && items.length) {
    tips.push('Levels look friendly — still rinse contacts/eyes if you feel itchy')
  }

  if (mold && (mold.level === 'moderate' || mold.level === 'high')) {
    tips.push('Run a dehumidifier or AC if indoors feels damp')
    tips.push('Avoid raking wet leaves / stirring mulch when mold risk is up')
  }

  const wind = weather?.current?.wind_speed_10m ?? 0
  if (wind >= 25 && (risk.level === 'moderate' || risk.level === 'high' || risk.level === 'very high')) {
    tips.push('Breezy air spreads pollen farther — plan outdoor workouts carefully')
  }

  if (!tips.length) {
    tips.push('When pollen data is sparse, track how you feel and note windy dry days')
  }

  return tips.slice(0, 4)
}
