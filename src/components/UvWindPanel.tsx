import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { formatHour, formatSpeed, formatTemp, parseWeatherLocal } from '../utils/format'

interface Props {
  weather: WeatherData
  units: Units
}

function uvLabel(uv: number): string {
  if (uv < 3) return 'Low'
  if (uv < 6) return 'Moderate'
  if (uv < 8) return 'High'
  if (uv < 11) return 'Very high'
  return 'Extreme'
}

function uvColor(uv: number): string {
  if (uv < 3) return '#4ade80'
  if (uv < 6) return '#facc15'
  if (uv < 8) return '#fb923c'
  if (uv < 11) return '#f87171'
  return '#c026d3'
}

/** Next 12h UV + wind/gust outlook — always useful core weather */
export function UvWindPanel({ weather, units }: Props) {
  const h = weather.hourly
  const tz = weather.timezone
  const now = Date.now()
  const rows: {
    time: string
    uv: number
    wind: number
    gust: number
    temp: number
  }[] = []

  for (let i = 0; i < h.time.length && rows.length < 12; i++) {
    const ms = parseWeatherLocal(h.time[i], tz)
    if (ms + 30 * 60_000 < now) continue
    rows.push({
      time: h.time[i],
      uv: h.uv_index[i] ?? 0,
      wind: h.wind_speed_10m[i] ?? 0,
      gust: h.wind_gusts_10m[i] ?? 0,
      temp: h.temperature_2m[i] ?? 0,
    })
  }

  const peakUv = rows.reduce((m, r) => Math.max(m, r.uv), 0)
  const peakGust = rows.reduce((m, r) => Math.max(m, r.gust), 0)

  return (
    <section className="panel uv-wind-panel">
      <div className="panel-header">
        <h2>UV & wind next 12h</h2>
      </div>
      <div className="uv-wind-summary">
        <div>
          <span className="label">Peak UV</span>
          <strong style={{ color: uvColor(peakUv) }}>
            {peakUv.toFixed(1)} · {uvLabel(peakUv)}
          </strong>
        </div>
        <div>
          <span className="label">Peak gust</span>
          <strong>{formatSpeed(peakGust, units)}</strong>
        </div>
      </div>
      <div className="uv-wind-strip" role="list">
        {rows.map((r) => (
          <div key={r.time} className="uv-wind-cell" role="listitem">
            <span className="uv-hour">{formatHour(r.time, tz)}</span>
            <span
              className="uv-bar"
              style={{
                height: `${Math.max(8, Math.min(100, r.uv * 9))}%`,
                background: uvColor(r.uv),
              }}
              title={`UV ${r.uv.toFixed(1)}`}
            />
            <span className="uv-val">{r.uv < 0.5 ? '—' : r.uv.toFixed(0)}</span>
            <span className="wind-val" title={`Gust ${formatSpeed(r.gust, units)}`}>
              {formatSpeed(r.wind, units).replace(/ (km\/h|mph)/, '')}
            </span>
            <span className="temp-val">{formatTemp(r.temp, units)}</span>
          </div>
        ))}
      </div>
      <p className="model-note">UV bar · wind speed (gusts in tooltip) · temp</p>
    </section>
  )
}
