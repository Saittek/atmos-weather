import type { WeatherData } from '../api/types'
import { willIGetWet } from '../utils/wetSummary'

interface Props {
  weather: WeatherData
}

export function WillIGetWet({ weather }: Props) {
  const s = willIGetWet(weather)

  return (
    <section className={`panel wet-panel level-${s.level}`}>
      <div className="panel-header">
        <h2>🌂 Rain Risk</h2>
        <span className={`wet-badge ${s.level}`}>
          {s.level === 'dry' ? 'Dry' : s.level === 'wet' ? 'Wet' : 'Maybe'}
        </span>
      </div>
      <p className="wet-title">{s.title}</p>
      <p className="wet-detail">{s.detail}</p>
      <p className="wet-umbrella">
        {s.umbrella ? '✓ Bring an umbrella or rain shell' : '✗ Umbrella optional'}
      </p>
    </section>
  )
}
