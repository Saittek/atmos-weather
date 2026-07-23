import { useState } from 'react'
import type { NearbyThreat } from '../api/severeLayers'

interface Props {
  threats: NearbyThreat[]
  loading?: boolean
  muted?: boolean
  onMute?: (m: boolean) => void
  onJump?: (t: NearbyThreat) => void
  onRefresh?: () => void
}

function distLabel(t: NearbyThreat): string {
  if (t.inside) return 'IN'
  if (t.distanceKm < 1) return '<1km'
  return `${Math.round(t.distanceKm)} km`
}

function severityClass(t: NearbyThreat): string {
  if (t.warning.phenomena === 'TO' || t.warning.isEmergency) return 'threat-tor'
  if (t.warning.phenomena === 'SV') return 'threat-svr'
  if (t.warning.phenomena === 'FF') return 'threat-ff'
  return 'threat-other'
}

export function ThreatBanner({
  threats,
  loading,
  muted,
  onMute,
  onJump,
  onRefresh,
}: Props) {
  const [open, setOpen] = useState(false)

  if (!threats.length && !loading) return null

  const top = threats.slice(0, 3)
  const primary = top[0]
  const title = primary?.inside
    ? 'Threat covers you'
    : top.length
      ? `Nearby threat · ${distLabel(primary)}`
      : 'Checking threats…'
  const sub = primary
    ? `${primary.warning.label}${top.length > 1 ? ` +${top.length - 1}` : ''}`
    : ''

  return (
    <div
      className={`threat-bar ${primary ? severityClass(primary) : ''} ${open ? 'is-open' : ''}`}
      role="status"
    >
      <button
        type="button"
        className="threat-bar-main"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={open ? 'Hide threat details' : 'Show threat details'}
      >
        <span className="threat-bar-icon" aria-hidden>
          ⚠
        </span>
        <span className="threat-bar-text">
          <strong>{title}</strong>
          {sub && <span className="threat-bar-sub">{sub}</span>}
        </span>
        {primary && (
          <span className="threat-bar-pill">{distLabel(primary)}</span>
        )}
        <span className="threat-bar-chev" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>

      <div className="threat-bar-side">
        {primary && onJump && primary.centroid && (
          <button
            type="button"
            className="threat-bar-btn"
            onClick={(e) => {
              e.stopPropagation()
              onJump(primary)
            }}
            title="Jump to polygon on map"
          >
            Map
          </button>
        )}
        {onMute && (
          <button
            type="button"
            className="threat-bar-btn"
            onClick={(e) => {
              e.stopPropagation()
              onMute(!muted)
            }}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? '🔇' : '🔔'}
          </button>
        )}
        {onRefresh && (
          <button
            type="button"
            className="threat-bar-btn"
            onClick={(e) => {
              e.stopPropagation()
              onRefresh()
            }}
            disabled={loading}
            title="Refresh"
          >
            ↻
          </button>
        )}
      </div>

      {open && top.length > 0 && (
        <ul className="threat-bar-list">
          {top.map((t) => (
            <li key={t.warning.id}>
              <button
                type="button"
                className="threat-bar-row"
                onClick={() => {
                  if (onJump && t.centroid) onJump(t)
                }}
              >
                <span className="threat-dist">{distLabel(t)}</span>
                <span className="threat-meta">
                  <strong>{t.warning.label}</strong>
                  <span>
                    {t.warning.significance === 'A' ? 'Watch' : 'Warning'}
                    {t.warning.wfo ? ` · ${t.warning.wfo}` : ''}
                    {t.warning.tornadoTag ? ` · ${t.warning.tornadoTag}` : ''}
                  </span>
                </span>
                {onJump && t.centroid && (
                  <span className="threat-bar-row-go">Map</span>
                )}
              </button>
            </li>
          ))}
          <li className="threat-bar-note">
            Official polygons — not a substitute for sirens.
          </li>
        </ul>
      )}
    </div>
  )
}
