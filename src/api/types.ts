export interface LocationResult {
  id: number
  name: string
  latitude: number
  longitude: number
  elevation?: number
  country_code?: string
  country?: string
  admin1?: string
  timezone?: string
  population?: number
}

export interface CurrentWeather {
  time: string
  temperature_2m: number
  relative_humidity_2m: number
  apparent_temperature: number
  is_day: number
  precipitation: number
  rain: number
  showers: number
  snowfall: number
  weather_code: number
  cloud_cover: number
  pressure_msl: number
  surface_pressure: number
  wind_speed_10m: number
  wind_direction_10m: number
  wind_gusts_10m: number
}

export interface HourlyWeather {
  time: string[]
  temperature_2m: number[]
  relative_humidity_2m: number[]
  dew_point_2m: number[]
  apparent_temperature: number[]
  precipitation_probability: number[]
  precipitation: number[]
  rain: number[]
  showers: number[]
  snowfall: number[]
  weather_code: number[]
  pressure_msl: number[]
  cloud_cover: number[]
  visibility: number[]
  wind_speed_10m: number[]
  wind_direction_10m: number[]
  wind_gusts_10m: number[]
  uv_index: number[]
  is_day: number[]
}

export interface DailyWeather {
  time: string[]
  weather_code: number[]
  temperature_2m_max: number[]
  temperature_2m_min: number[]
  apparent_temperature_max: number[]
  apparent_temperature_min: number[]
  sunrise: string[]
  sunset: string[]
  daylight_duration: number[]
  sunshine_duration: number[]
  uv_index_max: number[]
  precipitation_sum: number[]
  rain_sum: number[]
  showers_sum: number[]
  snowfall_sum: number[]
  precipitation_hours: number[]
  precipitation_probability_max: number[]
  wind_speed_10m_max: number[]
  wind_gusts_10m_max: number[]
  wind_direction_10m_dominant: number[]
}

export interface Minutely15 {
  time: string[]
  precipitation: number[]
  weather_code?: number[]
  wind_speed_10m?: number[]
  temperature_2m?: number[]
}

export interface WeatherData {
  latitude: number
  longitude: number
  timezone: string
  timezone_abbreviation: string
  elevation: number
  current: CurrentWeather
  hourly: HourlyWeather
  daily: DailyWeather
  minutely_15?: Minutely15
  current_units: Record<string, string>
  /** Which Open-Meteo models Solara blended for this payload */
  solara_source?: {
    strategy: string
    shortModel?: string
    longModel?: string
  }
}

export interface AirQualityData {
  latitude: number
  longitude: number
  timezone: string
  current: {
    time: string
    us_aqi: number
    pm10: number
    pm2_5: number
    carbon_monoxide: number
    nitrogen_dioxide: number
    sulphur_dioxide: number
    ozone: number
    european_aqi: number
    alder_pollen?: number | null
    birch_pollen?: number | null
    grass_pollen?: number | null
    mugwort_pollen?: number | null
    olive_pollen?: number | null
    ragweed_pollen?: number | null
  }
  hourly: {
    time: string[]
    us_aqi: number[]
    pm10: number[]
    pm2_5: number[]
    alder_pollen?: (number | null)[]
    birch_pollen?: (number | null)[]
    grass_pollen?: (number | null)[]
    mugwort_pollen?: (number | null)[]
    olive_pollen?: (number | null)[]
    ragweed_pollen?: (number | null)[]
  }
}

/** Lightweight snapshot for home pins / rain watch */
export interface LocationSnapshot {
  location: LocationResult
  temperature: number
  weatherCode: number
  isDay: boolean
  precipNextHour: number
  precipSoon: boolean
  rainStartsInMin: number | null
  popMax6h: number
  high: number
  low: number
  aqi: number | null
  hasAlert: boolean
}

export interface WeatherAlert {
  id: string
  event: string
  headline: string
  description: string
  instruction: string
  severity: string
  urgency: string
  certainty: string
  areas: string
  onset: string | null
  ends: string | null
  sender: string
}

export interface RadarFrame {
  time: number
  path: string
}

export interface RadarMaps {
  version: string
  generated: number
  host: string
  radar: {
    past: RadarFrame[]
    nowcast?: RadarFrame[]
  }
  satellite?: {
    infrared?: RadarFrame[]
  }
}

export type ModelId =
  | 'best_match'
  | 'gfs_hrrr'
  | 'gfs_seamless'
  | 'ecmwf_ifs025'
  | 'icon_seamless'
  | 'gem_seamless'

export interface ModelSeries {
  id: ModelId
  label: string
  hourly: {
    time: string[]
    temperature_2m: number[]
    precipitation: number[]
  } | null
  error?: string
}

export interface PressureLevelProfile {
  levels: number[] // hPa
  temperature: (number | null)[]
  relative_humidity: (number | null)[]
  wind_speed: (number | null)[]
  wind_direction: (number | null)[]
  time: string
}

export interface GridPoint {
  lat: number
  lon: number
  temperature_2m: number
  wind_speed_10m: number
  wind_direction_10m: number
  cloud_cover: number
  precipitation: number
}

export interface TropicalForecastPoint {
  lon: number
  lat: number
  label?: string
  windKt?: number
}

export interface TropicalStorm {
  id: string
  name: string
  classification: string
  intensity: string
  pressure?: string
  movement?: string
  lat: number
  lon: number
  binNumber?: string
  headline?: string
  lastUpdate?: string
  advisoryUrl?: string
  /** Forecast track as [lon, lat] pairs */
  track?: [number, number][]
  /** Observed path already taken */
  pastTrack?: [number, number][]
  forecastPoints?: TropicalForecastPoint[]
}

export type GeoJsonFeatureCollection = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    properties?: Record<string, unknown> | null
    geometry: {
      type: string
      coordinates: unknown
    }
  }>
}

export interface TropicalGlobeData {
  storms: TropicalStorm[]
  tracks: GeoJsonFeatureCollection
  pastTracks?: GeoJsonFeatureCollection
  cones: GeoJsonFeatureCollection
  points: GeoJsonFeatureCollection
  updatedAt: string
  source: string
}

export type ThemeMode = 'dark' | 'light' | 'auto'
export type DensityMode = 'comfortable' | 'compact'
