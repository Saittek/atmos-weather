import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import type { DensityMode, ThemeMode } from '../api/types'
import type { Units } from '../utils/format'
import { UnitToggle } from './UnitToggle'
import { AccountMenu } from './AccountMenu'
import { ModulePrefsPanel } from './ModulePrefsPanel'
import { getEntitlements, setPlanLocal, type PlanId } from '../lib/entitlements'
import { isAnalyticsOptedOut, setAnalyticsOptOut } from '../lib/analytics'
import {
  loadModulePrefs,
  saveModulePrefs,
  type ModulePrefs,
} from '../lib/modulePrefs'
import { useI18n } from '../i18n/I18nProvider'
import { LOCALE_LABELS, type LocaleId } from '../i18n/messages'

/** Deep links for full-page modes (mobile top bar hides quick-nav). */
export interface ExplorePaths {
  stargaze: string
  radar: string
  earth: string
  chase: string
}

interface Props {
  units: Units
  theme: ThemeMode
  density: DensityMode
  severeMode: boolean
  stormMode: boolean
  notifyAlerts: boolean
  quietHoursEnabled?: boolean
  quietStart?: string
  quietEnd?: string
  isFavorite: boolean
  cloudSynced: boolean
  hasHome?: boolean
  isHome?: boolean
  hasWork?: boolean
  isWork?: boolean
  onUnits: (u: Units) => void
  onTheme: (t: ThemeMode) => void
  onDensity: (d: DensityMode) => void
  onSevereMode: (v: boolean) => void
  onStormMode: (v: boolean) => void
  onNotify: (v: boolean) => void
  onQuietHours?: (patch: {
    quietHoursEnabled?: boolean
    quietStart?: string
    quietEnd?: string
  }) => void
  onToggleFavorite: () => void
  onGoHome?: () => void
  onSetHome?: () => void
  onGoWork?: () => void
  onSetWork?: () => void
  onShare: () => void
  onRefresh: () => void
  onCloudSync: () => void
  onTestNotify?: () => void | Promise<void>
  pushStatusLabel?: string | null
  loading: boolean
  refreshing?: boolean
  /** Full-page rain/snow/lightning wash behind UI */
  atmosphereEnabled?: boolean
  onAtmosphereEnabled?: (v: boolean) => void
  /** Stargaze / radar / Earth / chase — shown in More on all viewports */
  explorePaths?: ExplorePaths
}

