import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { convertPrecip, convertTemp, formatHour, parseWeatherLocal } from '../utils/format'
import { ChartTimeAxis, BarTimeLabels } from './ChartTimeAxis'

interface Props {
  weather: WeatherData
  units: Units
}

function polyline(values: number[], w: number, h: number, padX = 8, padY = 8): string {
  if (!values.length) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(max - min, 0.5)
  return values
    .map((v, i) => {
      const x = padX + (i / Math.max(values.length - 1, 1)) * (w - padX * 2)
      const y = padY + (1 - (v - min) / span) * (h - padY * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

export function HourlyCharts({ weather, units }: Props) {
  const h = weather.hourly
  const tz = weather.timezone
  const now = Date.now()
  const start = Math.max(
    0,
    h.time.findIndex((t) => parseWeatherLocal(t, tz) >= now - 30 * 60 * 1000),
  )
  const n = 24
  const idxs = Array.from({ length: n }, (_, i) => i + start).filter((i) => i < h.time.length)

  if (!idxs.length) {
    return (
      <section className="panel charts-panel">
        <div className="panel-header">
          <h2>Graphs — 24h</h2>
        </div>
        <p className="muted-center">Hourly graph data unavailable.</p>
      </section>
    )
  }

  const times = idxs.map((i) => h.time[i])
  const temps = idxs.map((i) => convertTemp(h.temperature_2m[i], units))
  const precs = idxs.map((i) => convertPrecip(h.precipitation[i] ?? 0, units))
  const pops = idxs.map((i) => h.precipitation_probability[i] ?? 0)

  const W = 360
  const H = 100
  const padX = 10
  const padY = 10
  const tempPts = polyline(temps, W, H, padX, padY)
  const popPts = polyline(pops, W, H, padX, padY)
  const tempArea = tempPts
    ? `${tempPts} ${W - padX},${H - padY} ${padX},${H - padY}`
    : ''

  const maxP = Math.max(...precs, units === 'metric' ? 0.5 : 0.02)
  const startLabel = formatHour(times[0], tz)
  const endLabel = formatHour(times[times.length - 1], tz)

  return (
    <section className="panel charts-panel">
      <div className="panel-header">
        <h2>Graphs — 24h</h2>
        <span className="panel-hint">
          {startLabel} → {endLabel}
        </span>
      </div>

      <div className="chart-block">
        <div className="chart-label">
          Temperature
          <span>
            {Math.round(Math.min(...temps))}° / {Math.round(Math.max(...temps))}°
          </span>
        </div>
        <div className="chart-frame">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="line-chart"
            preserveAspectRatio="none"
            role="img"
            aria-label="Temperature over 24 hours"
          >
            <defs>
              <linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(56,189,248,0.35)" />
                <stop offset="100%" stopColor="rgba(56,189,248,0)" />
              </linearGradient>
            </defs>
            {/* light vertical guides at labeled hours */}
            {times.map((_, i) => {
              if (i % Math.max(1, Math.round(times.length / 6)) !== 0 && i !== times.length - 1)
                return null
              const x = padX + (i / Math.max(times.length - 1, 1)) * (W - padX * 2)
              return (
                <line
                  key={`g-t-${i}`}
                  x1={x}
                  x2={x}
                  y1={padY}
                  y2={H - padY}
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="1"
                />
              )
            })}
            <polyline
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={tempPts}
            />
            {tempArea && <polygon fill="url(#tempFill)" points={tempArea} />}
          </svg>
          <ChartTimeAxis times={times} timezone={tz} />
        </div>
      </div>

      <div className="chart-block">
        <div className="chart-label">
          Precip chance
          <span>max {Math.max(...pops)}%</span>
        </div>
        <div className="chart-frame">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="line-chart"
            preserveAspectRatio="none"
            role="img"
            aria-label="Precipitation probability over 24 hours"
          >
            {times.map((_, i) => {
              if (i % Math.max(1, Math.round(times.length / 6)) !== 0 && i !== times.length - 1)
                return null
              const x = padX + (i / Math.max(times.length - 1, 1)) * (W - padX * 2)
              return (
                <line
                  key={`g-p-${i}`}
                  x1={x}
                  x2={x}
                  y1={padY}
                  y2={H - padY}
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="1"
                />
              )
            })}
            <polyline
              fill="none"
              stroke="#a78bfa"
              strokeWidth="2.5"
              strokeLinejoin="round"
              points={popPts}
            />
          </svg>
          <ChartTimeAxis times={times} timezone={tz} />
        </div>
      </div>

      <div className="chart-block">
        <div className="chart-label">
          Precipitation
          <span>
            peak {units === 'metric' ? maxP.toFixed(1) : maxP.toFixed(2)}
          </span>
        </div>
        <div className="chart-frame">
          <div className="mini-bars" role="img" aria-label="Precipitation amounts">
            {precs.map((p, i) => (
              <div
                key={times[i]}
                className={`mini-bar-col ${p > 0.001 ? 'wet' : ''}`}
                title={`${formatHour(times[i], tz)}: ${p.toFixed(2)}`}
              >
                <div
                  className="mini-bar"
                  style={{ height: `${Math.max(6, (p / maxP) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <BarTimeLabels times={times} timezone={tz} />
        </div>
      </div>
    </section>
  )
}
