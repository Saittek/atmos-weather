/**
 * Today at a glance: outlook + wet risk + key stats + full Conditions grid.
 * (Next-hour hero removed — hourly strip covers precip by hour.)
 */
import { useMemo } from 'react'
import type { AirQualityData, WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import {
  convertTemp,
  formatDistance,
  formatPrecip,
  formatPrecipAmount,
  formatPressure,
  formatSpeed,
  formatTemp,
  formatTime,
  hasPrecipMm,
  parseWeatherLocal,
  precipUnit,
} from '../utils/format'
import { aqiLabel, uvLabel, windDirection } from '../utils/weatherCodes'
import { todayDailyIndex, weatherStory } from '../utils/weatherStory'
import { willIGetWet } from '../utils/wetSummary'
import { resolvePrecipKind } from '../utils/precipKind'

interface Props {
  weather: WeatherData
  units: Units
  placeName: string
  air?: AirQualityData | null
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
  const vis = h.visibility[idx] ?? 10000
  const dew = h.dew_point_2m[idx] ?? c.temperature_2m - 5

  const high = Math.max(
    weather.daily.temperature_2m_max[ti] ?? c.temperature_2m,
    c.temperature_2m,
  )
  const low = Math.min(
    weather.daily.temperature_2m_min[ti] ?? c.temperature_2m,
    c.temperature_2m,
  )

  const conditionCards = [
    {
      title: 'Wind',
      value: formatSpeed(c.wind_speed_10m, units),
      sub: `${windDirection(c.wind_direction_10m)} · Gusts ${formatSpeed(c.wind_gusts_10m, units)}`,
      icon: '💨',
      extra: (
        <div
          className="wind-compass"
          style={{ transform: `rotate(${c.wind_direction_10m}deg)` }}
          aria-hidden
        >
          <span>↑</span>
        </div>
      ),
    },
    {
      title: 'Humidity',
      value: `${c.relative_humidity_2m}%`,
      sub: `Dew point ${formatTemp(dew, units)}`,
      icon: '💧',
    },
    {
      title: 'Pressure',
      value: formatPressure(c.pressure_msl, units),
      sub: 'Mean sea level',
      icon: '⏱️',
    },
    {
      title: 'UV Index',
      value: uv < 0.5 ? '0' : uv.toFixed(1),
      sub: uvInfo.label,
      icon: '☀️',
      accent: uvInfo.color,
    },
    {
      title: 'Visibility',
      value: formatDistance(vis, units),
      sub: vis > 10000 ? 'Clear' : vis > 5000 ? 'Moderate' : 'Reduced',
      icon: '👁️',
    },
    {
      title: 'Cloud cover',
      value: `${c.cloud_cover}%`,
      sub: c.cloud_cover < 25 ? 'Mostly clear' : c.cloud_cover < 60 ? 'Partly cloudy' : 'Cloudy',
      icon: '☁️',
    },
    {
      title: 'Precipitation',
      value: formatPrecip(c.precipitation, units),
      sub:
        c.snowfall > 0
          ? `Snow ${formatPrecip(c.snowfall * 10, units)}`
          : c.rain + c.showers > 0
            ? 'Falling now'
            : `Today ${hasPrecipMm(precipSum) ? `${formatPrecipAmount(precipSum, units)} ${precipUnit(units)}` : 'dry'}`,
      icon: '🌧️',
    },
    {
      title: 'Feels like',
      value: formatTemp(c.apparent_temperature, units),
      sub: `Actual ${formatTemp(c.temperature_2m, units)}`,
      icon: '🌡️',
    },
  ]

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
          H {Math.round(convertTemp(high, units))}° · L {Math.round(convertTemp(low, units))}°
        </span>
        <span className="today-chip">
          💨 {formatSpeed(c.wind_speed_10m, units)} {windDirection(c.wind_direction_10m)}
        </span>
        {uv >= 0.5 && (
          <span className="today-chip" style={{ borderColor: uvInfo.color }}>
            UV {Math.round(uv)} · {uvInfo.label}
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
      </div>

      <div className="today-conditions">
        <h3 className="today-conditions-title">Conditions</h3>
        <div className="detail-cards today-conditions-grid">
          {conditionCards.map((card) => (
            <article className="detail-card" key={card.title}>
              <div className="detail-card-top">
                <span className="detail-icon" aria-hidden>
                  {card.icon}
                </span>
                <span className="detail-title">{card.title}</span>
                {card.extra}
              </div>
              <p
                className="detail-value"
                style={card.accent ? { color: card.accent } : undefined}
              >
                {card.value}
              </p>
              <p className="detail-sub">{card.sub}</p>
            </article>
          ))}
        </div>
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