export function SettingsBar({
  units,
  theme,
  density,
  severeMode,
  stormMode,
  notifyAlerts,
  quietHoursEnabled = false,
  quietStart = '22:00',
  quietEnd = '07:00',
  isFavorite,
  cloudSynced,
  hasHome,
  isHome,
  hasWork,
  isWork,
  onUnits,
  onTheme,
  onDensity,
  onSevereMode,
  onStormMode,
  onQuietHours,
  onNotify,
  onToggleFavorite,
  onGoHome,
  onSetHome,
  onGoWork,
  onSetWork,
  onShare,
  onRefresh,
  onCloudSync,
  onTestNotify,
  pushStatusLabel,
  loading,
  refreshing,
  atmosphereEnabled = true,
  onAtmosphereEnabled,
  explorePaths,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const [analyticsOff, setAnalyticsOff] = useState(() => isAnalyticsOptedOut())
  const [plan, setPlan] = useState(() => getEntitlements())
  const [modPrefs, setModPrefs] = useState<ModulePrefs>(() => loadModulePrefs())
  const { locale, setLocale, t } = useI18n()

  useEffect(() => {
    const sync = () => setPlan(getEntitlements())
    window.addEventListener('solara-plan-change', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('solara-plan-change', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  useEffect(() => {
    const sync = (e: Event) => {
      const detail = (e as CustomEvent<ModulePrefs>).detail
      setModPrefs(detail ?? loadModulePrefs())
    }
    window.addEventListener('solara-module-prefs-change', sync)
    return () => window.removeEventListener('solara-module-prefs-change', sync)
  }, [])

  const onModulePrefs = (next: ModulePrefs) => {
    setModPrefs(next)
    saveModulePrefs(next)
  }

  const applyPlan = (p: PlanId) => {
    setPlanLocal(p)
    setPlan(getEntitlements(p))
  }

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
      <div className="settings-more-section settings-plan-card">
        <span className="settings-more-label">{t('settings.plan')}</span>
        <div className="settings-plan-row">
          <strong>{plan.plan === 'pro' ? t('settings.planPro') : t('settings.planFree')}</strong>
          <span className="settings-plan-badge">
            {plan.plan === 'pro' ? t('pro.badge') : t('pro.free')}
          </span>
        </div>
        <p className="settings-plan-hint">
          {plan.plan === 'pro' ? t('settings.planHintPro') : t('settings.planHintFree')}
        </p>
        <div className="settings-plan-actions">
          {plan.plan === 'free' ? (
            <button
              type="button"
              className="chip-btn settings-more-action"
              onClick={() => applyPlan('pro')}
            >
              {t('settings.previewPro')}
            </button>
          ) : (
            <button
              type="button"
              className="chip-btn settings-more-action"
              onClick={() => applyPlan('free')}
            >
              {t('settings.backFree')}
            </button>
          )}
        </div>
      </div>

      <div className="settings-more-section settings-modules-card">
        <ModulePrefsPanel prefs={modPrefs} onChange={onModulePrefs} />
      </div>

      {explorePaths && (
        <div className="settings-more-section">
          <span className="settings-more-label">{t('settings.explore')}</span>
          <div className="settings-explore-links">
            <Link
              to={explorePaths.stargaze}
              className="chip-btn settings-more-action"
              role="menuitem"
              onClick={() => setMoreOpen(false)}
            >
              {t('settings.stargaze')}
            </Link>
            <Link
              to={explorePaths.radar}
              className="chip-btn settings-more-action"
              role="menuitem"
              onClick={() => setMoreOpen(false)}
            >
              {t('settings.radar')}
            </Link>
            <Link
              to={explorePaths.earth}
              className="chip-btn settings-more-action"
              role="menuitem"
              onClick={() => setMoreOpen(false)}
            >
              {t('settings.earth')}
            </Link>
            <Link
              to={explorePaths.chase}
              className="chip-btn settings-more-action"
              role="menuitem"
              onClick={() => setMoreOpen(false)}
            >
              {t('settings.chase')}
            </Link>
          </div>
        </div>
      )}

      <div className="settings-more-section">
        <span className="settings-more-label">{t('settings.language')}</span>
        <div className="unit-toggle theme-toggle settings-theme-all" role="group" aria-label={t('settings.language')}>
          {(Object.keys(LOCALE_LABELS) as LocaleId[]).map((id) => (
            <button
              key={id}
              type="button"
              className={locale === id ? 'active' : ''}
              onClick={() => setLocale(id)}
              aria-pressed={locale === id}
            >
              {LOCALE_LABELS[id]}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-more-section">
        <span className="settings-more-label">{t('settings.units')}</span>
        <UnitToggle units={units} onChange={onUnits} />
      </div>

      <div className="settings-more-section">
        <span className="settings-more-label">{t('settings.theme')}</span>
        <div
          className="unit-toggle theme-toggle settings-theme-all"
          role="group"
          aria-label={t('settings.theme')}
        >
          {(['dark', 'light', 'auto'] as ThemeMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={theme === mode ? 'active' : ''}
              onClick={() => onTheme(mode)}
              aria-pressed={theme === mode}
            >
              {mode === 'dark'
                ? t('settings.themeDark')
                : mode === 'light'
                  ? t('settings.themeLight')
                  : t('settings.themeAuto')}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-more-section">
        <span className="settings-more-label">{t('settings.density')}</span>
        <div className="unit-toggle density-toggle" role="group" aria-label={t('settings.density')}>
          <button
            type="button"
            className={density === 'comfortable' ? 'active' : ''}
            onClick={() => onDensity('comfortable')}
            aria-pressed={density === 'comfortable'}
          >
            {t('settings.comfortable')}
          </button>
          <button
            type="button"
            className={density === 'compact' ? 'active' : ''}
            onClick={() => onDensity('compact')}
            aria-pressed={density === 'compact'}
          >
            {t('settings.compact')}
          </button>
        </div>
      </div>

      <div className="settings-more-toggles">
        {onAtmosphereEnabled && (
          <label className="settings-more-row">
            <input
              type="checkbox"
              checked={atmosphereEnabled}
              onChange={(e) => onAtmosphereEnabled(e.target.checked)}
            />
            <span>
              <strong>{t('settings.atmosphere')}</strong>
              <em>{t('settings.atmosphereHint')}</em>
            </span>
          </label>
        )}
        <label className="settings-more-row">
          <input
            type="checkbox"
            checked={stormMode}
            onChange={(e) => onStormMode(e.target.checked)}
          />
          <span>
            <strong>{t('settings.stormMode')}</strong>
            <em>{t('settings.stormModeHint')}</em>
          </span>
        </label>
        <label className="settings-more-row">
          <input
            type="checkbox"
            checked={severeMode}
            onChange={(e) => onSevereMode(e.target.checked)}
          />
          <span>
            <strong>{t('settings.alertsUi')}</strong>
            <em>{t('settings.alertsUiHint')}</em>
          </span>
        </label>
        <label className="settings-more-row">
          <input
            type="checkbox"
            checked={notifyAlerts}
            onChange={(e) => void onNotify(e.target.checked)}
          />
          <span>
            <strong>{t('settings.notify')}</strong>
            <em>{t('settings.notifyHint')}</em>
          </span>
        </label>
        {notifyAlerts && onTestNotify && (
          <div className="settings-push-test">
            <button type="button" className="chip-btn" onClick={() => void onTestNotify()}>
              {t('settings.testNotify')}
            </button>
            {pushStatusLabel && <p className="settings-push-status">{pushStatusLabel}</p>}
          </div>
        )}
        {onSetWork && (
          <div className="settings-more-row settings-more-action">
            <span>
              <strong>{t('settings.workPin')}</strong>
              <em>
                {isWork
                  ? t('settings.workIs')
                  : hasWork
                    ? t('settings.workReplace')
                    : t('settings.workSet')}
              </em>
            </span>
            <button type="button" className="chip-btn" onClick={() => onSetWork()}>
              {isWork ? t('settings.clearWork') : t('settings.setWork')}
            </button>
          </div>
        )}
        {hasWork && onGoWork && !isWork && (
          <button type="button" className="chip-btn settings-go-work" onClick={onGoWork}>
            {t('settings.goWork')}
          </button>
        )}
        <label className="settings-more-row">
          <input
            type="checkbox"
            checked={analyticsOff}
            onChange={(e) => {
              const off = e.target.checked
              setAnalyticsOff(off)
              setAnalyticsOptOut(off)
            }}
          />
          <span>
            <strong>{t('settings.analyticsOff')}</strong>
            <em>{t('settings.analyticsHint')}</em>
          </span>
        </label>
        {notifyAlerts && onQuietHours && (
          <>
            <label className="settings-more-row">
              <input
                type="checkbox"
                checked={quietHoursEnabled}
                onChange={(e) =>
                  onQuietHours({ quietHoursEnabled: e.target.checked })
                }
              />
              <span>
                <strong>{t('settings.quietHours')}</strong>
                <em>
                  {t('settings.quietHint')}
                  {locale === 'fr'
                    ? ' (heure du domicile / lieu)'
                    : ' (Home / place local time)'}
                </em>
              </span>
            </label>
            {quietHoursEnabled && (
              <div className="settings-quiet-hours">
                <label>
                  {t('settings.from')}
                  <input
                    type="time"
                    value={quietStart}
                    onChange={(e) => onQuietHours({ quietStart: e.target.value })}
                  />
                </label>
                <label>
                  {t('settings.to')}
                  <input
                    type="time"
                    value={quietEnd}
                    onChange={(e) => onQuietHours({ quietEnd: e.target.value })}
                  />
                </label>
              </div>
            )}
          </>
        )}
      </div>

      <div className="settings-more-section">
        <span className="settings-more-label">{t('settings.home')}</span>
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
              {t('settings.goHome')}
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
              {isHome ? t('settings.clearHome') : t('settings.setHome')}
            </button>
          )}
          {!hasHome && !onSetHome && (
            <p className="settings-home-hint">{t('settings.homeHint')}</p>
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
        {isFavorite ? t('settings.removeFav') : t('settings.saveFav')}
      </button>

      <button
        type="button"
        className="chip-btn settings-more-action"
        role="menuitem"
        onClick={() => {
          onCloudSync()
        }}
      >
        {cloudSynced ? t('settings.synced') : t('settings.sync')}
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
        {t('settings.share')}
      </button>
    </>
  )

  return (
    <div className="settings-bar">
      <AccountMenu onCloudSync={onCloudSync} synced={cloudSynced} />

      <button
        type="button"
        className={`chip-btn icon-chip storm-chip topbar-desktop-only ${stormMode ? 'active storm-on' : ''}`}
        onClick={() => onStormMode(!stormMode)}
        title={t('settings.stormModeHint')}
        aria-label={t('settings.stormMode')}
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
        title={t('app.refresh')}
        aria-label={t('app.refresh')}
      >
        ↻
      </button>

      <div className="settings-more-wrap" ref={moreRef}>
        <button
          type="button"
          className={`chip-btn icon-chip settings-open-btn ${moreOpen ? 'active' : ''}`}
          onClick={() => setMoreOpen((o) => !o)}
          title={t('settings.title')}
          aria-label={t('settings.open')}
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
            <div
              className="settings-sheet-root"
              role="dialog"
              aria-modal="true"
              aria-label={t('settings.title')}
            >
              <button
                type="button"
                className="settings-sheet-backdrop"
                aria-label={t('settings.close')}
                onClick={() => setMoreOpen(false)}
              />
              <div className="settings-sheet">
                <div className="settings-sheet-head">
                  <strong>{t('settings.title')}</strong>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => setMoreOpen(false)}
                  >
                    {t('settings.done')}
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
