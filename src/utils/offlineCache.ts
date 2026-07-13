import type {
  AirQualityData,
  LocationResult,
  WeatherAlert,
  WeatherData,
} from '../api/types'

const KEY = 'atmos-offline-weather-v1'

export interface OfflineBundle {
  location: LocationResult
  weather: WeatherData
  air: AirQualityData | null
  alerts: WeatherAlert[]
  savedAt: number
}

export function saveOfflineBundle(bundle: OfflineBundle) {
  try {
    localStorage.setItem(KEY, JSON.stringify(bundle))
  } catch {
    /* quota */
  }
}

export function loadOfflineBundle(): OfflineBundle | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw) as OfflineBundle
  } catch {
    return null
  }
}
