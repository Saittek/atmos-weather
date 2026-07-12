import { useEffect, useState } from 'react'
import type { WeatherAlert } from '../api/types'
import { alertActionTips } from '../utils/alertTips'

interface Props {
  alerts: WeatherAlert[]
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

export function Alerts({ alerts }: Props) {
  const [expanded, setExpanded] = useState<string | null>(() => alerts[0]?.id ?? null)

  useEffect(() => {
    if (!alerts.length) {
      setExpanded(null)
      return
    }
    // Keep expansion if still valid; otherwise open first
    setExpanded((cur) =>
      cur && alerts.some((a) => a.id === cur) ? cur : alerts[0].id,
    )
  }, [alerts])

  if (!alerts.length) return null

  return (
    <section className="panel alerts-panel">
      <div className="panel-header">
        <h2>⚠️ Active Alerts</h2>
        <span className="alert-count">{alerts.length}</span>
      </div>
      <ul className="alerts-list">
        {alerts.map((a) => {
          const isOpen = expanded === a.id
          const color = severityColor(a.severity)
          const tips = alertActionTips(a.event)
          return (
            <li key={a.id} className="alert-item" style={{ borderLeftColor: color }}>
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
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
