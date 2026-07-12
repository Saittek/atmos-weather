import type { AirQualityData, WeatherData } from '../api/types'
import { fireSmokeRisk } from '../utils/fireRisk'

interface Props {
  weather: WeatherData
  air: AirQualityData | null
}

export function FireSmoke({ weather, air }: Props) {
  const r = fireSmokeRisk(weather, air)

  return (
    <section className={`panel fire-panel fire-${r.fireLevel}`}>
      <div className="panel-header">
        <h2>🔥 Fire weather & smoke</h2>
      </div>
      <div className="fire-grid">
        <article className="fire-card">
          <span className="fire-label">Fire-weather (heuristic)</span>
          <strong className={`fire-level-text ${r.fireLevel}`}>{r.fireLabel}</strong>
          <p>{r.fireDetail}</p>
        </article>
        <article className="fire-card">
          <span className="fire-label">Air / smoke</span>
          <strong style={{ color: r.smokeColor }}>{r.smokeLevel}</strong>
          <p>
            {r.pm25 != null ? `PM2.5 ~${Math.round(r.pm25)} µg/m³. ` : ''}
            {r.smokeAdvice}
          </p>
        </article>
      </div>
      <p className="model-note">
        Not an official Red Flag Warning — always follow NWS / local fire agencies.
      </p>
    </section>
  )
}
