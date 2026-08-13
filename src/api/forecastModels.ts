/**
 * Region-aware Open-Meteo model selection + short/long blend.
 *
 * Strategy (free NWS-class sources via Open-Meteo):
 * - US CONUS: HRRR short + NBM when useful, ECMWF long
 * - Canada: GEM seamless short, ECMWF long (+ ECCC City Page in weather.ts)
 * - UK/Ireland: UKMO UK 2 km short, UKMO seamless / ECMWF long
 * - France: AROME short, Météo-France seamless long
 * - Central Europe: ICON-D2 / ICON seamless + ECMWF
 * - Nordics: MET Norway Nordic + ECMWF
 * - Benelux: KNMI seamless + ECMWF
 * - Japan: JMA MSM short, JMA seamless long
 * - Korea: KMA seamless + ECMWF
 * - Australia/NZ: best_match (BOM ACCESS when available) + ECMWF
 * - China: CMA GRAPES + ECMWF
 * - Elsewhere: best_match + ECMWF backbone
 */

import type { DailyWeather, HourlyWeather, Minutely15, WeatherData } from './types'

export type ForecastRegion =
  | 'us_conus'
  | 'canada'
  | 'uk'
  | 'france'
  | 'nordic'
  | 'benelux'
  | 'central_europe'
  | 'europe'
  | 'japan'
  | 'korea'
  | 'australia'
  | 'china'
  | 'global'

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
  // Canada (and AK panhandle-ish)
  if (lat > 41 && lat <= 84 && lon >= -141 && lon <= -52) return 'canada'

  // UK + Ireland
  if (lat >= 49 && lat <= 61 && lon >= -11 && lon <= 2) return 'uk'
  // France (metropolitan-ish)
  if (lat >= 41 && lat <= 51.5 && lon >= -5.5 && lon <= 10) return 'france'
  // Benelux
  if (lat >= 49 && lat <= 54 && lon >= 2.5 && lon <= 7.5) return 'benelux'
  // Nordics
  if (lat >= 54 && lat <= 72 && lon >= 4 && lon <= 32) return 'nordic'
  // DACH / Central Europe high-res ICON-D2 zone
  if (lat >= 45 && lat <= 56 && lon >= 5 && lon <= 18) return 'central_europe'
  // Broader Europe
  if (lat >= 35 && lat <= 72 && lon >= -12 && lon <= 40) return 'europe'

  // Japan
  if (lat >= 24 && lat <= 46 && lon >= 123 && lon <= 146) return 'japan'
  // South Korea
  if (lat >= 33 && lat <= 39 && lon >= 124 && lon <= 132) return 'korea'
  // Australia + NZ
  if (lat >= -48 && lat <= -10 && lon >= 112 && lon <= 180) return 'australia'
  // Mainland China-ish
  if (lat >= 18 && lat <= 54 && lon >= 73 && lon <= 135) return 'china'

  return 'global'
}

