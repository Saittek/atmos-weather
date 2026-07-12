import type { ModelSeries } from '../api/types'
import type { Units } from '../utils/format'
import { convertTemp, formatHour, parseWeatherLocal } from '../utils/format'
import { ChartTimeAxis } from './ChartTimeAxis'

interface Props {
  models: ModelSeries[]
  units: Units
  timezone?: string
}

const COLORS = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24']

export function ModelCompare({ models, units, timezone }: Props) {
  const ok = models.filter((m) => m.hourly?.time?.length)
  if (!ok.length) {
    return (
      <section className="panel model-panel">
        <div className="panel-header">
          <h2>📡 Multi-model</h2>
        </div>
        <p className="muted-center">Model ensemble unavailable right now.</p>
      </section>
    )
  }

  const now = Date.now()
  const base = ok[0].hourly!
  const tz = timezone
  const start = Math.max(
    0,
    base.time.findIndex((t) => parseWeatherLocal(t, tz) >= now - 30 * 60 * 1000),
  )
  const n = 24
  const times = base.time.slice(start, start + n)

  const series = ok.map((m) => {
    const h = m.hourly!
    const map = new Map(h.time.map((t, i) => [t, h.temperature_2m[i] as number]))
    const vals = times.map((t) => {
      if (map.has(t)) return convertTemp(map.get(t)!, units)
      const idx = h.time.findIndex((x) => x >= t)
      const i = idx < 0 ? h.temperature_2m.length - 1 : idx
      return convertTemp(h.temperature_2m[i], units)
    })
    return { label: m.label, vals }
  })

  const all = series.flatMap((s) => s.vals)
  const minT = Math.min(...all)
  const maxT = Math.max(...all)
  const spread = maxT - minT

  const W = 360
  const H = 120
  const padX = 12
  const padY = 12

  const toPoly = (vals: number[]) =>
    vals
      .map((v, i) => {
        const x = padX + (i / Math.max(vals.length - 1, 1)) * (W - padX * 2)
        const y =
          padY + (1 - (v - minT) / Math.max(maxT - minT, 0.5)) * (H - padY * 2)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')

  const nowVals = series.map((s) => s.vals[0])
  const disagree = Math.max(...nowVals) - Math.min(...nowVals)
  const deg = units === 'metric' ? '°C' : '°F'
  const guideStep = Math.max(1, Math.round(times.length / 6))

  return (
    <section className="panel model-panel">
      <div className="panel-header">
        <h2>📡 Multi-model</h2>
        <span className="panel-hint">
          {formatHour(times[0], tz)} → {formatHour(times[times.length - 1], tz)} · spread{' '}
          {disagree.toFixed(1)}
          {deg}
        </span>
      </div>
      <div className="chart-frame">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="line-chart model-chart"
          role="img"
          aria-label="Multi-model temperature comparison over 24 hours"
        >
          {times.map((_, i) => {
            if (i % guideStep !== 0 && i !== times.length - 1) return null
            const x = padX + (i / Math.max(times.length - 1, 1)) * (W - padX * 2)
            return (
              <line
                key={`mg-${i}`}
                x1={x}
                x2={x}
                y1={padY}
                y2={H - padY}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="1"
              />
            )
          })}
          {series.map((s, i) => (
            <polyline
              key={s.label}
              fill="none"
              stroke={COLORS[i % COLORS.length]}
              strokeWidth="2.2"
              strokeLinejoin="round"
              points={toPoly(s.vals)}
            />
          ))}
        </svg>
        <ChartTimeAxis times={times} timezone={tz} />
      </div>
      <div className="model-legend">
        {series.map((s, i) => (
          <span key={s.label}>
            <i style={{ background: COLORS[i % COLORS.length] }} />
            {s.label}
            <em>
              {Math.round(s.vals[0])}
              {deg}
            </em>
          </span>
        ))}
      </div>
      <p className="model-note">
        {disagree < 1.5
          ? 'Models are in good agreement for the next hour.'
          : disagree < 4
            ? 'Moderate model spread — check radar for timing.'
            : 'High disagreement — lower confidence on exact temps/timing.'}{' '}
        Range {spread.toFixed(1)}
        {deg} over 24h.
      </p>
    </section>
  )
}
