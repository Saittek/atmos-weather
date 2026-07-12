import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { convertPrecip, formatHour, parseWeatherLocal, precipUnit } from '../utils/format'

interface Props {
  weather: WeatherData
  units: Units
}

export function PrecipChart({ weather, units }: Props) {
  const { hourly, timezone } = weather
  const now = Date.now()
  const start = Math.max(
    0,
    hourly.time.findIndex((t) => parseWeatherLocal(t, timezone) >= now - 30 * 60 * 1000),
  )
  const hours = 24
  const slice = Array.from({ length: hours }, (_, i) => i + start).filter(
    (i) => i < hourly.time.length,
  )

  const amounts = slice.map((i) => convertPrecip(hourly.precipitation[i] ?? 0, units))
  const maxAmt = Math.max(...amounts, units === 'metric' ? 1 : 0.05)

  // Show time under every bar, abbreviated on dense rows
  const labelStep = slice.length > 16 ? 2 : 1

  return (
    <section className="panel precip-panel">
      <div className="panel-header">
        <h2>Precipitation — Next 24h</h2>
        <span className="panel-hint">
          {slice.length
            ? `${formatHour(hourly.time[slice[0]], timezone)} → ${formatHour(hourly.time[slice[slice.length - 1]], timezone)}`
            : ''}{' '}
          · {precipUnit(units)}
        </span>
      </div>
      <div className="precip-chart">
        {slice.map((i, idx) => {
          const amt = amounts[idx]
          const pop = hourly.precipitation_probability[i] ?? 0
          const h = Math.max(amt > 0 ? 8 : 2, (amt / maxAmt) * 100)
          const showTime = idx === 0 || idx === slice.length - 1 || idx % labelStep === 0
          const timeLabel =
            idx === 0 ? 'Now' : formatHour(hourly.time[i], timezone)
          return (
            <div
              className="precip-col"
              key={hourly.time[i]}
              title={`${timeLabel}: ${amt.toFixed(2)} ${precipUnit(units)} · ${pop}%`}
            >
              <div className="precip-bar-area">
                <div
                  className={`precip-bar ${amt > 0 ? 'has' : ''}`}
                  style={{ height: `${h}%` }}
                />
              </div>
              <span className="precip-pop">{pop > 0 ? `${pop}%` : ''}</span>
              <span className={`precip-hour ${showTime ? 'show' : ''}`}>
                {showTime ? timeLabel : ''}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
