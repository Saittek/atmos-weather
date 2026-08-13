/**
 * Shared chrome for full-page modes (Radar · Earth · Chase · Stargaze).
 * Same glass bar, brand typography, and mode-nav as the dashboard.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/I18nProvider'

export type ModeId = 'radar' | 'globe' | 'chase' | 'stargaze'

interface Props {
  mode: ModeId
  title: string
  subtitle?: string
  emoji?: string
  backTo?: string
  backLabel?: string
  /** Right-side controls (refresh, units, etc.) — mode nav is always appended */
  actions?: ReactNode
  /** Optional center slot (e.g. Earth mission segments) */
  center?: ReactNode
  /** Search / filters under the bar */
  belowBar?: ReactNode
  children: ReactNode
  className?: string
  /** Map-first pages fill the viewport below the bar */
  fullViewport?: boolean
}

export function ModePageShell({
  mode,
  title,
  subtitle,
  emoji,
  backTo = '/',
  backLabel,
  actions,
  center,
  belowBar,
  children,
  className = '',
  fullViewport = false,
}: Props) {
  const { t } = useI18n()
  const back = backLabel ?? t('page.back')

  return (
    <div
      className={[
        'mode-page',
        `mode-page--${mode}`,
        fullViewport ? 'mode-page--map' : 'mode-page--desk',
        'solara-redesign-m1',
        'solara-redesign-m2',
        'solara-redesign-m4',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-mode={mode}
    >
      <header className="mode-page-bar">
        <div className="mode-page-bar-start">
          <Link to={backTo} className="chip-btn mode-page-back" title={t('page.back')}>
            {back}
          </Link>
          <div className="mode-page-brand">
            {emoji ? (
              <span className="mode-page-emoji" aria-hidden>
                {emoji}
              </span>
            ) : null}
            <div className="mode-page-titles">
              <strong>{title}</strong>
              {subtitle ? <span>{subtitle}</span> : null}
            </div>
          </div>
        </div>

        {center ? <div className="mode-page-bar-center">{center}</div> : null}

        <div className="mode-page-bar-end">
          {actions ? <div className="mode-page-actions">{actions}</div> : null}
          <nav className="mode-page-nav" aria-label={t('nav.modes')}>
            {mode !== 'radar' && (
              <Link to="/radar" className="chip-btn icon-chip" title={t('settings.radar')} aria-label={t('settings.radar')}>
                📡
              </Link>
            )}
            {mode !== 'globe' && (
              <Link to="/globe" className="chip-btn icon-chip" title={t('settings.earth')} aria-label={t('settings.earth')}>
                🌍
              </Link>
            )}
            {mode !== 'chase' && (
              <Link to="/chase" className="chip-btn icon-chip" title={t('settings.chase')} aria-label={t('settings.chase')}>
                🌪
              </Link>
            )}
            {mode !== 'stargaze' && (
              <Link to="/stargaze" className="chip-btn icon-chip" title={t('settings.stargaze')} aria-label={t('settings.stargaze')}>
                ✨
              </Link>
            )}
          </nav>
        </div>
      </header>

      {belowBar ? <div className="mode-page-below">{belowBar}</div> : null}

      <div className="mode-page-body">{children}</div>
    </div>
  )
}
