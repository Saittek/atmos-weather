import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import {
  formatPressure,
  formatTemp,
  convertTemp,
} from '../utils/format'
import { parseWeatherLocal } from '../utils/format'
import { pressureTrend } from '../utils/weatherStory'

interface Props {
  weather: WeatherData
  units: Units
}

function humidityComfort(rh: number): string {
  if (rh < 30) return 'Dry air'
  if (rh < 60) return 'Comfortable humidity'
  if (rh < 75) return 'A bit muggy'
  return 'Humid / sticky'
}

export function ComfortPanel({ weather, units }: Props) {
  const c = weather.current
  const trend = pressureTrend(weather)
  const h = weather.hourly
  const now = Date.now()
  let dew = c.temperature_2m - 5
  let vis: number | null = null
  const idx = h.time.findIndex(
    (t) => parseWeatherLocal(t, weather.timezone) >= now - 30 * 60 * 1000,
  )
  const i = idx < 0 ? 0 : idx
  if (h.dew_point_2m?.[i] != null) dew = h.dew_point_2m[i]
  if (h.visibility?.[i] != null) vis = h.visibility[i]

  const feels = c.apparent_temperature
  const actual = c.temperature_2m
  const delta = convertTemp(feels, units) - convertTemp(actual, units)
  const feelsNote =
    Math.abs(delta) < 1.5
      ? 'Close to air temperature'
      : delta > 0
        ? 'Feels warmer (humidity / sun)'
        : 'Feels cooler (wind)'

  return (
    <section className="panel comfort-panel">
      <div className="panel-header">
        <h2>😊 Comfort & atmosphere</h2>
      </div>
      <div className="comfort-grid">
        <div className="comfort-card">
          <span className="label">Feels like</span>
          <strong>{formatTemp(feels, units)}</strong>
          <span className="sub">{feelsNote}</span>
        </div>
        <div className="comfort-card">
          <span className="label">Humidity</span>
          <strong>{c.relative_humidity_2m}%</strong>
          <span className="sub">{humidityComfort(c.relative_humidity_2m)}</span>
        </div>
        <div className="comfort-card">
          <span className="label">Dew point</span>
          <strong>{formatTemp(dew, units)}</strong>
          <span className="sub">
            {convertTemp(dew, units) >= (units === 'metric' ? 18 : 65)
              ? 'Muggy'
              : convertTemp(dew, units) <= (units === 'metric' ? 5 : 40)
                ? 'Crisp / dry'
                : 'Moderate'}
          </span>
        </div>
        <div className="comfort-card">
          <span className="label">Pressure</span>
          <strong>
            {trend.dir === 'up' ? '↑' : trend.dir === 'down' ? '↓' : '→'} {trend.label}
          </strong>
          <span className="sub">{trend.detail}</span>
        </div>
        <div className="comfort-card">
          <span className="label">MSL pressure</span>
          <strong>{formatPressure(c.pressure_msl, units)}</strong>
          <span className="sub">Mean sea level</span>
        </div>
        <div className="comfort-card">
          <span className="label">Visibility</span>
          <strong>
            {vis != null
              ? units === 'metric'
                ? `${(vis / 1000).toFixed(1)} km`
                : `${(vis / 1609).toFixed(1)} mi`
              : '—'}
          </strong>
          <span className="sub">
            {vis == null
              ? 'n/a'
              : vis > 10000
                ? 'Clear'
                : vis > 4000
                  ? 'Haze possible'
                  : 'Reduced'}
          </span>
        </div>
      </div>
    </section>
  )
}