export function pickModels(lat: number, lon: number): ModelPick {
  const region = detectForecastRegion(lat, lon)
  switch (region) {
    case 'us_conus':
      return {
        region,
        shortModel: 'gfs_hrrr',
        // NBM is the US multi-day consensus; ECMWF still in fallback chain
        longModel: 'ncep_nbm_conus',
        shortPreferHours: 24,
        label: 'HRRR + NBM',
      }
    case 'canada':
      return {
        region,
        shortModel: 'gem_seamless',
        longModel: 'ecmwf_ifs025',
        shortPreferHours: 36,
        label: 'ECCC + GEM + ECMWF',
      }
    case 'uk':
      return {
        region,
        shortModel: 'ukmo_uk_deterministic_2km',
        longModel: 'ukmo_seamless',
        shortPreferHours: 36,
        label: 'UKMO UKV + UKMO/ECMWF',
      }
    case 'france':
      return {
        region,
        shortModel: 'arome_france',
        longModel: 'meteofrance_seamless',
        shortPreferHours: 36,
        label: 'AROME + Météo-France',
      }
    case 'nordic':
      return {
        region,
        shortModel: 'metno_nordic',
        longModel: 'ecmwf_ifs025',
        shortPreferHours: 36,
        label: 'MET Norway + ECMWF',
      }
    case 'benelux':
      return {
        region,
        shortModel: 'knmi_seamless',
        longModel: 'ecmwf_ifs025',
        shortPreferHours: 36,
        label: 'KNMI + ECMWF',
      }
    case 'central_europe':
      return {
        region,
        shortModel: 'icon_d2',
        longModel: 'icon_seamless',
        shortPreferHours: 36,
        label: 'ICON-D2 + ICON/ECMWF',
      }
    case 'europe':
      return {
        region,
        shortModel: 'icon_seamless',
        longModel: 'ecmwf_ifs025',
        shortPreferHours: 48,
        label: 'ICON + ECMWF',
      }
    case 'japan':
      return {
        region,
        shortModel: 'jma_msm',
        longModel: 'jma_seamless',
        shortPreferHours: 36,
        label: 'JMA MSM + JMA',
      }
    case 'korea':
      return {
        region,
        shortModel: 'kma_seamless',
        longModel: 'ecmwf_ifs025',
        shortPreferHours: 36,
        label: 'KMA + ECMWF',
      }
    case 'australia':
      return {
        region,
        // best_match pulls BOM ACCESS when Open-Meteo has coverage
        longModel: 'best_match',
        shortPreferHours: 0,
        label: 'Best match · Australia (BOM/ECMWF)',
      }
    case 'china':
      return {
        region,
        shortModel: 'cma_grapes_global',
        longModel: 'ecmwf_ifs025',
        shortPreferHours: 48,
        label: 'CMA GRAPES + ECMWF',
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
  const chain = [
    pick.longModel,
    'best_match',
    'ecmwf_ifs025',
    'gfs_seamless',
    'icon_seamless',
  ]
  if (pick.shortModel) chain.unshift(pick.shortModel)
  // Region-specific extras
  if (pick.region === 'us_conus') chain.push('ncep_nbm_conus', 'gfs_hrrr')
  if (pick.region === 'uk') chain.push('ukmo_seamless', 'ukmo_uk_deterministic_2km')
  if (pick.region === 'japan') chain.push('jma_seamless', 'jma_msm')
  if (pick.region === 'france') chain.push('meteofrance_seamless', 'arome_france')
  return [...new Set(chain.filter(Boolean))]
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
    cloud_cover_low: long.cloud_cover_low ? [...long.cloud_cover_low] : undefined,
    cloud_cover_mid: long.cloud_cover_mid ? [...long.cloud_cover_mid] : undefined,
    cloud_cover_high: long.cloud_cover_high ? [...long.cloud_cover_high] : undefined,
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

/**
 * Merge short-model daily fields into long by **calendar date string**.
 * Important: long may include past_days (index 0 = yesterday) — never assume [0] is today.
 */
export function blendDaily(short: DailyWeather | undefined, long: DailyWeather): DailyWeather {
  if (!short?.time?.length) return long
  const out: DailyWeather = JSON.parse(JSON.stringify(long)) as DailyWeather

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

  for (let si = 0; si < short.time.length; si++) {
    const day = short.time[si]?.slice(0, 10)
    if (!day) continue
    const li = out.time.findIndex((t) => t.startsWith(day))
    if (li < 0) continue
    for (const k of numKeys) {
      const sv = short[k]?.[si]
      if (isFiniteNum(sv) && out[k]) (out[k] as number[])[li] = sv
    }
    if (short.sunrise?.[si] && out.sunrise) out.sunrise[li] = short.sunrise[si]
    if (short.sunset?.[si] && out.sunset) out.sunset[li] = short.sunset[si]
  }
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
