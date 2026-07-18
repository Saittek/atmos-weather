/**
 * Region-aware Open-Meteo model selection + short/long blend.
 *
 * Strategy:
 * - US CONUS: HRRR (gfs_hrrr) for ~next 24h, ECMWF IFS for the rest
 * - Canada: GEM seamless (HRDPS where available) short, ECMWF long
 * - Europe: ICON seamless + ECMWF long
 * - Elsewhere: Open-Meteo best_match (highest-res available)
 */

import type { DailyWeather, HourlyWeather, Minutely15, WeatherData } from './types'

export type ForecastRegion = 'us_conus' | 'canada' | 'europe' | 'global'

export interface ModelPick {
  region: ForecastRegion
  /** Near-term high-res model (optional) */
  shortModel?: string
  /** Backbone for multi-day */
  longModel: string
  /** Hours from short model to prefer when blending */
  shortPreferHours: number
  label: string
}

/** Rough geographic domains (good enough for model routing) */
export function detectForecastRegion(lat: number, lon: number): ForecastRegion {
  // Contiguous US + nearby
  if (lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66) return 'us_conus'
  // Canada (and AK panhandle-ish) — prefer GEM/HRDPS family
  if (lat > 41 && lat <= 84 && lon >= -141 && lon <= -52) return 'canada'
  // Western/central Europe where ICON/AROME ecosystem is strong
  if (lat >= 35 && lat <= 72 && lon >= -12 && lon <= 40) return 'europe'
  return 'global'
}

export function pickModels(lat: number, lon: number): ModelPick {
  const region = detectForecastRegion(lat, lon)
  switch (region) {
    case 'us_conus':
      return {
        region,
        shortModel: 'gfs_hrrr',
        longModel: 'ecmwf_ifs025',
        shortPreferHours: 24,
        label: 'HRRR + ECMWF',
      }
    case 'canada':
      return {
        region,
        shortModel: 'gem_seamless',
        longModel: 'ecmwf_ifs025',
        shortPreferHours: 36,
        label: 'GEM + ECMWF',
      }
    case 'europe':
      return {
        region,
        shortModel: 'icon_seamless',
        longModel: 'ecmwf_ifs025',
        shortPreferHours: 48,
        label: 'ICON + ECMWF',
      }
    default:
      return {
        region,
        longModel: 'best_match',
        shortPreferHours: 0,
        label: 'Best match',
      }
  }
}

/** Fallback chain if a preferred model 404s / errors */
export function fallbackModels(pick: ModelPick): string[] {
  const chain = [pick.longModel, 'best_match', 'gfs_seamless', 'icon_seamless', 'ecmwf_ifs025']
  if (pick.shortModel) chain.unshift(pick.shortModel)
  return [...new Set(chain)]
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * Prefer high-res `short` values wherever timestamps overlap with `long`.
 * Short models only cover ~24–48h, so the rest of the week stays on ECMWF/etc.
 */
export function blendHourly(
  short: HourlyWeather | undefined,
  long: HourlyWeather,
  _shortPreferHours = 24,
): HourlyWeather {
  if (!short?.time?.length) return long

  const shortByTime = new Map<string, number>()
  short.time.forEach((t, i) => shortByTime.set(t, i))

  const keys = Object.keys(long) as (keyof HourlyWeather)[]

  const out: HourlyWeather = {
    time: [...long.time],
    temperature_2m: [...(long.temperature_2m ?? [])],
    relative_humidity_2m: [...(long.relative_humidity_2m ?? [])],
    dew_point_2m: [...(long.dew_point_2m ?? [])],
    apparent_temperature: [...(long.apparent_temperature ?? [])],
    precipitation_probability: [...(long.precipitation_probability ?? [])],
    precipitation: [...(long.precipitation ?? [])],
    rain: [...(long.rain ?? [])],
    showers: [...(long.showers ?? [])],
    snowfall: [...(long.snowfall ?? [])],
    weather_code: [...(long.weather_code ?? [])],
    pressure_msl: [...(long.pressure_msl ?? [])],
    cloud_cover: [...(long.cloud_cover ?? [])],
    visibility: [...(long.visibility ?? [])],
    wind_speed_10m: [...(long.wind_speed_10m ?? [])],
    wind_direction_10m: [...(long.wind_direction_10m ?? [])],
    wind_gusts_10m: [...(long.wind_gusts_10m ?? [])],
    uv_index: [...(long.uv_index ?? [])],
    is_day: [...(long.is_day ?? [])],
  }

  for (let i = 0; i < long.time.length; i++) {
    const si = shortByTime.get(long.time[i])
    if (si == null) continue

    for (const k of keys) {
      if (k === 'time') continue
      const sArr = short[k] as number[] | undefined
      const oArr = out[k] as number[] | undefined
      if (!sArr || !oArr || oArr.length <= i) continue
      const sv = sArr[si]
      if (isFiniteNum(sv)) oArr[i] = sv
    }
  }

  return out
}

/** Day 0 (today) highs/lows/weather from short when available */
export function blendDaily(short: DailyWeather | undefined, long: DailyWeather): DailyWeather {
  if (!short?.time?.length) return long
  const out: DailyWeather = JSON.parse(JSON.stringify(long)) as DailyWeather
  const longToday = long.time[0]
  const si = short.time.indexOf(longToday)
  if (si < 0) return long

  const numKeys: (keyof DailyWeather)[] = [
    'weather_code',
    'temperature_2m_max',
    'temperature_2m_min',
    'apparent_temperature_max',
    'apparent_temperature_min',
    'daylight_duration',
    'sunshine_duration',
    'uv_index_max',
    'precipitation_sum',
    'rain_sum',
    'showers_sum',
    'snowfall_sum',
    'precipitation_hours',
    'precipitation_probability_max',
    'wind_speed_10m_max',
    'wind_gusts_10m_max',
    'wind_direction_10m_dominant',
  ]
  for (const k of numKeys) {
    const sv = short[k]?.[si]
    if (isFiniteNum(sv) && out[k]) (out[k] as number[])[0] = sv
  }
  // Keep sunrise/sunset from whichever has them
  if (short.sunrise?.[si] && out.sunrise) out.sunrise[0] = short.sunrise[si]
  if (short.sunset?.[si] && out.sunset) out.sunset[0] = short.sunset[si]
  return out
}

export function blendWeatherData(
  short: WeatherData | null,
  long: WeatherData,
  pick: ModelPick,
): WeatherData {
  if (!short) {
    return {
      ...long,
      solara_source: {
        strategy: pick.label,
        longModel: pick.longModel,
      },
    }
  }

  return {
    ...long,
    // Prefer short-range "now" when present
    current: short.current ?? long.current,
    minutely_15: (short.minutely_15?.time?.length
      ? short.minutely_15
      : long.minutely_15) as Minutely15 | undefined,
    hourly: blendHourly(short.hourly, long.hourly, pick.shortPreferHours),
    daily: blendDaily(short.daily, long.daily),
    solara_source: {
      strategy: pick.label,
      shortModel: pick.shortModel,
      longModel: pick.longModel,
    },
  }
}
