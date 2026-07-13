import { useMemo, useState } from 'react'
import type { AirQualityData, WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import {
  ACTIVITY_MODES,
  adviseActivityMode,
  type ActivityModeId,
} from '../utils/activityModes'

interface Props {
  weather: WeatherData
  units: Units
  air: AirQualityData | null
}

export function ActivityModes({ weather, units, air }: Props) {
  const [mode, setMode] = useState<ActivityModeId>('commute')
  const advice = useMemo(
    () => adviseActivityMode(mode, weather, units, air),
    [mode, weather, units, air],
  )

  return (
    <section className="panel activity-modes-panel">
      <div className="panel-header">
        <h2>🎯 Today’s modes</h2>
        <span className="panel-hint">Commute · school · outdoor · evening</span>
      </div>
      <div className="activity-mode-tabs" role="tablist" aria-label="Activity mode">
        {ACTIVITY_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            className={`activity-tab ${mode === m.id ? 'active' : ''}`}
            onClick={() => setMode(m.id)}
          >
            <span aria-hidden>{m.emoji}</span> {m.label}
          </button>
        ))}
      </div>
      <div className={`activity-verdict verdict-${advice.verdict}`}>
        <strong>
          {advice.mode.emoji} {advice.title}
        </strong>
        <span>{advice.mode.blurb}</span>
      </div>
      <ul className="activity-points">
        {advice.points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </section>
  )
}
