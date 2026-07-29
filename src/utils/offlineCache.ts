import type {
  AirQualityData,
  LocationResult,
  WeatherAlert,
  WeatherData,
} from '../api/types'

const KEY = 'atmos-offline-weather-v1'
const KEY_MAP = 'atmos-offline-weather-map-v1'
const MAX_PLACES = 6

export interface OfflineBundle {
  location: LocationResult
  weather: WeatherData
  air: AirQualityData | null
  alerts: WeatherAlert[]
  savedAt: number
}

function placeKey(loc: LocationResult): string {
  return `${Number(loc.latitude).toFixed(3)},${Number(loc.longitude).toFixed(3)}`
}

export function saveOfflineBundle(bundle: OfflineBundle) {
  try {
    localStorage.setItem(KEY, JSON.stringify(bundle))
    // Multi-place map (home + last + recent)
    let map: Record<string, OfflineBundle> = {}
    try {
      const raw = localStorage.getItem(KEY_MAP)
      if (raw) map = JSON.parse(raw) as Record<string, OfflineBundle>
    } catch {
      map = {}
    }
    map[placeKey(bundle.location)] = bundle
    // Prune oldest
    const entries = Object.entries(map).sort((a, b) => b[1].savedAt - a[1].savedAt)
    const pruned = Object.fromEntries(entries.slice(0, MAX_PLACES))
    localStorage.setItem(KEY_MAP, JSON.stringify(pruned))
  } catch {
    /* quota */
  }
}

export function loadOfflineBundle(prefer?: LocationResult | null): OfflineBundle | null {
  try {
    if (prefer) {
      const rawMap = localStorage.getItem(KEY_MAP)
      if (rawMap) {
        const map = JSON.parse(rawMap) as Record<string, OfflineBundle>
        const hit = map[placeKey(prefer)]
        if (hit?.weather) return hit
      }
    }
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw) as OfflineBundle
  } catch {
    return null
  }
}

/** Human-readable age for offline banners */
export function offlineAgeLabel(savedAt: number): string {
  const mins = Math.max(0, Math.round((Date.now() - savedAt) / 60_000))
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 36) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}
