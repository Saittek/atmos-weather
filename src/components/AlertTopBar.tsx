import { useEffect, useMemo, useState } from 'react'
import type { WeatherAlert } from '../api/types'
import { alertActionTips } from '../utils/alertTips'
import { filterActiveAlerts } from '../utils/activeAlerts'

const MINI_KEY = 'atmos-alerts-minimized'

interface Props {
  alerts: WeatherAlert[]
  placeName?: string
  onJumpDetails?: () => void
  /** Fired when minimize state changes (so parent can hide the big panel) */
  onMinimizedChange?: (minimized: boolean) => void
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

function loadMinimized(): boolean {
  try {
    return localStorage.getItem(MINI_KEY) === '1'
  } catch {
    return false
  }
}

function saveMinimized(v: boolean) {
  try {
    if (v) localStorage.setItem(MINI_KEY, '1')
    else localStorage.removeItem(MINI_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Sticky alerts: compact strip, or a red pill when hidden so you can reopen anytime.
 */
export function AlertTopBar({
  alerts,
  placeName,
  onJumpDetails,
  onMinimizedChange,
}: Props) {
  const [minimized, setMinimized] = useState(loadMinimized)
  const [expanded, setExpanded] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const active = useMemo(() => filterActiveAlerts(alerts), [alerts])

  useEffect(() => {
    onMinimizedChange?.(minimized)
  }, [minimized, onMinimizedChange])

  // If all alerts clear, reset minimize so a new alert shows open
  useEffect(() => {
    if (!active.length && minimized) {
      setMinimized(false)
      saveMinimized(false)
    }
  }, [active.length, minimized])

  if (!active.length) return null

  const sorted = [...active].sort((a, b) => {
    const rank = (s: string) =>
      s === 'Extreme' ? 0 : s === 'Severe' ? 1 : s === 'Moderate' ? 2 : 3
    return rank(a.severity) - rank(b.severity)
  })

  const top = sorted[0]
  const topColor = severityColor(top.severity)

  const minimize = () => {
    setMinimized(true)
    setExpanded(false)
    setOpenId(null)
    saveMinimized(true)
  }

  const openFromPill = () => {
    setMinimized(false)
    setExpanded(true)
    saveMinimized(false)
  }

  // —— Minimized: red button only ——
  if (minimized) {
    return (
      <div className="alert-top-bar alert-top-bar-mini" role="region" aria-label="Hidden weather alerts">
        <div className="alert-top-inner alert-top-inner-mini">
          <button
            type="button"
            className="alert-mini-btn"
            onClick={openFromPill}
            title="Show weather alerts"
            aria-expanded={false}
          >
            <span className="alert-mini-icon" aria-hidden>
              ⚠️
            </span>
            <span className="alert-mini-count">{active.length}</span>
            <span className="alert-mini-label">
              alert{active.length > 1 ? 's' : ''}
            </span>
            <span className="alert-mini-peek">{top.event}</span>
            <span className="alert-mini-open" aria-hidden>
              Open
            </span>
          </button>
        </div>
      </div>
    )
  }

  // —— Full compact strip ——
  return (
    <div className="alert-top-bar" role="region" aria-label="Weather alerts for this location">
      <div className="alert-top-inner">
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
            <button
              type="button"
              className="chip-btn alert-top-hide"
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                minimize()
              }}
              title="Collapse alerts to a red button"
            >
              Hide
            </button>
          </div>
        </div>

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
                  </div>
                  {isOpen && (
                    <div className="alert-top-body">
                      <ul className="alert-top-tips">
                        {tips.slice(0, 3).map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                      {a.areas && <p className="alert-top-areas">{a.areas}</p>}
                      <button
                        type="button"
                        className="chip-btn alert-top-hide-inline"
                        onClick={minimize}
                      >
                        Hide alerts bar
                      </button>
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
