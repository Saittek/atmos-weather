import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  useMap,
  CircleMarker,
  Popup,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  defaultSourceForLocation,
  getSourceMeta,
  loadFrames,
  primaryTileUrl,
  secondaryTileUrl,
  fetchRainViewerMaps,
  RADAR_SOURCES,
  type RadarFrame,
  type RadarSourceId,
} from '../api/radar'
import { formatRadarTime } from '../utils/format'
import type { Units } from '../utils/format'
import { MapOverlays, type OverlayMode } from './MapOverlays'
import { FireSmokeLayers } from './FireSmokeLayers'
import { isConstrainedDevice as detectConstrained } from '../utils/device'

interface Props {
  lat: number
  lon: number
  placeName: string
  units: Units
  severeMode?: boolean
  mapId?: string
  pageMode?: boolean
}

type Basemap = 'dark' | 'street' | 'sat'

const BASEMAPS: Record<Basemap, { url: string; attr: string; name: string }> = {
  dark: {
    name: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attr: '&copy; OSM &copy; CARTO',
  },
  street: {
    name: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr: '&copy; OpenStreetMap',
  },
  sat: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: 'Tiles &copy; Esri',
  },
}

const SPEED_MS = { slow: 900, normal: 550, fast: 300 } as const
type SpeedKey = keyof typeof SPEED_MS

function isConstrainedDevice() {
  return detectConstrained()
}

function MapRecenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lon], map.getZoom(), { animate: !isConstrainedDevice() })
  }, [lat, lon, map])
  return null
}

function MapSizeFix() {
  const map = useMap()
  useEffect(() => {
    const fix = () => {
      try {
        map.invalidateSize({ animate: false })
      } catch {
        /* ignore */
      }
    }
    fix()
    const t1 = window.setTimeout(fix, 100)
    const t2 = window.setTimeout(fix, 400)
    window.addEventListener('resize', fix)
    const el = map.getContainer()
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => fix()) : null
    if (el && ro) ro.observe(el.parentElement ?? el)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.removeEventListener('resize', fix)
      ro?.disconnect()
    }
  }, [map])
  return null
}

/**
 * Single TileLayer that swaps URL templates per frame (much cheaper than stacking).
 */
