/**
 * Visual onset → now → end timeline for active alerts.
 */
import { useMemo } from 'react'
import type { WeatherAlert } from '../api/types'
import { filterActiveAlerts } from '../utils/activeAlerts'

interface Props {
  alerts: WeatherAlert[]
  onOpenDetails?: () => void
}

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

function fmt(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function AlertTimeline({ alerts, onOpenDetails }: Props) {
  const items = useMemo(() => {
    const active = filterActiveAlerts(alerts)
    return active
      .map((a) => {
        const onset = parseMs(a.onset)
        const ends = parseMs(a.ends)
        const now = Date.now()
        let phase: 'upcoming' | 'active' | 'ending' = 'active'
        if (onset != null && now < onset) phase = 'upcoming'
        else if (ends != null && ends - now < 3 * 3600_000) phase = 'ending'
        return { a, onset, ends, phase, now }
      })
      .sort((x, y) => {
        const rank = (s: string) =>
          s === 'Extreme' ? 0 : s === 'Severe' ? 1 : s === 'Moderate' ? 2 : 3
        return rank(x.a.severity) - rank(y.a.severity)
      })
      .slice(0, 4)
  }, [alerts])

  if (!items.length) return null

  return (
    <section className="panel alert-timeline" aria-label="Alert timeline">
      <div className="panel-header">
        <h2>Alert timeline</h2>
        <span className="panel-hint">{items.length} active</span>
      </div>
      <ul className="alert-timeline-list">
        {items.map(({ a, onset, ends, phase, now }) => {
          const start = onset ?? now - 3600_000
          const end = ends ?? now + 6 * 3600_000
          const span = Math.max(1, end - start)
          const pct = Math.min(100, Math.max(0, ((now - start) / span) * 100))
          return (
            <li key={a.id} className={`alert-tl-item sev-${a.severity.toLowerCase()}`}>
              <div className="alert-tl-top">
                <strong>{a.event}</strong>
                <span className={`alert-tl-phase phase-${phase}`}>
                  {phase === 'upcoming' ? 'Upcoming' : phase === 'ending' ? 'Winding down' : 'In effect'}
                </span>
              </div>
              <div className="alert-tl-track" aria-hidden>
                <div className="alert-tl-fill" style={{ width: `${pct}%` }} />
                <div className="alert-tl-now" style={{ left: `${pct}%` }} />
              </div>
              <div className="alert-tl-times">
                <span>{onset ? `Start ${fmt(onset)}` : 'Started'}</span>
                <span>{ends ? `Until ${fmt(ends)}` : 'No end time'}</span>
              </div>
            </li>
          )
        })}
      </ul>
      {onOpenDetails && (
        <button type="button" className="chip-btn alert-tl-more" onClick={onOpenDetails}>
          Full alert text
        </button>
      )}
    </section>
  )
}
