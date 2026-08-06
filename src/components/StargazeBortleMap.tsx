/**
 * Light pollution map — live map from lightpollutionmap.info (not our bad local webp).
 * Correct lat/lon deep link; user zooms/pans inside the embedded map.
 */
import { useCallback, useMemo, useState } from 'react'
import {
  buildLightPollutionMapUrl,
  LIGHT_POLLUTION_MAP_ATTRIBUTION,
} from '../utils/lightPollutionMapUrl'

interface Props {
  lat: number
  lon: number
  placeName: string
  bortleClass?: number | null
}

export function StargazeBortleMap({ lat, lon, placeName, bortleClass }: Props) {
  const [zoom, setZoom] = useState(8)
  const [reloadKey, setReloadKey] = useState(0)
  const [loaded, setLoaded] = useState(false)

  const src = useMemo(
    () => buildLightPollutionMapUrl(lat, lon, zoom),
    [lat, lon, zoom, reloadKey],
  )

  const fullSite = useMemo(
    () => buildLightPollutionMapUrl(lat, lon, Math.max(zoom, 9)),
    [lat, lon, zoom],
  )

  const bumpZoom = useCallback((delta: number) => {
    setLoaded(false)
    setZoom((z) => Math.max(3, Math.min(12, z + delta)))
    setReloadKey((k) => k + 1)
  }, [])

  const recenter = useCallback(() => {
    setLoaded(false)
    setZoom(8)
    setReloadKey((k) => k + 1)
  }, [])

  return (
    <div
      className="sg-bortle-map-interactive"
      aria-label={`Light pollution map near ${placeName}`}
    >
      <div className="sg-bortle-toolbar">
        <div className="sg-bortle-controls" aria-label="Map controls">
          <button
            type="button"
            className="chip-btn"
            onClick={() => bumpZoom(1)}
            title="Reload closer in"
          >
            +
          </button>
          <button
            type="button"
            className="chip-btn"
            onClick={() => bumpZoom(-1)}
            title="Reload zoomed out"
          >
            −
          </button>
          <button type="button" className="chip-btn" onClick={recenter} title="Recenter on place">
            ◎
          </button>
        </div>
        <a
          className="chip-btn sg-bortle-open"
          href={fullSite}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open full map ↗
        </a>
      </div>

      <div className="sg-bortle-iframe-wrap">
        {!loaded && (
          <div className="sg-bortle-loading" aria-live="polite">
            Loading light pollution map…
          </div>
        )}
        <iframe
          key={`${reloadKey}-${lat.toFixed(4)}-${lon.toFixed(4)}-${zoom}`}
          title={`Light pollution · ${placeName}`}
          src={src}
          className="sg-bortle-iframe"
          loading="eager"
          referrerPolicy="no-referrer-when-downgrade"
          allow="fullscreen"
          onLoad={() => setLoaded(true)}
        />
      </div>

      <p className="sg-cloud-map-cap">
        Live map from lightpollutionmap.info · centered on{' '}
        <strong>{placeName}</strong>
        {bortleClass != null ? ` · Solara Bortle ~${bortleClass}` : ''}
        <br />
        <span className="sg-bortle-attr">{LIGHT_POLLUTION_MAP_ATTRIBUTION}</span>
      </p>
    </div>
  )
}
