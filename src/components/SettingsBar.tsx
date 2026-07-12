import { useEffect, useRef, useState } from 'react'
import type { DensityMode, ThemeMode } from '../api/types'
import type { Units } from '../utils/format'
import { UnitToggle } from './UnitToggle'
import { AccountMenu } from './AccountMenu'

interface Props {
  units: Units
  theme: ThemeMode
  density: DensityMode
  severeMode: boolean
  stormMode: boolean
  notifyAlerts: boolean
  isFavorite: boolean
  cloudSynced: boolean
  onUnits: (u: Units) => void
  onTheme: (t: ThemeMode) => void
  onDensity: (d: DensityMode) => void
  onSevereMode: (v: boolean) => void
  onStormMode: (v: boolean) => void
  onNotify: (v: boolean) => void
  onToggleFavorite: () => void
  onShare: () => void
  onRefresh: () => void
  onCloudSync: () => void
  loading: boolean
  refreshing?: boolean
}

export function SettingsBar({
  units,
  theme,
  density,
  severeMode,
  stormMode,
  notifyAlerts,
  isFavorite,
  cloudSynced,
  onUnits,
  onTheme,
  onDensity,
  onSevereMode,
  onStormMode,
  onNotify,
  onToggleFavorite,
  onShare,
  onRefresh,
  onCloudSync,
  loading,
  refreshing,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!moreOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [moreOpen])

  return (
    <div className="settings-bar">
      <AccountMenu onCloudSync={onCloudSync} synced={cloudSynced} />

      <button
        type="button"
        className={`chip-btn icon-chip storm-chip ${stormMode ? 'active storm-on' : ''}`}
        onClick={() => onStormMode(!stormMode)}
        title="Storm mode: radar-first layout"
        aria-label="Storm mode"
        aria-pressed={stormMode}
      >
        🌩
      </button>

      <UnitToggle units={units} onChange={onUnits} />

      <button
        type="button"
        className={`chip-btn icon-chip ${isFavorite ? 'active' : ''}`}
        onClick={onToggleFavorite}
        title={isFavorite ? 'Remove favorite' : 'Save favorite'}
        aria-label={isFavorite ? 'Remove favorite' : 'Save favorite'}
      >
        {isFavorite ? '★' : '☆'}
      </button>

      <button
        type="button"
        className={`chip-btn icon-chip refresh-btn ${refreshing || loading ? 'spinning' : ''}`}
        onClick={onRefresh}
        disabled={loading || refreshing}
        title="Refresh weather"
        aria-label="Refresh weather"
      >
        ↻
      </button>

      <div className="settings-more-wrap" ref={moreRef}>
        <button
          type="button"
          className={`chip-btn icon-chip ${moreOpen ? 'active' : ''}`}
          onClick={() => setMoreOpen((o) => !o)}
          title="More settings"
          aria-label="More settings"
          aria-expanded={moreOpen}
          aria-haspopup="menu"
        >
          ⋯
        </button>
        {moreOpen && (
          <div className="settings-more-menu" role="menu">
            <div className="settings-more-section">
              <span className="settings-more-label">Theme</span>
              <div className="unit-toggle theme-toggle" role="group" aria-label="Theme">
                {(['dark', 'light', 'auto'] as ThemeMode[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={theme === t ? 'active' : ''}
                    onClick={() => onTheme(t)}
                    aria-pressed={theme === t}
                  >
                    {t === 'dark' ? '☾ Dark' : t === 'light' ? '☀ Light' : 'A Auto'}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-more-section">
              <span className="settings-more-label">Density</span>
              <div className="unit-toggle density-toggle" role="group" aria-label="Density">
                <button
                  type="button"
                  className={density === 'comfortable' ? 'active' : ''}
                  onClick={() => onDensity('comfortable')}
                  aria-pressed={density === 'comfortable'}
                >
                  Comfortable
                </button>
                <button
                  type="button"
                  className={density === 'compact' ? 'active' : ''}
                  onClick={() => onDensity('compact')}
                  aria-pressed={density === 'compact'}
                >
                  Compact
                </button>
              </div>
            </div>

            <div className="settings-more-toggles">
              <label className="settings-more-row">
                <input
                  type="checkbox"
                  checked={severeMode}
                  onChange={(e) => onSevereMode(e.target.checked)}
                />
                <span>
                  <strong>Alerts UI</strong>
                  <em>Highlight severe weather</em>
                </span>
              </label>
              <label className="settings-more-row">
                <input
                  type="checkbox"
                  checked={notifyAlerts}
                  onChange={(e) => void onNotify(e.target.checked)}
                />
                <span>
                  <strong>Notify</strong>
                  <em>Rain watch &amp; alerts</em>
                </span>
              </label>
            </div>

            <button
              type="button"
              className="chip-btn settings-more-action"
              role="menuitem"
              onClick={() => {
                onShare()
                setMoreOpen(false)
              }}
            >
              ↗ Copy share link
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
