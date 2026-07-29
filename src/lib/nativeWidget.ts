/**
 * Native iOS Home Screen widget (WidgetKit) bridge.
 * Uses @solara/widget Capacitor plugin → App Group shared store.
 */
import { SolaraWidget } from '@solara/widget'
import type { LocationResult, WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { getWeatherInfo } from '../utils/weatherCodes'
import { todayDailyIndex } from '../utils/weatherStory'
import { isIOS, isNativeApp } from './native'

export interface WidgetSnapshotPayload {
  placeName: string
  lat: number
  lon: number
  tempC: number
  feelsLikeC?: number
  highC?: number
  lowC?: number
  code: number
  condition: string
  pop?: number
  updatedAt: number
  units: 'metric' | 'imperial'
  deepLink?: string
}

/** Build snapshot from forecast + place (temps stored as °C; widget converts for imperial). */
export function buildWidgetSnapshot(
  location: LocationResult,
  weather: WeatherData,
  units: Units,
): WidgetSnapshotPayload {
  const ti = Math.max(0, todayDailyIndex(weather))
  const code = weather.current?.weather_code ?? 0
  const info = getWeatherInfo(code, true)
  const pop =
    weather.daily?.precipitation_probability_max?.[ti] ??
    weather.hourly?.precipitation_probability?.[0] ??
    undefined

  const high = weather.daily?.temperature_2m_max?.[ti]
  const low = weather.daily?.temperature_2m_min?.[ti]

  return {
    placeName: (location.name || 'Home').replace(/\s*\(Home\)\s*$/i, '').trim() || 'Home',
    lat: Number(location.latitude),
    lon: Number(location.longitude),
    tempC: Number(weather.current?.temperature_2m ?? 0),
    feelsLikeC:
      weather.current?.apparent_temperature != null
        ? Number(weather.current.apparent_temperature)
        : undefined,
    highC: high != null && Number.isFinite(high) ? Number(high) : undefined,
    lowC: low != null && Number.isFinite(low) ? Number(low) : undefined,
    code: Number(code),
    condition: info.label || info.description || 'Weather',
    pop: pop != null && Number.isFinite(pop) ? Math.round(Number(pop)) : undefined,
    updatedAt: Date.now() / 1000,
    units: units === 'imperial' ? 'imperial' : 'metric',
    deepLink: 'solara://home',
  }
}

export function isNativeIosWidgetSupported(): boolean {
  return isNativeApp() && isIOS()
}

/**
 * Publish weather for the Home Screen tile.
 * Prefers exact home pin when the loaded place is home (or only home weather was passed).
 */
export async function publishNativeWidgetSnapshot(opts: {
  location: LocationResult
  weather: WeatherData
  units: Units
  homeLocation?: LocationResult | null
}): Promise<void> {
  if (!isNativeIosWidgetSupported()) return
  if (!opts.weather?.current || !opts.location) return

  try {
    // Tile should show home when user has a home pin and we're viewing home
    // (or when caller passes home as location). Never invent coords without weather.
    let place = opts.location
    const home = opts.homeLocation
    if (home && Number.isFinite(home.latitude) && Number.isFinite(home.longitude)) {
      const sameHome =
        Math.abs(home.latitude - opts.location.latitude) < 0.0008 &&
        Math.abs(home.longitude - opts.location.longitude) < 0.0008
      if (sameHome) {
        place = {
          ...opts.location,
          name: (home.name || opts.location.name || 'Home').replace(/\s*\(Home\)\s*$/i, '').trim() || 'Home',
          latitude: home.latitude,
          longitude: home.longitude,
        }
      }
    }

    const snapshot = buildWidgetSnapshot(place, opts.weather, opts.units)
    if (!Number.isFinite(snapshot.lat) || !Number.isFinite(snapshot.lon)) return

    const result = await SolaraWidget.setSnapshot({ json: JSON.stringify(snapshot) })
    console.info('[SolaraWidget] snapshot written', result)
    try {
      await SolaraWidget.reload()
    } catch {
      /* ignore */
    }
  } catch (err) {
    console.warn('[SolaraWidget] publish failed', err)
  }
}

export async function reloadNativeWidgets(): Promise<void> {
  if (!isNativeIosWidgetSupported()) return
  try {
    await SolaraWidget.reload()
  } catch {
    /* ignore */
  }
}
