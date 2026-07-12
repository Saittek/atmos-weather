import { useState } from 'react'
import type { WeatherAlert } from '../api/types'
import { alertActionTips } from '../utils/alertTips'

interface Props {
  alerts: WeatherAlert[]
  placeName?: string
  onJumpDetails?: () => void
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
 * Sticky top-of-page alert strip for the active location — always first.
 */
export function AlertTopBar({ alerts, placeName, onJumpDetails }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)

  if (!alerts.length) return null

  const sorted = [...alerts].sort((a, b) => {
    const rank = (s: string) =>
      s === 'Extreme' ? 0 : s === 'Severe' ? 1 : s === 'Moderate' ? 2 : 3
    return rank(a.severity) - rank(b.severity)
  })

  return (
    <div className="alert-top-bar" role="region" aria-label="Weather alerts for this location">
      <div className="alert-top-inner">
        <div className="alert-top-head">
          <span className="alert-top-pulse" aria-hidden />
          <div className="alert-top-title">
            <strong>
              {alerts.length} active alert{alerts.length > 1 ? 's' : ''}
              {placeName ? ` · ${placeName}` : ''}
            </strong>
            <span>
              {alerts.some((a) => /environment and climate change canada|canada/i.test(a.sender)) &&
              alerts.some((a) => /national weather service/i.test(a.sender))
                ? 'Environment Canada & NWS'
                : alerts.some((a) =>
                      /environment and climate change canada|canada/i.test(a.sender),
                    )
                  ? 'Environment and Climate Change Canada'
                  : 'National Weather Service'}{' '}
              · your location
            </span>
          </div>
          {onJumpDetails && (
            <button type="button" className="chip-btn alert-top-more" onClick={onJumpDetails}>
              Details ↓
            </button>
          )}
        </div>
        <ul className="alert-top-list">
          {sorted.map((a) => {
            const color = severityColor(a.severity)
            const isOpen = openId === a.id
            const tips = alertActionTips(a.event)
            return (
              <li key={a.id} className="alert-top-item" style={{ borderLeftColor: color }}>
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
      </div>
    </div>
  )
}
