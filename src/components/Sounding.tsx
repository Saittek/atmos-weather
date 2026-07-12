import type { PressureLevelProfile } from '../api/types'
import type { Units } from '../utils/format'
import { convertSpeed, convertTemp, formatTime, speedUnit } from '../utils/format'

interface Props {
  profile: PressureLevelProfile | null
  units: Units
  timezone?: string
}

export function Sounding({ profile, units, timezone }: Props) {
  if (!profile) {
    return (
      <section className="panel sounding-panel">
        <div className="panel-header">
          <h2>🌡 Atmosphere</h2>
        </div>
        <p className="muted-center">Pressure-level profile unavailable.</p>
      </section>
    )
  }

  const temps = profile.temperature.map((t) =>
    t == null ? null : convertTemp(t, units),
  )
  const validTemps = temps.filter((t): t is number => t != null)
  const minT = Math.min(...validTemps)
  const maxT = Math.max(...validTemps)
  const span = Math.max(maxT - minT, 1)

  const W = 280
  const H = 200
  const padL = 36
  const padR = 12
  const padT = 12
  const padB = 20

  const points = profile.levels
    .map((level, i) => {
      const t = temps[i]
      if (t == null) return null
      // pressure: 1000 at bottom, 200 at top
      const pMin = 200
      const pMax = 1000
      const y = padT + ((level - pMin) / (pMax - pMin)) * (H - padT - padB)
      const x = padL + ((t - minT) / span) * (W - padL - padR)
      return { x, y, level, t, rh: profile.relative_humidity[i], ws: profile.wind_speed[i] }
    })
    .filter(Boolean) as {
    x: number
    y: number
    level: number
    t: number
    rh: number | null
    ws: number | null
  }[]

  const poly = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  return (
    <section className="panel sounding-panel">
      <div className="panel-header">
        <h2>🌡 Atmosphere</h2>
        <span className="panel-hint">
          {formatTime(profile.time, timezone)} · simplified profile
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="sounding-chart">
        {/* grid */}
        {[1000, 850, 700, 500, 300, 200].map((lv) => {
          const y = padT + ((lv - 200) / (1000 - 200)) * (H - padT - padB)
          return (
            <g key={lv}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
              <text x={4} y={y + 3} className="sound-label">
                {lv}
              </text>
            </g>
          )
        })}
        <polyline
          fill="none"
          stroke="#fbbf24"
          strokeWidth="2.5"
          strokeLinejoin="round"
          points={poly}
        />
        {points.map((p) => (
          <circle key={p.level} cx={p.x} cy={p.y} r="3.5" fill="#fbbf24" />
        ))}
      </svg>
      <div className="sounding-table">
        {points.map((p) => (
          <div key={p.level} className="sound-row">
            <span>{p.level} hPa</span>
            <span>
              {Math.round(p.t)}°
            </span>
            <span>{p.rh != null ? `${Math.round(p.rh)}% RH` : '—'}</span>
            <span>
              {p.ws != null
                ? `${Math.round(convertSpeed(p.ws, units))} ${speedUnit(units)}`
                : '—'}
            </span>
          </div>
        ))}
      </div>
      <p className="model-note">
        Temp vs height (pressure). Cooling aloft / dry layers help gauge storm potential.
      </p>
    </section>
  )
}
