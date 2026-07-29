/**
 * Single “what matters now” strip — severity, timing, one clear action.
 * Full NWS text stays in the Alerts panel below.
 */
import { useMemo } from 'react'
import type { WeatherAlert } from '../api/types'
import { alertActionTips } from '../utils/alertTips'
import { filterActiveAlerts } from '../utils/activeAlerts'

interface Props {
  alerts: WeatherAlert[]
  onOpenAlerts?: () => void
}

function rank(sev: string): number {
  switch (sev.toLowerCase()) {
    case 'extreme':
      return 0
    case 'severe':
      return 1
    case 'moderate':
      return 2
    case 'minor':
      return 3
    default:
      return 4
  }
}

function formatWhen(onset: string | null, ends: string | null): string {
  const fmt = (iso: string) => {
    try {
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return null
      return d.toLocaleString(undefined, {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    } catch {
      return null
    }
  }
  const a = onset ? fmt(onset) : null
  const b = ends ? fmt(ends) : null
  if (a && b) return `Until ${b}`
  if (b) return `Until ${b}`
  if (a) return `From ${a}`
  return 'In effect now'
}

function sevClass(sev: string): string {
  const s = sev.toLowerCase()
  if (s === 'extreme') return 'wmn-extreme'
  if (s === 'severe') return 'wmn-severe'
  if (s === 'moderate') return 'wmn-moderate'
  if (s === 'minor') return 'wmn-minor'
  return 'wmn-unknown'
}

export function WhatMattersNow({ alerts, onOpenAlerts }: Props) {
  const top = useMemo(() => {
    const active = filterActiveAlerts(alerts)
    if (!active.length) return null
    return [...active].sort((a, b) => rank(a.severity) - rank(b.severity))[0]
  }, [alerts])

  if (!top) return null

  const tips = alertActionTips(top.event)
  const action = tips[0] || top.instruction?.split(/[.\n]/)[0]?.trim() || 'Stay weather-aware and follow local officials.'
  const when = formatWhen(top.onset, top.ends)

  return (
    <section
      className={`what-matters-now ${sevClass(top.severity)}`}
      aria-label="What matters now"
    >
      <div className="wmn-top">
        <span className="wmn-badge" aria-hidden>
          {top.severity === 'Extreme' || top.severity === 'Severe' ? '⚠' : 'ℹ'}
        </span>
        <div className="wmn-head">
          <p className="wmn-kicker">What matters now</p>
          <h2 className="wmn-event">{top.event}</h2>
        </div>
        <span className="wmn-sev">{top.severity}</span>
      </div>
      <p className="wmn-when">
        <time dateTime={top.ends || top.onset || undefined}>{when}</time>
        {top.areas ? <span className="wmn-areas"> · {top.areas}</span> : null}
      </p>
      <p className="wmn-action">
        <strong>Do this:</strong> {action}
      </p>
      {onOpenAlerts && (
        <button type="button" className="wmn-more" onClick={onOpenAlerts}>
          Full alert details
        </button>
      )}
    </section>
  )
}
