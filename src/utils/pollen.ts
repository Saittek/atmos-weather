import type { AirQualityData } from '../api/types'

export interface PollenItem {
  name: string
  value: number
  level: 'none' | 'low' | 'moderate' | 'high' | 'very high'
  color: string
}

const LEVELS: { max: number; level: PollenItem['level']; color: string }[] = [
  { max: 0, level: 'none', color: '#64748b' },
  { max: 20, level: 'low', color: '#22c55e' },
  { max: 50, level: 'moderate', color: '#eab308' },
  { max: 100, level: 'high', color: '#f97316' },
  { max: Infinity, level: 'very high', color: '#ef4444' },
]

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
    items.push({ name, value, level, color })
  }
  return items.sort((a, b) => b.value - a.value)
}

export function pollenAdvice(items: PollenItem[]): string {
  if (!items.length) {
    return 'Pollen detail isn’t available for this spot (coverage varies by region).'
  }
  const top = items[0]
  if (top.level === 'none' || top.level === 'low') {
    return 'Pollen looks manageable for most people today.'
  }
  if (top.level === 'moderate') {
    return `${top.name} is moderate — sensitive folks may want meds handy.`
  }
  return `${top.name} is ${top.level.replace('_', ' ')} (${top.value}). Keep windows closed peak hours; shower after being outside.`
}
