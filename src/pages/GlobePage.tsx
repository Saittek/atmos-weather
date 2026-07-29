import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'

const GlobalRadarGlobe = lazy(() =>
  import('../components/GlobalRadarGlobe').then((m) => ({ default: m.GlobalRadarGlobe })),
)

/**
 * Full-screen 3D Earth with global radar overlay.
 * Route: /globe
 */
export default function GlobePage() {
  return (
    <div className="globe-page">
      <header className="globe-page-bar">
        <Link to="/" className="chip-btn globe-back" title="Back to dashboard">
          ← Solara
        </Link>
        <div className="globe-page-brand">
          <span className="globe-page-earth" aria-hidden>
            🌍
          </span>
          <div>
            <strong>Earth</strong>
            <span>Live global radar · hurricanes · 3D globe</span>
          </div>
        </div>
        <div className="globe-page-actions">
          <Link to="/radar" className="chip-btn hide-sm">
            Flat radar
          </Link>
          <Link to="/chase" className="chip-btn hide-sm">
            Storm chaser
          </Link>
        </div>
      </header>
      <div className="globe-page-map">
        <Suspense
          fallback={
            <div className="globe-overlay-msg" role="status">
              <div className="spinner large" />
              <span>Loading globe…</span>
            </div>
          }
        >
          <GlobalRadarGlobe />
        </Suspense>
      </div>
    </div>
  )
}
