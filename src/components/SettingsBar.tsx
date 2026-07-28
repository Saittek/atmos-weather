import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  hasHome?: boolean
  isHome?: boolean
  onUnits: (u: Units) => void
  onTheme: (t: ThemeMode) => void
  onDensity: (d: DensityMode) => void
  onSevereMode: (v: boolean) => void
  onStormMode: (v: boolean) => void
  onNotify: (v: boolean) => void
  onToggleFavorite: () => void
  onGoHome?: () => void
  onSetHome?: () => void
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
  hasHome,
  isHome,
  onUnits,
  onTheme,
  onDensity,
  onSevereMode,
  onStormMode,
  onNotify,
  onToggleFavorite,
  onGoHome,
  onSetHome,
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    const onDoc = (e: MouseEvent) => {
      // Desktop dropdown only — sheet uses its own backdrop
      if (window.matchMedia('(max-width: 720px)').matches) return
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDoc)
    const prev = document.body.style.overflow
    if (window.matchMedia('(max-width: 720px)').matches) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDoc)
      document.body.style.overflow = prev
    }
  }, [moreOpen])

  const settingsPanel = (
    <>
      <div className="settings-more-section">
        <span className="settings-more-label">Units</span>
        <UnitToggle units={units} onChange={onUnits} />
      </div>

      <div className="settings-more-section">
        <span className="settings-more-label">Theme</span>
        <div className="unit-toggle theme-toggle settings-theme-all" role="group" aria-label="Theme">
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
            checked={stormMode}
            onChange={(e) => onStormMode(e.target.checked)}
          />
          <span>
            <strong>Storm mode</strong>
            <em>Radar-first layout</em>
          </span>
        </label>
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

      <div className="settings-more-section">
        <span className="settings-more-label">Home</span>
        <div className="settings-home-actions">
          {hasHome && onGoHome && (
            <button
              type="button"
              className="chip-btn settings-more-action"
              role="menuitem"
              onClick={() => {
                onGoHome()
                setMoreOpen(false)
              }}
            >
              🏠 Go to home
            </button>
          )}
          {onSetHome && (
            <button
              type="button"
              className="chip-btn settings-more-action"
              role="menuitem"
              onClick={() => {
                onSetHome()
                setMoreOpen(false)
              }}
            >
              {isHome ? '🏡 Clear home for this place' : '🏠 Set this place as home'}
            </button>
          )}
          {!hasHome && !onSetHome && (
            <p className="settings-home-hint">Set home from the 🏠 Home panel or place card.</p>
          )}
        </div>
      </div>

      <button
        type="button"
        className="chip-btn settings-more-action"
        role="menuitem"
        onClick={() => {
          onToggleFavorite()
        }}
      >
        {isFavorite ? '★ Remove this place from favorites' : '☆ Save this place to favorites'}
      </button>

      <button
        type="button"
        className="chip-btn settings-more-action"
        role="menuitem"
        onClick={() => {
          onCloudSync()
        }}
      >
        {cloudSynced ? '☁ Sync account (up to date)' : '☁ Sync account now'}
      </button>

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
    </>
  )

  return (
    <div className="settings-bar">
      <AccountMenu onCloudSync={onCloudSync} synced={cloudSynced} />

      {/* Always show star so favorites stay one tap away on mobile */}
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
        className={`chip-btn icon-chip storm-chip topbar-desktop-only ${stormMode ? 'active storm-on' : ''}`}
        onClick={() => onStormMode(!stormMode)}
        title="Storm mode: radar-first layout"
        aria-label="Storm mode"
        aria-pressed={stormMode}
      >
        🌩
      </button>

      <div className="topbar-desktop-only unit-toggle-desktop">
        <UnitToggle units={units} onChange={onUnits} />
      </div>

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
          className={`chip-btn icon-chip settings-open-btn ${moreOpen ? 'active' : ''}`}
          onClick={() => setMoreOpen((o) => !o)}
          title="Settings"
          aria-label="Open settings"
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
        >
          ⚙
        </button>

        {/* Desktop dropdown */}
        {moreOpen && (
          <div className="settings-more-menu settings-more-desktop" role="menu">
            {settingsPanel}
          </div>
        )}

        {/* Mobile full-screen sheet (portaled so it is never clipped) */}
        {moreOpen &&
          createPortal(
            <div className="settings-sheet-root" role="dialog" aria-modal="true" aria-label="Settings">
              <button
                type="button"
                className="settings-sheet-backdrop"
                aria-label="Close settings"
                onClick={() => setMoreOpen(false)}
              />
              <div className="settings-sheet">
                <div className="settings-sheet-head">
                  <strong>Settings</strong>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => setMoreOpen(false)}
                  >
                    Done
                  </button>
                </div>
                <div className="settings-sheet-body">{settingsPanel}</div>
              </div>
            </div>,
            document.body,
          )}
      </div>
    </div>
  )
}
