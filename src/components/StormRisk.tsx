import type { PressureLevelProfile, WeatherData } from '../api/types'
import { stormRiskScore } from '../utils/severeTimeline'

interface Props {
  weather: WeatherData
  profile: PressureLevelProfile | null
}

export function StormRisk({ weather, profile }: Props) {
  const r = stormRiskScore(weather, profile)
  const pct = Math.min(100, r.score * 12)

  return (
    <section className={`panel storm-risk-panel risk-${r.label.toLowerCase()}`}>
      <div className="panel-header">
        <h2>🌩 Storm potential</h2>
        <span className="panel-hint">Model + atmosphere proxy</span>
      </div>
      <div className="storm-risk-meter">
        <div className="storm-risk-fill" style={{ width: `${Math.max(8, pct)}%` }} />
      </div>
      <p className="storm-risk-label">
        <strong>{r.label}</strong> storm risk today
      </p>
      <p className="storm-risk-detail">{r.detail}</p>
      <p className="model-note">Not a lightning network — use radar & official alerts for real-time storms.</p>
    </section>
  )
}
