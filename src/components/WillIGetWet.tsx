import type { WeatherData } from '../api/types'
import { willIGetWet } from '../utils/wetSummary'

interface Props {
  weather: WeatherData
}

export function WillIGetWet({ weather }: Props) {
  const s = willIGetWet(weather)
  const emoji = s.level === 'wet' ? '☔' : s.level === 'maybe' ? '🌂' : '☀️'
  const action = s.umbrella
    ? 'Bring an umbrella or rain shell'
    : 'No rain gear needed'

  return (
    <section
      className={`panel wet-panel wet-decision level-${s.level}`}
      aria-label="Rain risk"
    >
      <div className="wet-decision-row">
        <div className="wet-decision-icon" aria-hidden>
          {emoji}
        </div>
        <div className="wet-decision-copy">
          <p className="wet-kicker">Will you get wet?</p>
          <p className="wet-title">{s.title}</p>
          <p className="wet-detail">{s.detail}</p>
        </div>
        <span className={`wet-badge ${s.level}`}>
          {s.level === 'dry' ? 'Dry' : s.level === 'wet' ? 'Wet' : 'Maybe'}
        </span>
      </div>
      <p className={`wet-umbrella ${s.umbrella ? 'need' : 'optional'}`}>
        <span className="wet-umbrella-mark" aria-hidden>
          {s.umbrella ? '✓' : '○'}
        </span>
        {action}
      </p>
    </section>
  )
}
