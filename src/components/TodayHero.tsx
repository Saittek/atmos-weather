/**
 * Single “Today” card: outlook story + wet risk + next-hour precip + key stats.
 * Replaces ForecastSummary + GlanceModules + NextHourHero on the main path.
 */
import { useMemo } from 'react'
import type { AirQualityData, WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import {
  convertTemp,
  formatPrecipAmount,
  formatSpeed,
  formatTime,
  hasPrecipMm,
  parseWeatherLocal,
  precipUnit,
} from '../utils/format'
import { aqiLabel, uvLabel, windDirection } from '../utils/weatherCodes'
import { todayDailyIndex, weatherStory } from '../utils/weatherStory'
import { willIGetWet } from '../utils/wetSummary'
import { resolvePrecipKind } from '../utils/precipKind'
import { NextHourHero } from './NextHourHero'

interface Props {
  weather: WeatherData
  units: Units
  placeName: string
  air?: AirQualityData | null
  /** Solara blend note */
  sourceLine?: string | null
}

export function TodayHero({ weather, units, placeName, air = null, sourceLine }: Props) {
  const story = useMemo(
    () => weatherStory(weather, units, placeName, air),
    [weather, units, placeName, air],
  )
  const wet = useMemo(() => willIGetWet(weather), [weather])
  const ti = todayDailyIndex(weather)
  const c = weather.current
  const h = weather.hourly
  const tz = weather.timezone
  const now = Date.now()
  const idx = Math.max(
    0,
    h.time.findIndex((t) => parseWeatherLocal(t, tz) >= now - 30 * 60_000),
  )
  const uv = h.uv_index[idx] ?? weather.daily.uv_index_max[ti] ?? 0
  const uvInfo = uvLabel(uv)
  const popMax = weather.daily.precipitation_probability_max[ti] ?? 0
  const precipSum = weather.daily.precipitation_sum[ti] ?? 0
  const aqi = air?.current?.us_aqi ?? air?.current?.european_aqi ?? null
  const aqiInfo = aqi != null ? aqiLabel(aqi) : null
  const sunrise = weather.daily.sunrise[ti]
  const sunset = weather.daily.sunset[ti]
  const kind = resolvePrecipKind(c.temperature_2m, c.weather_code, wet.level !== 'dry')

  return (
    <section className={`panel today-hero wet-${wet.level}`} aria-label="Today at a glance">
      <div className="today-hero-head">
        <div>
          <p className="today-hero-kicker">Today at a glance</p>
          <h2 className="today-hero-title">{placeName}</h2>
        </div>
        <span className={`summary-wet-pill wet-${wet.level}`}>
          {wet.umbrella ? '☔ ' : ''}
          {wet.title}
        </span>
      </div>

      <p className="today-hero-story">{story}</p>
      <p className="today-hero-wet">{wet.detail}</p>

      <div className="today-hero-chips" aria-label="Key stats">
        <span className="today-chip">
          💨 {formatSpeed(c.wind_speed_10m, units)} {windDirection(c.wind_direction_10m)}
        </span>
        {uv >= 0.5 && (
          <span className="today-chip" style={{ borderColor: uvInfo.color }}>
            UV {uv < 0.5 ? '0' : Math.round(uv)} · {uvInfo.label}
          </span>
        )}
        <span className="today-chip">
          💧 {Math.round(popMax)}% ·{' '}
          {hasPrecipMm(precipSum)
            ? `${formatPrecipAmount(precipSum, units)} ${precipUnit(units)}`
            : kind === 'snow'
              ? 'snow risk'
              : 'little precip'}
        </span>
        {aqiInfo && aqi != null && (
          <span className="today-chip" style={{ borderColor: aqiInfo.color }}>
            AQI {Math.round(aqi)} · {aqiInfo.label}
          </span>
        )}
        {sunrise && sunset && (
          <span className="today-chip">
            ↑ {formatTime(sunrise, tz)} · ↓ {formatTime(sunset, tz)}
          </span>
        )}
        <span className="today-chip">
          H {Math.round(convertTemp(weather.daily.temperature_2m_max[ti], units))}° · L{' '}
          {Math.round(convertTemp(weather.daily.temperature_2m_min[ti], units))}°
        </span>
      </div>

      <div className="today-hero-nh">
        <NextHourHero weather={weather} units={units} placeName={placeName} compact />
      </div>

      <p className="today-hero-source">
        {sourceLine ||
          (weather.solara_source?.strategy
            ? `Sources · Solara blend (${weather.solara_source.strategy}) · Open-Meteo`
            : 'Sources · Open-Meteo forecast · RainViewer radar')}
        {weather.current?.time
          ? ` · model time ${formatTime(weather.current.time, tz)}`
          : ''}
      </p>
    </section>
  )
}
