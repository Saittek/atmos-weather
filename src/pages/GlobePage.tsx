import { lazy, Suspense, useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/I18nProvider'
import {
  type GlobeMode,
  loadGlobePrefs,
  saveGlobePrefs,
} from '../lib/globePrefs'

const GlobalRadarGlobe = lazy(() =>
  import('../components/GlobalRadarGlobe').then((m) => ({ default: m.GlobalRadarGlobe })),
)

const MODES: { id: GlobeMode; labelKey: string }[] = [
  { id: 'radar', labelKey: 'globe.modeRadar' },
  { id: 'storms', labelKey: 'globe.modeStorms' },
  { id: 'eclipse', labelKey: 'globe.modeEclipse' },
  { id: 'space', labelKey: 'globe.modeSpace' },
]

/**
 * Full-screen Mission Earth — 3D globe with radar / storms / eclipses.
 * Route: /globe · /earth
 */
export default function GlobePage() {
  const { te } = useI18n()
  const [mode, setMode] = useState<GlobeMode>(() => loadGlobePrefs().mode)

  const onMode = useCallback((m: GlobeMode) => {
    setMode(m)
    saveGlobePrefs({ mode: m })
  }, [])

  return (
    <div className="globe-page globe-mission">
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
          <Link to="/radar" className="chip-btn hide-sm" title={te('globe.flatRadar')}>
            📡
          </Link>
          <Link to="/chase" className="chip-btn hide-sm" title={te('globe.stormChaser')}>
            🌪
          </Link>
        </div>
        <div className="globe-mode-segment" role="tablist" aria-label={te('globe.modeAria')}>
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              className={`globe-mode-chip ${mode === m.id ? 'is-active' : ''}`}
              onClick={() => onMode(m.id)}
            >
              {te(m.labelKey as 'globe.modeRadar')}
            </button>
          ))}
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
          <GlobalRadarGlobe missionMode={mode} onMissionModeChange={onMode} />
        </Suspense>
      </div>
    </div>
  )
}
