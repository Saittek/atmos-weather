import type { AirQualityData, WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { formatDistance, formatHour, parseWeatherLocal } from '../utils/format'
import { isDaytimeNow } from '../utils/daylight'
import {
  displayOptsFromWeather,
  effectiveWeatherCode,
  getWeatherInfo,
  WEATHER_CODE_SMOKE,
} from '../utils/weatherCodes'

interface Props {
  weather: WeatherData
  units: Units
  air?: AirQualityData | null
}

function visLabel(m: number): string {
  if (m >= 10000) return 'Excellent'
  if (m >= 5000) return 'Good'
  if (m >= 2000) return 'Fair'
  if (m >= 1000) return 'Poor'
  return 'Very poor'
}

/** Visibility + fog/smoke risk for drivers */
export function VisibilityPanel({ weather, units, air = null }: Props) {
  const h = weather.hourly
  const tz = weather.timezone
  const now = Date.now()
  let nowVis: number | null = null
  let worst = Infinity
  let worstTime = ''
  const next: { t: string; v: number; code: number }[] = []

  for (let i = 0; i < h.time.length; i++) {
    const ms = parseWeatherLocal(h.time[i], tz)
    const v = h.visibility[i]
    if (v == null) continue
    if (ms + 45 * 60_000 >= now && nowVis == null) nowVis = v
    if (ms >= now && ms < now + 12 * 3600_000) {
      if (v < worst) {
        worst = v
        worstTime = h.time[i]
      }
      if (next.length < 8) {
        next.push({ t: h.time[i], v, code: h.weather_code[i] })
      }
    }
  }

  const displayCode = effectiveWeatherCode(
    weather.current.weather_code,
    displayOptsFromWeather(weather, air),
  )
  const smoky = displayCode === WEATHER_CODE_SMOKE
  const foggy = displayCode === 45 || displayCode === 48
  const info = getWeatherInfo(displayCode, isDaytimeNow(weather))

  return (
    <section className="panel vis-panel">
      <div className="panel-header">
        <h2>{smoky ? 'Visibility & smoke' : 'Visibility & fog'}</h2>
      </div>
      <div className="vis-main">
        <div>
          <span className="label">Now</span>
          <strong>
            {nowVis != null ? formatDistance(nowVis, units) : '—'}
          </strong>
          <span className="muted">
            {nowVis != null ? visLabel(nowVis) : info.label}
            {smoky ? ' · smoke reported' : foggy ? ' · fog reported' : ''}
          </span>
        </div>
        <div>
          <span className="label">Lowest next 12h</span>
          <strong>
            {worst < Infinity ? formatDistance(worst, units) : '—'}
          </strong>
          <span className="muted">
            {worstTime ? `Around ${formatHour(worstTime, tz)}` : 'No data'}
          </span>
        </div>
      </div>
      <ul className="vis-list">
        {next.map((n) => (
          <li key={n.t}>
            <span>{formatHour(n.t, tz)}</span>
            <span className={n.v < 2000 ? 'bad' : ''}>{formatDistance(n.v, units)}</span>
            <span className="muted">
              {getWeatherInfo(
                // Hourly rows: remap fog→smoke only when current air is smoky
                // (hourly has no per-hour PM in this panel)
                smoky && (n.code === 45 || n.code === 48)
                  ? WEATHER_CODE_SMOKE
                  : n.code,
                true,
              ).label}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
