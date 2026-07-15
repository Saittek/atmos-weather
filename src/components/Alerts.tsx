import { useEffect, useMemo, useState } from 'react'
import type { WeatherAlert } from '../api/types'
import { alertActionTips } from '../utils/alertTips'
import { filterActiveAlerts } from '../utils/activeAlerts'

interface Props {
  alerts: WeatherAlert[]
  onHideAlert?: (id: string) => void
  onHideAll?: () => void
}

function severityColor(sev: string): string {
  switch (sev.toLowerCase()) {
    case 'extreme':
      return '#dc2626'
    case 'severe':
      return '#ea580c'
    case 'moderate':
      return '#ca8a04'
    case 'minor':
      return '#2563eb'
    default:
      return '#64748b'
  }
}

export function Alerts({ alerts, onHideAlert, onHideAll }: Props) {
  const active = useMemo(() => filterActiveAlerts(alerts), [alerts])
  const [expanded, setExpanded] = useState<string | null>(() => active[0]?.id ?? null)

  useEffect(() => {
    if (!active.length) {
      setExpanded(null)
      return
    }
    setExpanded((cur) =>
      cur && active.some((a) => a.id === cur) ? cur : active[0].id,
    )
  }, [active])

  if (!active.length) return null

  return (
    <section className="panel alerts-panel">
      <div className="panel-header">
        <h2>⚠️ Active Alerts</h2>
        <div className="alerts-header-actions">
          <span className="alert-count">{active.length}</span>
          {onHideAll && (
            <button
              type="button"
              className="chip-btn"
              onClick={onHideAll}
              title="Hide all alerts"
            >
              Hide all
            </button>
          )}
        </div>
      </div>
      <ul className="alerts-list">
        {active.map((a) => {
          const isOpen = expanded === a.id
          const color = severityColor(a.severity)
          const tips = alertActionTips(a.event)
          return (
            <li key={a.id} className="alert-item" style={{ borderLeftColor: color }}>
              <div className="alert-item-row">
                <button
                  type="button"
                  className="alert-toggle"
                  onClick={() => setExpanded(isOpen ? null : a.id)}
                  aria-expanded={isOpen}
                >
                  <span className="alert-event" style={{ color }}>
                    {a.event}
                  </span>
                  <span className="alert-headline">{a.headline}</span>
                  <span className="alert-chevron">{isOpen ? '▾' : '▸'}</span>
                </button>
                {onHideAlert && (
                  <button
                    type="button"
                    className="alert-hide-one"
                    onClick={() => onHideAlert(a.id)}
                    title="Hide this alert"
                    aria-label={`Hide ${a.event}`}
                  >
                    ✕
                  </button>
                )}
              </div>
              {isOpen && (
                <div className="alert-body">
                  <p className="alert-meta">
                    <strong>{a.severity}</strong> · {a.urgency} · {a.certainty}
                    {a.areas && <> · {a.areas}</>}
                  </p>

                  <div className="alert-checklist">
                    <strong>What to do</strong>
                    <ul>
                      {tips.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </div>

                  {a.instruction && (
                    <div className="alert-instruction">
                      <strong>Official guidance</strong>
                      <pre>{a.instruction.trim()}</pre>
                    </div>
                  )}
                  {a.description && (
                    <details className="alert-details">
                      <summary>Full alert text</summary>
                      <pre className="alert-desc">{a.description.trim()}</pre>
                    </details>
                  )}
                  <p className="alert-sender">{a.sender}</p>
                  {onHideAlert && (
                    <button
                      type="button"
                      className="chip-btn alert-hide-btn"
                      onClick={() => onHideAlert(a.id)}
                    >
                      Hide this alert
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