function WeatherTileLayer({
  urlTemplate,
  opacity,
  maxNativeZoom,
  zIndex,
  attribution,
  className,
}: {
  urlTemplate: string | null
  opacity: number
  maxNativeZoom: number
  zIndex: number
  attribution?: string
  className?: string
}) {
  const map = useMap()
  const layerRef = useRef<L.TileLayer | null>(null)

  useEffect(() => {
    if (!urlTemplate) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
      return
    }

    if (!layerRef.current) {
      const layer = L.tileLayer(urlTemplate, {
        opacity,
        zIndex,
        maxZoom: 12,
        maxNativeZoom,
        className: className ?? 'radar-tiles',
        attribution,
        updateWhenIdle: true,
        updateWhenZooming: false,
        keepBuffer: 1,
        errorTileUrl:
          'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      })
      layer.addTo(map)
      layerRef.current = layer
    } else {
      layerRef.current.setUrl(urlTemplate)
      layerRef.current.setOpacity(opacity)
      layerRef.current.options.maxNativeZoom = maxNativeZoom
    }
  }, [urlTemplate, map, maxNativeZoom, zIndex, attribution, className, opacity])

  useEffect(() => {
    layerRef.current?.setOpacity(opacity)
  }, [opacity])

  useEffect(() => {
    return () => {
      if (layerRef.current) {
        try {
          map.removeLayer(layerRef.current)
        } catch {
          /* ignore */
        }
        layerRef.current = null
      }
    }
  }, [map])

  return null
}

export function RadarMap({
  lat,
  lon,
  placeName,
  units,
  severeMode,
  mapId = 'radar-map',
  pageMode = false,
}: Props) {
  const lite = useMemo(() => isConstrainedDevice(), [])
  const [sourceId, setSourceId] = useState<RadarSourceId>(() =>
    defaultSourceForLocation(lat, lon),
  )
  const [frames, setFrames] = useState<RadarFrame[]>([])
  const [frameIdx, setFrameIdx] = useState(0)
  const [playing, setPlaying] = useState(() => !lite)
  const [speed, setSpeed] = useState<SpeedKey>(() => (lite ? 'slow' : 'normal'))
  const [opacity, setOpacity] = useState(0.78)
  const [basemap, setBasemap] = useState<Basemap>('dark')
  const [showFires, setShowFires] = useState(false)
  const [showSmoke, setShowSmoke] = useState(false)
  const [overlay, setOverlay] = useState<OverlayMode>('none')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rvHost, setRvHost] = useState('https://tilecache.rainviewer.com')
  const [fullscreen, setFullscreen] = useState(false)
  const wrapRef = useRef<HTMLElement>(null)

  const meta = getSourceMeta(sourceId)
  const base = BASEMAPS[basemap]
  const frame = frames[frameIdx] ?? null

  const primaryUrl = useMemo(
    () => primaryTileUrl(sourceId, frame, rvHost),
    [sourceId, frame, rvHost],
  )
  const secondaryUrl = useMemo(() => secondaryTileUrl(sourceId), [sourceId])

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (sourceId === 'global_loop') {
        const maps = await fetchRainViewerMaps()
        setRvHost(maps.host || 'https://tilecache.rainviewer.com')
      }
      const next = await loadFrames(sourceId, { lite })
      if (!next.length) throw new Error('No frames available for this source')
      setFrames(next)
      setFrameIdx(Math.max(0, next.length - 1))
    } catch (e) {
      setFrames([])
      setError(e instanceof Error ? e.message : 'Radar failed to load')
    } finally {
      setLoading(false)
    }
  }, [sourceId, lite])

  useEffect(() => {
    void reload()
    const mins = lite ? 6 : 4
    const id = window.setInterval(() => {
      if (!document.hidden) void reload()
    }, mins * 60 * 1000)
    return () => window.clearInterval(id)
  }, [reload, lite])

  // Auto-pick better source when location jumps continents
  useEffect(() => {
    setSourceId((cur) => {
      const next = defaultSourceForLocation(lat, lon)
      // Don't override user if they already chose something compatible
      const us = lat >= 20 && lat <= 55 && lon >= -130 && lon <= -60
      if (us && (cur.startsWith('us_') || cur === 'global_loop')) return cur
      if (!us && (cur === 'global_loop' || cur === 'nasa_ir' || cur.startsWith('goes')))
        return cur
      return next
    })
  }, [lat, lon])

  useEffect(() => {
    if (severeMode && !lite) {
      setSourceId('us_nexrad_loop')
      setPlaying(true)
      setOpacity((o) => Math.max(o, 0.8))
    }
  }, [severeMode, lite])

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) setPlaying(false)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // Playback
  useEffect(() => {
    if (!playing || document.hidden || !meta.animated || frames.length < 2) return
    const wait = SPEED_MS[speed]
    const hold = frameIdx >= frames.length - 1 ? wait + 700 : wait
    const t = window.setTimeout(() => {
      setFrameIdx((i) => (i + 1) % frames.length)
    }, hold)
    return () => window.clearTimeout(t)
  }, [playing, speed, frameIdx, frames.length, meta.animated])

  const toggleFullscreen = async () => {
    const el = wrapRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      await el.requestFullscreen()
      setFullscreen(true)
    } else {
      await document.exitFullscreen()
      setFullscreen(false)
    }
  }

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const timeLabel = frame?.time
    ? formatRadarTime(frame.time)
    : loading
      ? 'Loading…'
      : '—'

  return (
    <section
      id={mapId}
      ref={wrapRef as React.RefObject<HTMLElement>}
      className={`panel radar-panel ${fullscreen ? 'is-fullscreen' : ''} ${pageMode ? 'radar-page-mode' : ''} ${severeMode ? 'severe-radar' : ''}`}
    >
      <div className="panel-header radar-header">
        <h2>📡 Live radar</h2>
        <div className="radar-header-actions">
          <span className="panel-hint">{meta.coverage}</span>
          <button type="button" className="chip-btn" onClick={() => void reload()} disabled={loading}>
            ↻
          </button>
          <button type="button" className="chip-btn" onClick={() => void toggleFullscreen()}>
            {fullscreen ? '✕' : '⛶'}
          </button>
        </div>
      </div>

      <div className="radar-stage">
        {loading && (
          <div className="radar-overlay-msg" role="status">
            Loading {meta.name}…
          </div>
        )}
        {error && (
          <div className="radar-overlay-msg error" role="alert">
            {error}
          </div>
        )}

        <MapContainer
          key={`${mapId}-${lat.toFixed(2)}-${lon.toFixed(2)}`}
          center={[lat, lon]}
          zoom={pageMode ? 6 : 7}
          minZoom={3}
          maxZoom={12}
          className="radar-map"
          zoomControl
          attributionControl
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer url={base.url} attribution={base.attr} maxZoom={19} />

          {secondaryUrl && (
            <WeatherTileLayer
              urlTemplate={secondaryUrl}
              opacity={0.55}
              maxNativeZoom={7}
              zIndex={180}
              className="satellite-tiles"
              attribution={meta.attribution}
            />
          )}

          <WeatherTileLayer
            urlTemplate={primaryUrl}
            opacity={opacity}
            maxNativeZoom={meta.maxNativeZoom}
            zIndex={200}
            attribution={meta.attribution}
          />

          <FireSmokeLayers
            lat={lat}
            lon={lon}
            showFires={showFires}
            showSmoke={showSmoke}
          />
          <MapOverlays
            lat={lat}
            lon={lon}
            mode={overlay}
            units={units}
            enabled={overlay !== 'none'}
          />

          <CircleMarker
            center={[lat, lon]}
            radius={7}
            pathOptions={{
              color: '#fff',
              weight: 2,
              fillColor: '#38bdf8',
              fillOpacity: 0.95,
            }}
          >
            <Popup>{placeName}</Popup>
          </CircleMarker>
          <MapRecenter lat={lat} lon={lon} />
          <MapSizeFix />
        </MapContainer>

        <div className="radar-legend">
          <span>Light</span>
          <div
            className="legend-gradient"
            style={{
              background:
                sourceId.includes('goes') || sourceId === 'nasa_ir'
                  ? 'linear-gradient(90deg,#0b1220,#4b5563,#e5e7eb,#fef3c7,#f97316)'
                  : 'linear-gradient(90deg,#00ecec,#01a0f6,#00ff00,#ffff00,#ff9000,#ff0000,#c000c0)',
            }}
          />
          <span>Heavy</span>
        </div>

        <div className="radar-time-badge">
          <span className={`pulse ${playing && meta.animated ? 'on' : ''}`} />
          {timeLabel}
          {meta.animated && frames.length > 0 && (
            <span className="frame-count">
              {frameIdx + 1}/{frames.length}
            </span>
          )}
        </div>
      </div>

      <div className="radar-controls">
        {meta.animated && (
          <div className="playback">
            <button
              type="button"
              className="chip-btn icon-chip"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <input
              type="range"
              className="timeline"
              min={0}
              max={Math.max(0, frames.length - 1)}
              value={frameIdx}
              onChange={(e) => {
                setPlaying(false)
                setFrameIdx(Number(e.target.value))
              }}
              aria-label="Radar timeline"
            />
            <div className="speed-group">
              {(
                [
                  ['slow', '0.5×'],
                  ['normal', '1×'],
                  ['fast', '2×'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`chip-btn ${speed === key ? 'active' : ''}`}
                  onClick={() => setSpeed(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="radar-options">
          <label className="opt">
            Source
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value as RadarSourceId)}
            >
              {RADAR_SOURCES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.coverage}
                </option>
              ))}
            </select>
          </label>

          <label className="opt">
            Opacity
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
            />
          </label>

          <label className="opt">
            Map
            <select
              value={basemap}
              onChange={(e) => setBasemap(e.target.value as Basemap)}
            >
              {(Object.keys(BASEMAPS) as Basemap[]).map((k) => (
                <option key={k} value={k}>
                  {BASEMAPS[k].name}
                </option>
              ))}
            </select>
          </label>

          <label className="opt">
            Model overlay
            <select
              value={overlay}
              onChange={(e) => setOverlay(e.target.value as OverlayMode)}
            >
              <option value="none">None</option>
              <option value="temp">Temperature</option>
              <option value="wind">Wind</option>
              <option value="clouds">Cloud cover</option>
              <option value="precip">Precip (model)</option>
            </select>
          </label>

          <label className="toggle fire-toggle">
            <input
              type="checkbox"
              checked={showFires}
              onChange={(e) => setShowFires(e.target.checked)}
            />
            🔥 Fires
          </label>
          <label className="toggle smoke-toggle">
            <input
              type="checkbox"
              checked={showSmoke}
              onChange={(e) => setShowSmoke(e.target.checked)}
            />
            💨 Smoke
          </label>
        </div>

        <p className="radar-product-hint">
          {meta.desc}
          {showFires ? ' · NASA FIRMS 24h fires' : ''}
          {showSmoke ? ' · PM2.5 haze field' : ''}
        </p>
      </div>
    </section>
  )
}
