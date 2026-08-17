import { lazy, Suspense, useCallback, useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import { ModePageShell } from '../components/ModePageShell'
import { ErrorBoundary } from '../components/ErrorBoundary'
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
    <ModePageShell
      mode="globe"
      title={te('globe.title')}
      subtitle={te('globe.subtitle')}
      emoji="🌍"
      backLabel={te('globe.back')}
      fullViewport
      className="globe-page globe-mission"
      center={
        <div className="globe-mode-segment mode-segment" role="tablist" aria-label={te('globe.modeAria')}>
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              className={`globe-mode-chip mode-segment-chip ${mode === m.id ? 'is-active' : ''}`}
              onClick={() => onMode(m.id)}
            >
              {te(m.labelKey as 'globe.modeRadar')}
            </button>
          ))}
        </div>
      }
    >
      <Suspense
        fallback={
          <div className="globe-overlay-msg mode-page-loading" role="status">
            <div className="spinner large" />
            <span>{te('globe.loading')}</span>
          </div>
        }
      >
        <ErrorBoundary compact label="Earth hit a problem">
          <GlobalRadarGlobe missionMode={mode} onMissionModeChange={onMode} />
        </ErrorBoundary>
      </Suspense>
    </ModePageShell>
  )
}
