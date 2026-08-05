/**
 * Native iOS Home Screen widget (WidgetKit) bridge.
 * Uses @solara/widget Capacitor plugin → App Group shared store.
 */
import { SolaraWidget } from '@solara/widget'
import type { LocationResult, WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { getWeatherInfo } from '../utils/weatherCodes'
import { todayDailyIndex, nextPrecipLabel } from '../utils/weatherStory'
import { willIGetWet } from '../utils/wetSummary'
import { buildStargazeBrief, gradeLabel } from '../utils/stargaze'
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
  /** Day-relevant extras for medium/large Home Screen widget */
  humidity?: number
  windKmh?: number
  windDeg?: number
  windGustKmh?: number
  uvMax?: number
  sunrise?: string
  sunset?: string
  precipMm?: number
  dayHint?: string
  /** Tonight stargaze score 0–100 when available */
  stargazeScore?: number
  stargazeLabel?: string
}

function buildDayHint(opts: {
  code: number
  pop?: number
  uvMax?: number
  windKmh?: number
  precipMm?: number
  highC?: number
  nextPrecip?: string | null
  wetTitle?: string | null
  stargazeScore?: number
  stargazeLabel?: string
}): string | undefined {
  const { code, pop, uvMax, windKmh, precipMm, highC, nextPrecip, wetTitle, stargazeScore, stargazeLabel } =
    opts
  if (stargazeScore != null && stargazeScore >= 68 && stargazeLabel) {
    return `✨ Tonight ${stargazeScore} · ${stargazeLabel} for stars`
  }
  // Prefer hyperlocal next precip when available
  if (nextPrecip && /rain|snow|shower|precip|wet|umbrella/i.test(nextPrecip)) {
    return nextPrecip.length > 48 ? `${nextPrecip.slice(0, 45)}…` : nextPrecip
  }
  if (wetTitle && /wet|umbrella|rain|snow/i.test(wetTitle) && !/dry/i.test(wetTitle)) {
    return wetTitle.length > 48 ? `${wetTitle.slice(0, 45)}…` : wetTitle
  }
  if (code >= 95) return 'Thunderstorm risk today'
  if (code >= 71 && code <= 77) return 'Snow in the forecast'
  if (pop != null && pop >= 60) return `Rain likely · ${pop}% chance`
  if (pop != null && pop >= 40) return 'Showers possible today'
  if (precipMm != null && precipMm >= 5) return `Wet day · ~${Math.round(precipMm)} mm`
  if (uvMax != null && uvMax >= 8) return 'Very high UV — cover up'
  if (uvMax != null && uvMax >= 6) return 'High UV this afternoon'
  if (windKmh != null && windKmh >= 45) return 'Windy — gusty conditions'
  if (windKmh != null && windKmh >= 30) return 'Breezy day'
  if (highC != null && highC >= 30) return 'Hot day — stay hydrated'
  if (highC != null && highC <= -15) return 'Bitter cold — dress in layers'
  if (code === 0 || code === 1) return 'Nice day overall'
  if (code === 45 || code === 48) return 'Foggy — watch visibility'
  return undefined
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
  const humidity = weather.current?.relative_humidity_2m
  const windKmh = weather.current?.wind_speed_10m
  const windDeg = weather.current?.wind_direction_10m
  const windGustKmh = weather.current?.wind_gusts_10m
  const uvMax = weather.daily?.uv_index_max?.[ti]
  const sunrise = weather.daily?.sunrise?.[ti]
  const sunset = weather.daily?.sunset?.[ti]
  const precipMm = weather.daily?.precipitation_sum?.[ti]

  const tempNow = Number(weather.current?.temperature_2m ?? 0)
  const highN =
    high != null && Number.isFinite(high) ? Math.max(Number(high), tempNow) : tempNow
  const lowN =
    low != null && Number.isFinite(low) ? Math.min(Number(low), tempNow) : tempNow
  const popN = pop != null && Number.isFinite(pop) ? Math.round(Number(pop)) : undefined
  const uvN = uvMax != null && Number.isFinite(uvMax) ? Number(uvMax) : undefined
  const windN = windKmh != null && Number.isFinite(windKmh) ? Number(windKmh) : undefined
  const precipN = precipMm != null && Number.isFinite(precipMm) ? Number(precipMm) : undefined
  const nextPrecip = nextPrecipLabel(weather)
  const wet = willIGetWet(weather)
  let stargazeScore: number | undefined
  let stargazeLabel: string | undefined
  try {
    const sg = buildStargazeBrief(weather, {
      lat: location.latitude,
      lon: location.longitude,
    })
    stargazeScore = sg.imagingScore
    stargazeLabel = gradeLabel(sg.imagingGrade)
  } catch {
    /* optional */
  }

  return {
    placeName: (location.name || 'Home').replace(/\s*\(Home\)\s*$/i, '').trim() || 'Home',
    lat: Number(location.latitude),
    lon: Number(location.longitude),
    tempC: tempNow,
    feelsLikeC:
      weather.current?.apparent_temperature != null
        ? Number(weather.current.apparent_temperature)
        : undefined,
    highC: highN,
    lowC: lowN,
    code: Number(code),
    condition: info.label || info.description || 'Weather',
    pop: popN,
    updatedAt: Date.now() / 1000,
    units: units === 'imperial' ? 'imperial' : 'metric',
    deepLink: 'solara://home',
    humidity:
      humidity != null && Number.isFinite(humidity) ? Math.round(Number(humidity)) : undefined,
    windKmh: windN,
    windDeg: windDeg != null && Number.isFinite(windDeg) ? Math.round(Number(windDeg)) : undefined,
    windGustKmh:
      windGustKmh != null && Number.isFinite(windGustKmh) ? Number(windGustKmh) : undefined,
    uvMax: uvN,
    sunrise: typeof sunrise === 'string' && sunrise ? sunrise : undefined,
    sunset: typeof sunset === 'string' && sunset ? sunset : undefined,
    precipMm: precipN,
    dayHint: buildDayHint({
      code: Number(code),
      pop: popN,
      uvMax: uvN,
      windKmh: windN,
      precipMm: precipN,
      highC: highN,
      nextPrecip,
      wetTitle: wet.title,
      stargazeScore,
      stargazeLabel,
    }),
    stargazeScore,
    stargazeLabel,
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
          name:
            (home.name || opts.location.name || 'Home').replace(/\s*\(Home\)\s*$/i, '').trim() ||
            'Home',
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
