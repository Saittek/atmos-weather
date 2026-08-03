import { useEffect, useMemo, useRef, useState } from 'react'
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
  /**
   * When true, the full strip is hidden — parent shows a circle in the top bar.
   * If omitted, component manages its own minimized state (uncontrolled).
   */
  minimized?: boolean
  onRequestExpand?: () => void
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

export function isAlertsMinimizedStored(): boolean {
  return loadMinimized()
}

export function setAlertsMinimizedStored(v: boolean) {
  saveMinimized(v)
}

/** Circular control for the main top bar when alerts are hidden */
export function AlertTopBarCircle({
  count,
  severity,
  onClick,
}: {
  count: number
  severity?: string
  onClick: () => void
}) {
  const color = severity ? severityColor(severity) : '#b91c1c'
  return (
    <button
      type="button"
      className="alert-topbar-circle"
      onClick={onClick}
      title={count > 1 ? `Show ${count} weather alerts` : 'Show weather alert'}
      aria-label={count > 1 ? `Show ${count} weather alerts` : 'Show weather alert'}
      aria-expanded={false}
      style={{ ['--alert-circle-bg' as string]: color }}
    >
      <span className="alert-topbar-circle-icon" aria-hidden>
        ⚠️
      </span>
      {count > 1 && <span className="alert-topbar-circle-badge">{count > 9 ? '9+' : count}</span>}
    </button>
  )
}

/**
 * Sticky alerts strip. When minimized, renders nothing — parent shows AlertTopBarCircle in the top bar.
 */
export function AlertTopBar({
  alerts,
  placeName,
  onJumpDetails,
  onMinimizedChange,
  minimized: minimizedProp,
}: Props) {
  const [internalMini, setInternalMini] = useState(loadMinimized)
  const controlled = typeof minimizedProp === 'boolean'
  const minimized = controlled ? minimizedProp : internalMini
  const [expanded, setExpanded] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const active = useMemo(() => filterActiveAlerts(alerts), [alerts])

  const setMinimized = (v: boolean) => {
    if (!controlled) setInternalMini(v)
    saveMinimized(v)
    onMinimizedChange?.(v)
  }

  useEffect(() => {
    onMinimizedChange?.(minimized)
  }, [minimized, onMinimizedChange])

  // If all alerts clear, reset minimize so a new alert shows open
  useEffect(() => {
    if (!active.length && minimized) {
      if (!controlled) setInternalMini(false)
      saveMinimized(false)
      onMinimizedChange?.(false)
    }
  }, [active.length, minimized, controlled, onMinimizedChange])

  // Keep fixed topbar below the real alert strip height (wrap / expand / safe-area)
  useEffect(() => {
    const setH = (px: number) => {
      const app = document.querySelector('.app')
      if (app instanceof HTMLElement) {
        app.style.setProperty('--alert-bar-h', `${Math.max(0, Math.ceil(px))}px`)
      }
    }
    if (!active.length || minimized) {
      setH(0)
      return
    }
    const el = barRef.current
    if (!el) return
    const apply = () => setH(el.getBoundingClientRect().height)
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    window.addEventListener('resize', apply)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', apply)
    }
  }, [active.length, minimized, expanded, openId, alerts])

  if (!active.length) return null

  // Minimized: full strip off — circle lives in the main top bar
  if (minimized) return null

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
  }

  return (
    <div
      ref={barRef}
      className="alert-top-bar"
      role="region"
      aria-label="Weather alerts for this location"
    >
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
              title="Hide alerts — keep a circle in the top bar"
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
