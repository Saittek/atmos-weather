/**
 * Native iOS Home Screen widget (WidgetKit) bridge.
 * Writes a JSON snapshot into the App Group; the SolaraWidget extension renders it.
 * No-op on web / Android.
 */
import { registerPlugin } from '@capacitor/core'
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

interface SolaraWidgetPlugin {
  setSnapshot(options: { json: string }): Promise<{ ok?: boolean }>
  reload(): Promise<{ ok?: boolean }>
  getSnapshot(): Promise<{ json?: string | null }>
}

const SolaraWidget = registerPlugin<SolaraWidgetPlugin>('SolaraWidget')

function locationKey(loc: LocationResult): string {
  return `${loc.latitude.toFixed(4)},${loc.longitude.toFixed(4)}`
}

export function isNativeIosWidgetSupported(): boolean {
  return isNativeApp() && isIOS()
}

/** Build snapshot from forecast + place (temps stored as °C; widget converts for imperial). */
export function buildWidgetSnapshot(
  location: LocationResult,
  weather: WeatherData,
  units: Units,
): WidgetSnapshotPayload {
  const ti = todayDailyIndex(weather)
  const code = weather.current.weather_code
  const info = getWeatherInfo(code, true)
  const pop =
    weather.daily.precipitation_probability_max?.[ti] ??
    weather.hourly.precipitation_probability?.[0] ??
    undefined

  return {
    placeName: location.name?.replace(/\s*\(Home\)\s*$/i, '').trim() || 'Home',
    lat: location.latitude,
    lon: location.longitude,
    tempC: weather.current.temperature_2m,
    feelsLikeC: weather.current.apparent_temperature,
    highC: weather.daily.temperature_2m_max?.[ti],
    lowC: weather.daily.temperature_2m_min?.[ti],
    code,
    condition: info.label || info.description || 'Weather',
    pop: pop != null ? Math.round(pop) : undefined,
    updatedAt: Date.now() / 1000,
    units: units === 'imperial' ? 'imperial' : 'metric',
    deepLink: 'solara://home',
  }
}

/**
 * Push snapshot to WidgetKit when running as the native iOS app.
 * Prefer home place: if a home is set, only publish when loading that place.
 */
export async function publishNativeWidgetSnapshot(opts: {
  location: LocationResult
  weather: WeatherData
  units: Units
  homeLocation?: LocationResult | null
}): Promise<void> {
  if (!isNativeIosWidgetSupported()) return

  const home = opts.homeLocation
  if (home && locationKey(home) !== locationKey(opts.location)) {
    return
  }

  try {
    const snapshot = buildWidgetSnapshot(opts.location, opts.weather, opts.units)
    await SolaraWidget.setSnapshot({ json: JSON.stringify(snapshot) })
  } catch (err) {
    // Plugin missing on older builds / simulator without extension — non-fatal
    if (import.meta.env.DEV) {
      console.warn('[SolaraWidget] publish failed', err)
    }
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
