/**
 * Compact weather payload for the AI assistant (grounded Q&A).
 */
import type { AirQualityData, LocationResult, WeatherAlert, WeatherData } from '../api/types'
import type { Units } from './format'
import { willIGetWet } from './wetSummary'
import { precipTiming } from './precipTiming'
import { todayRange } from './todayRange'
import { formatWeatherSource } from './weatherSource'

export function buildAiWeatherContext(opts: {
  location: LocationResult
  weather: WeatherData
  units: Units
  air?: AirQualityData | null
  alerts?: WeatherAlert[]
}): Record<string, unknown> {
  const { location, weather, units, air, alerts = [] } = opts
  const c = weather.current
  const h = weather.hourly
  const wet = willIGetWet(weather, units)
  const timing = precipTiming(weather, units)
  const range = todayRange(weather)

  // Next 18 hours compact
  const now = Date.now()
  const hours: {
    time: string
    temp: number | null
    pop: number | null
    precip: number | null
    code: number | null
    wind: number | null
  }[] = []
  for (let i = 0; i < h.time.length && hours.length < 18; i++) {
    const t = h.time[i]
    // skip far past
    try {
      const ms = new Date(t).getTime()
      if (Number.isFinite(ms) && ms + 45 * 60_000 < now) continue
    } catch {
      /* keep */
    }
    hours.push({
      time: t,
      temp: h.temperature_2m?.[i] ?? null,
      pop: h.precipitation_probability?.[i] ?? null,
      precip: h.precipitation?.[i] ?? null,
      code: h.weather_code?.[i] ?? null,
      wind: h.wind_speed_10m?.[i] ?? null,
    })
  }

  const days = (weather.daily?.time ?? []).slice(0, 7).map((t, i) => ({
    date: t,
    high: weather.daily.temperature_2m_max?.[i] ?? null,
    low: weather.daily.temperature_2m_min?.[i] ?? null,
    pop: weather.daily.precipitation_probability_max?.[i] ?? null,
    precip: weather.daily.precipitation_sum?.[i] ?? null,
    code: weather.daily.weather_code?.[i] ?? null,
    uv: weather.daily.uv_index_max?.[i] ?? null,
  }))

  const alertBrief = alerts.slice(0, 8).map((a) => ({
    event: a.event,
    severity: a.severity,
    headline: a.headline || a.description?.slice(0, 160) || '',
    ends: a.ends || null,
  }))

  return {
    place: {
      name: location.name,
      lat: location.latitude,
      lon: location.longitude,
      admin: location.admin1 || null,
      country: location.country_code || location.country || null,
    },
    units,
    timezone: weather.timezone,
    source: formatWeatherSource(weather),
    models: weather.solara_source || null,
    metar: weather.solara_obs
      ? {
          icao: weather.solara_obs.icao,
          tempC: weather.solara_obs.tempC,
          distanceKm: weather.solara_obs.distanceKm,
          windKt: weather.solara_obs.windKt,
          obsTime: weather.solara_obs.obsTime,
        }
      : null,
    current: {
      time: c.time,
      temp: c.temperature_2m,
      feels: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      code: c.weather_code,
      wind: c.wind_speed_10m,
      gust: c.wind_gusts_10m,
      windDir: c.wind_direction_10m,
      precip: c.precipitation,
      cloud: c.cloud_cover,
      pressure: c.pressure_msl ?? c.surface_pressure,
      isDay: c.is_day,
    },
    today: {
      high: range.high,
      low: range.low,
    },
    wet: {
      level: wet.level,
      umbrella: wet.umbrella,
      title: wet.title,
      detail: wet.detail,
    },
    precipTiming: {
      level: timing.level,
      sentence: timing.sentence,
      next3hMm: timing.next3hMm,
    },
    air: air?.current
      ? {
          usAqi: air.current.us_aqi,
          pm25: air.current.pm2_5,
          pm10: air.current.pm10,
        }
      : null,
    alerts: alertBrief,
    nextHours: hours,
    nextDays: days,
  }
}
