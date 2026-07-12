import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import {
  formatDistance,
  formatPrecip,
  formatPressure,
  formatSpeed,
  formatTemp,
  parseWeatherLocal,
} from '../utils/format'
import { uvLabel, windDirection } from '../utils/weatherCodes'

interface Props {
  weather: WeatherData
  units: Units
}

export function WeatherDetails({ weather, units }: Props) {
  const c = weather.current
  const h = weather.hourly
  const now = Date.now()
  const idx = Math.max(
    0,
    h.time.findIndex(
      (t) => parseWeatherLocal(t, weather.timezone) >= now - 30 * 60 * 1000,
    ),
  )
  const uv = h.uv_index[idx] ?? 0
  const vis = h.visibility[idx] ?? 10000
  const dew = h.dew_point_2m[idx] ?? c.temperature_2m - 5
  const uvInfo = uvLabel(uv)

  const cards = [
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
      value: uv.toFixed(1),
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
            : 'None currently',
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
    <section className="panel details-panel">
      <div className="panel-header">
        <h2>Conditions</h2>
      </div>
      <div className="detail-cards">
        {cards.map((card) => (
          <article className="detail-card" key={card.title}>
            <div className="detail-card-top">
              <span className="detail-icon" aria-hidden>
                {card.icon}
              </span>
              <span className="detail-title">{card.title}</span>
              {card.extra}
            </div>
            <p className="detail-value" style={card.accent ? { color: card.accent } : undefined}>
              {card.value}
            </p>
            <p className="detail-sub">{card.sub}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
