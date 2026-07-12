import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { formatSpeed, formatTemp } from '../utils/format'
import { todayDayParts } from '../utils/coreWeather'
import { WeatherIcon3D } from './WeatherIcon3D'

interface Props {
  weather: WeatherData
  units: Units
}

/** Morning → afternoon → evening → overnight story for today */
export function TodayTimeline({ weather, units }: Props) {
  const parts = todayDayParts(weather)

  return (
    <section className="panel today-timeline" aria-label="Today by time of day">
      <div className="panel-header">
        <h2>Today at a glance</h2>
      </div>
      <div className="daypart-grid">
        {parts.map((p) => (
          <article
            key={p.id}
            className={`daypart-card ${p.isNow ? 'is-now' : ''} ${p.isPast ? 'is-past' : ''}`}
          >
            <div className="daypart-top">
              <span className="daypart-emoji" aria-hidden>
                {p.emoji}
              </span>
              <div>
                <strong>{p.label}</strong>
                {p.isNow && <em className="daypart-now">Now</em>}
              </div>
              <WeatherIcon3D
                code={p.code}
                isDay={p.id !== 'night'}
                size="sm"
                forceAnimate={p.isNow}
              />
            </div>
            <p className="daypart-temp">{formatTemp(p.temp, units)}</p>
            <p className="daypart-sum">{p.summary}</p>
            <div className="daypart-meta">
              <span>☔ {p.pop}%</span>
              <span>💨 {formatSpeed(p.wind, units)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
