import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import type { Units } from '../utils/format'
import { ErrorBoundary } from './ErrorBoundary'
import { Deferred } from './Deferred'

const RadarMap = lazy(() => import('./RadarMap').then((m) => ({ default: m.RadarMap })))

interface Props {
  lat: number
  lon: number
  placeName: string
  radarPath: string
  units: Units
}

export function RadarPeek({ lat, lon, placeName, radarPath, units }: Props) {
  return (
    <section className="radar-peek" aria-label="Radar peek">
      <div className="panel-header radar-peek-head">
        <h2>Radar</h2>
        <Link to={radarPath} className="chip-btn">
          Full radar
        </Link>
      </div>
      <Deferred force={false} rootMargin="80px 0px" minHeight={160}>
        <Suspense fallback={<p className="muted-center">Loading radar…</p>}>
          <ErrorBoundary compact label="Radar peek hit a problem">
            <RadarMap
              lat={lat}
              lon={lon}
              placeName={placeName}
              units={units}
              mapId="radar-peek"
              pageMode={false}
            />
          </ErrorBoundary>
        </Suspense>
      </Deferred>
    </section>
  )
}
