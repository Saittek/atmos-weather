import type { AirQualityData, PressureLevelProfile, WeatherAlert, WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { buildSevereTimeline } from '../utils/severeTimeline'

interface Props {
  weather: WeatherData
  units: Units
  alerts: WeatherAlert[]
  air: AirQualityData | null
  profile: PressureLevelProfile | null
}

export function SevereTimeline({ weather, units, alerts, air, profile }: Props) {
  const events = buildSevereTimeline(weather, units, alerts, air, profile)

  return (
    <section className="panel severe-timeline-panel" aria-label="What matters next">
      <div className="panel-header">
        <h2>⏱ What matters next</h2>
        <span className="panel-hint">Next ~24 hours</span>
      </div>
      {!events.length ? (
        <p className="muted-center">Quiet stretch — no major flags in the next day.</p>
      ) : (
        <ol className="severe-timeline-list">
          {events.map((e) => (
            <li key={e.id} className={`st-item level-${e.level}`}>
              <span className="st-when">{e.when}</span>
              <div className="st-body">
                <strong>{e.title}</strong>
                <p>{e.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
