import { useMemo, useState } from 'react'
import type { WeatherAlert } from '../api/types'
import { alertActionTips } from '../utils/alertTips'
import { filterActiveAlerts } from '../utils/activeAlerts'

interface Props {
  alerts: WeatherAlert[]
  placeName?: string
  onJumpDetails?: () => void
  onHideAlert?: (id: string) => void
  onHideAll?: () => void
}

function severityColor(sev: string): string {
  switch (sev.toLowerCase()) {
    case 'extreme':
      return '#b91c1c'
    case 'severe':
      return '#c2410c'
    case 'moderate':
      return '#a16207'
    case 'minor':
      return '#1d4ed8'
    default:
      return '#475569'
  }
}

/**
 * Compact sticky alert strip — collapsed by default so it never eats the screen.
 * Prominent Hide control always visible.
 */
export function AlertTopBar({
  alerts,
  placeName,
  onJumpDetails,
  onHideAlert,
  onHideAll,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const active = useMemo(() => filterActiveAlerts(alerts), [alerts])

  if (!active.length) return null

  const sorted = [...active].sort((a, b) => {
    const rank = (s: string) =>
      s === 'Extreme' ? 0 : s === 'Severe' ? 1 : s === 'Moderate' ? 2 : 3
    return rank(a.severity) - rank(b.severity)
  })

  const top = sorted[0]
  const topColor = severityColor(top.severity)

  return (
    <div className="alert-top-bar" role="region" aria-label="Weather alerts for this location">
      <div className="alert-top-inner">
        {/* Always-visible compact strip */}
        <div className="alert-top-compact">
          <span className="alert-top-pulse" aria-hidden />
          <button
            type="button"
            className="alert-top-summary"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
          >
            <span className="alert-top-sev compact-sev" style={{ background: topColor }}>
              {top.severity}
            </span>
            <span className="alert-top-summary-text">
              <strong>
                {active.length} alert{active.length > 1 ? 's' : ''}
                {placeName ? ` · ${placeName}` : ''}
              </strong>
              <em>
                {top.event}
                {active.length > 1 ? ` · +${active.length - 1} more` : ''}
              </em>
            </span>
            <span className="alert-top-chev" aria-hidden>
              {expanded ? '▴' : '▾'}
            </span>
          </button>
          <div className="alert-top-actions">
            {onJumpDetails && (
              <button
                type="button"
                className="chip-btn alert-top-more"
                onClick={(e) => {
                  e.stopPropagation()
                  onJumpDetails()
                }}
              >
                Details
              </button>
            )}
            {onHideAll && (
              <button
                type="button"
                className="chip-btn alert-top-hide"
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  onHideAll()
                }}
                title="Hide alerts bar"
              >
                Hide
              </button>
            )}
          </div>
        </div>

        {/* Expanded list — capped height, scrollable */}
        {expanded && (
          <ul className="alert-top-list">
            {sorted.map((a) => {
              const color = severityColor(a.severity)
              const isOpen = openId === a.id
              const tips = alertActionTips(a.event)
              return (
                <li key={a.id} className="alert-top-item" style={{ borderLeftColor: color }}>
                  <div className="alert-top-row">
                    <button
                      type="button"
                      className="alert-top-toggle"
                      onClick={() => setOpenId(isOpen ? null : a.id)}
                      aria-expanded={isOpen}
                    >
                      <span className="alert-top-sev" style={{ background: color }}>
                        {a.severity}
                      </span>
                      <span className="alert-top-event">{a.event}</span>
                      <span className="alert-top-headline">{a.headline}</span>
                      <span className="alert-top-chev">{isOpen ? '▾' : '▸'}</span>
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
                    <div className="alert-top-body">
                      <ul className="alert-top-tips">
                        {tips.slice(0, 3).map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                      {a.areas && <p className="alert-top-areas">{a.areas}</p>}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
