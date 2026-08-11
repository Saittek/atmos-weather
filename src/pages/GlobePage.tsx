import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/I18nProvider'

const GlobalRadarGlobe = lazy(() =>
  import('../components/GlobalRadarGlobe').then((m) => ({ default: m.GlobalRadarGlobe })),
)

/**
 * Full-screen 3D Earth with global radar overlay.
 * Route: /globe
 */
export default function GlobePage() {
  const { te } = useI18n()
  return (
    <div className="globe-page">
      <header className="globe-page-bar">
        <Link to="/" className="chip-btn globe-back" title={te('common.dashboard')}>
          {te('globe.back')}
        </Link>
        <div className="globe-page-brand">
          <span className="globe-page-earth" aria-hidden>
            🌍
          </span>
          <div>
            <strong>{te('globe.title')}</strong>
            <span>{te('globe.subtitle')}</span>
          </div>
        </div>
        <div className="globe-page-actions">
          <Link to="/radar" className="chip-btn hide-sm">
            {te('globe.flatRadar')}
          </Link>
          <Link to="/chase" className="chip-btn hide-sm">
            {te('globe.stormChaser')}
          </Link>
        </div>
      </header>
      <div className="globe-page-map">
        <Suspense
          fallback={
            <div className="globe-overlay-msg" role="status">
              <div className="spinner large" />
              <span>{te('globe.loading')}</span>
            </div>
          }
        >
          <GlobalRadarGlobe />
        </Suspense>
      </div>
    </div>
  )
}
