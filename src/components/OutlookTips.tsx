import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { dayCompareSummary, weekendOutlook } from '../utils/outlook'
import { activityTips, clothingTips } from '../utils/tips'

interface Props {
  weather: WeatherData
  units: Units
}

export function OutlookTips({ weather, units }: Props) {
  const weekend = weekendOutlook(weather, units)
  const compare = dayCompareSummary(weather, units)
  const clothes = clothingTips(weather, units)
  const activities = activityTips(weather, units)

  return (
    <>
      <section className="panel outlook-panel">
        <div className="panel-header">
          <h2>🗓 Outlook</h2>
        </div>
        {compare && <p className="outlook-compare">{compare}</p>}
        <pre className="outlook-text">{weekend}</pre>
      </section>

      <section className="panel tips-panel">
        <div className="panel-header">
          <h2>👕 What to wear</h2>
        </div>
        <ul className="tip-list">
          {clothes.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <section className="panel activity-panel">
        <div className="panel-header">
          <h2>🎯 Activities</h2>
        </div>
        <div className="activity-grid">
          {activities.map((a) => (
            <article key={a.title} className={`activity-card score-${a.score}`}>
              <span className="act-icon">{a.icon}</span>
              <div>
                <strong>{a.title}</strong>
                <p>{a.detail}</p>
              </div>
              <span className="act-score">{a.score}</span>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}
