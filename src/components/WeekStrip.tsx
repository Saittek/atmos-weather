import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { formatTemp } from '../utils/format'
import { weekStrip } from '../utils/coreWeather'
import { WeatherIcon3D } from './WeatherIcon3D'

interface Props {
  weather: WeatherData
  units: Units
}

/** Compact 7-day strip — always visible near the top of the feed */
export function WeekStrip({ weather, units }: Props) {
  const days = weekStrip(weather)
  if (!days.length) return null

  const highs = days.map((d) => d.high)
  const lows = days.map((d) => d.low)
  const maxH = Math.max(...highs)
  const minL = Math.min(...lows)
  const span = Math.max(maxH - minL, 1)

  return (
    <section className="panel week-strip" aria-label="7-day outlook">
      <div className="panel-header">
        <h2>7-day</h2>
      </div>
      <div className="week-strip-row">
        {days.map((d) => {
          const topPct = ((maxH - d.high) / span) * 100
          const barPct = ((d.high - d.low) / span) * 100
          return (
            <div key={d.date} className={`week-chip ${d.isToday ? 'is-today' : ''}`}>
              <span className="week-day">{d.weekday}</span>
              <WeatherIcon3D code={d.code} isDay size="sm" forceAnimate={false} />
              <span className="week-hi">{formatTemp(d.high, units)}</span>
              <div className="week-bar-track" aria-hidden>
                <div
                  className="week-bar"
                  style={{ top: `${topPct}%`, height: `${Math.max(barPct, 8)}%` }}
                />
              </div>
              <span className="week-lo">{formatTemp(d.low, units)}</span>
              <span className={`week-pop ${d.pop >= 40 ? 'wet' : ''}`}>
                {d.pop > 0 ? `${d.pop}%` : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
