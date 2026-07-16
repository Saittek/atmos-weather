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
import { MapOverlays, OVERLAY_OPTIONS, type OverlayMode } from './MapOverlays'
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

/** Hold time after a crossfade finishes (ms) */
const SPEED_HOLD_MS = { slow: 700, normal: 380, fast: 160 } as const
/** Crossfade duration between frames (ms) */
const SPEED_FADE_MS = { slow: 420, normal: 280, fast: 160 } as const
type SpeedKey = keyof typeof SPEED_HOLD_MS

function isConstrainedDevice() {
  return detectConstrained()
}

function easeInOut(t: number): number {
  return t * t * (3 - 2 * t)
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

const EMPTY_TILE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

function makeTileLayer(
  url: string,
  opts: {
    opacity: number
    maxNativeZoom: number
    zIndex: number
    attribution?: string
    className?: string
  },
): L.TileLayer {
  return L.tileLayer(url, {
    opacity: opts.opacity,
    zIndex: opts.zIndex,
    maxZoom: 12,
    maxNativeZoom: opts.maxNativeZoom,
    className: opts.className ?? 'radar-tiles',
    attribution: opts.attribution,
    updateWhenIdle: true,
    updateWhenZooming: false,
    keepBuffer: 2,
    errorTileUrl: EMPTY_TILE,
  })
}

/**
 * Static (non-animated) weather tiles — single layer.
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
      const layer = makeTileLayer(urlTemplate, {
        opacity,
        maxNativeZoom,
        zIndex,
        attribution,
        className,
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

/**
 * Smooth radar loop: dual tile layers with opacity crossfade (not hard cuts).
 * Preloads the next frame, then blends for a continuous video-like feel.
 */
function SmoothRadarLoop({
  frames,
  frameIdx,
  frameUrl,
  opacity,
  maxNativeZoom,
  attribution,
  fadeMs,
}: {
  frames: RadarFrame[]
  frameIdx: number
  frameUrl: (frame: RadarFrame) => string | null
  opacity: number
  maxNativeZoom: number
  attribution: string
  fadeMs: number
}) {
  const map = useMap()
  const aRef = useRef<L.TileLayer | null>(null)
  const bRef = useRef<L.TileLayer | null>(null)
  const activeIsA = useRef(true)
  const opacityRef = useRef(opacity)
  const rafRef = useRef<number | null>(null)
  const lastIdx = useRef(-1)
  opacityRef.current = opacity

  const cancelRaf = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  // Create / destroy pair of layers
  useEffect(() => {
    const a = makeTileLayer(EMPTY_TILE, {
      opacity: 0,
      maxNativeZoom,
      zIndex: 200,
      attribution,
      className: 'radar-tiles radar-fade-a',
    })
    const b = makeTileLayer(EMPTY_TILE, {
      opacity: 0,
      maxNativeZoom,
      zIndex: 201,
      attribution,
      className: 'radar-tiles radar-fade-b',
    })
    a.addTo(map)
    b.addTo(map)
    aRef.current = a
    bRef.current = b
    activeIsA.current = true
    lastIdx.current = -1

    return () => {
      cancelRaf()
      try {
        map.removeLayer(a)
        map.removeLayer(b)
      } catch {
        /* ignore */
      }
      aRef.current = null
      bRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, maxNativeZoom, attribution])

  // Crossfade when frame index changes
  useEffect(() => {
    const a = aRef.current
    const b = bRef.current
    if (!a || !b || !frames.length) return
    const frame = frames[frameIdx]
    if (!frame) return
    const url = frameUrl(frame)
    if (!url) return

    const targetOp = opacityRef.current

    // First frame — show on A immediately, no fade
    if (lastIdx.current < 0) {
      cancelRaf()
      a.setUrl(url)
      a.setOpacity(targetOp)
      a.setZIndex(210)
      b.setOpacity(0)
      b.setZIndex(200)
      activeIsA.current = true
      lastIdx.current = frameIdx
      return
    }

    if (lastIdx.current === frameIdx) {
      // Opacity slider only
      const active = activeIsA.current ? a : b
      active.setOpacity(targetOp)
      return
    }

    lastIdx.current = frameIdx
    cancelRaf()

    // from = current visible, to = next frame layer
    const fromLayer = activeIsA.current ? a : b
    const toLayer = activeIsA.current ? b : a
    toLayer.setZIndex(210)
    fromLayer.setZIndex(200)
    toLayer.setOpacity(0)
    toLayer.setUrl(url)

    let started = false
    const startFade = () => {
      if (started) return
      started = true
      const duration = Math.max(80, fadeMs)
      const t0 = performance.now()
      fromLayer.setOpacity(targetOp)
      toLayer.setOpacity(0)

      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / duration)
        const e = easeInOut(t)
        fromLayer.setOpacity(targetOp * (1 - e))
        toLayer.setOpacity(targetOp * e)
        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick)
        } else {
          fromLayer.setOpacity(0)
          toLayer.setOpacity(targetOp)
          activeIsA.current = !activeIsA.current
          rafRef.current = null
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    // Prefer waiting for tiles, but don't stall the loop forever
    const onLoad = () => {
      toLayer.off('load', onLoad)
      startFade()
    }
    toLayer.on('load', onLoad)
    requestAnimationFrame(() => {
      try {
        toLayer.redraw()
      } catch {
        /* ignore */
      }
    })
    const safety = window.setTimeout(() => {
      toLayer.off('load', onLoad)
      startFade()
    }, Math.min(900, fadeMs + 500))

    return () => {
      window.clearTimeout(safety)
      toLayer.off('load', onLoad)
    }
  }, [frameIdx, frames, frameUrl, fadeMs])

  // Live opacity updates while not mid-index-change
  useEffect(() => {
    const a = aRef.current
    const b = bRef.current
    if (!a || !b || rafRef.current != null) return
    const active = activeIsA.current ? a : b
    active.setOpacity(opacity)
  }, [opacity])

  return null
}

export function RadarMap({
  lat,
  lon,
  placeName,
  units: _units,
  severeMode,
  mapId = 'radar-map',
  pageMode = false,
}: Props) {
  void _units
  const lite = useMemo(() => isConstrainedDevice(), [])
  const [sourceId, setSourceId] = useState<RadarSourceId>('global_loop')
  const [frames, setFrames] = useState<RadarFrame[]>([])
  const [frameIdx, setFrameIdx] = useState(0)
  // Don't autoplay on constrained devices — user taps play
  const [playing, setPlaying] = useState(() => !isConstrainedDevice())
  const [speed, setSpeed] = useState<SpeedKey>(() =>
    isConstrainedDevice() ? 'slow' : 'normal',
  )
  const [opacity, setOpacity] = useState(0.78)
  const [basemap, setBasemap] = useState<Basemap>('dark')
  const [showFires, setShowFires] = useState(false)
  const [overlay, setOverlay] = useState<OverlayMode>('none')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rvHost, setRvHost] = useState('https://tilecache.rainviewer.com')
  const [fullscreen, setFullscreen] = useState(false)
  const wrapRef = useRef<HTMLElement>(null)

  const meta = getSourceMeta(sourceId)
  const base = BASEMAPS[basemap]
  const frame = frames[frameIdx] ?? null
  const fadeMs = lite ? Math.min(SPEED_FADE_MS[speed], 180) : SPEED_FADE_MS[speed]
  const holdMs = SPEED_HOLD_MS[speed]

  const frameUrl = useCallback(
    (f: RadarFrame) => primaryTileUrl(sourceId, f, rvHost),
    [sourceId, rvHost],
  )

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
      // Prefer fuller loop for global radar smoothness
      const next = await loadFrames(sourceId, {
        lite: lite && sourceId !== 'global_loop',
      })
      if (!next.length) throw new Error('No frames available for this source')
      setFrames(next)
      setFrameIdx(0) // start loop from oldest → newest for natural motion
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

  // Keep global loop as the default; only auto-switch away if user never touched source
  // (no auto continent override — always open on global_loop)

  useEffect(() => {
    if (severeMode) {
      setPlaying(true)
      setOpacity((o) => Math.max(o, 0.8))
    }
  }, [severeMode])

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) setPlaying(false)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // Pause tile radar while Ventusky model map is open (saves bandwidth)
  useEffect(() => {
    if (overlay !== 'none') setPlaying(false)
  }, [overlay])

  // Playback: hold + crossfade timing (advance after fade+hold)
  useEffect(() => {
    if (overlay !== 'none') return
    if (!playing || document.hidden || !meta.animated || frames.length < 2) return
    const hold = frameIdx >= frames.length - 1 ? holdMs + 650 : holdMs
    const t = window.setTimeout(() => {
      setFrameIdx((i) => (i + 1) % frames.length)
    }, hold + fadeMs)
    return () => window.clearTimeout(t)
  }, [playing, holdMs, fadeMs, frameIdx, frames.length, meta.animated, overlay])

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

  const ventuskyOn = overlay !== 'none'
  const compact = !pageMode

  return (
    <section
      id={mapId}
      ref={wrapRef as React.RefObject<HTMLElement>}
      className={`panel radar-panel ${fullscreen ? 'is-fullscreen' : ''} ${pageMode ? 'radar-page-mode' : ''} ${severeMode ? 'severe-radar' : ''} ${ventuskyOn ? 'has-ventusky' : ''} ${compact ? 'radar-compact' : ''}`}
    >
      <div className="panel-header radar-header">
        <h2>{ventuskyOn ? '🌡 Model map' : '📡 Live radar'}</h2>
        <div className="radar-header-actions">
          <span className="panel-hint">{ventuskyOn ? 'Ventusky' : meta.coverage}</span>
          {!ventuskyOn && (
            <button type="button" className="chip-btn" onClick={() => void reload()} disabled={loading}>
              ↻
            </button>
          )}
          <button type="button" className="chip-btn" onClick={() => void toggleFullscreen()}>
            {fullscreen ? '✕' : '⛶'}
          </button>
        </div>
      </div>

      {/* Quick model layers — always visible so mobile can open Ventusky without hunting */}
      <div className="ventusky-quick" role="toolbar" aria-label="Model map layers">
        <button
          type="button"
          className={`chip-btn ${overlay === 'none' ? 'active' : ''}`}
          onClick={() => setOverlay('none')}
        >
          Radar
        </button>
        {(
          [
            ['temp', 'Temp'],
            ['wind', 'Wind'],
            ['precip', 'Rain'],
            ['clouds', 'Clouds'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`chip-btn ${overlay === id ? 'active' : ''}`}
            onClick={() => setOverlay(id)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className={`chip-btn ${['gust', 'pressure', 'cape'].includes(overlay) ? 'active' : ''}`}
          onClick={() => setOverlay(overlay === 'gust' ? 'pressure' : overlay === 'pressure' ? 'cape' : 'gust')}
          title="More Ventusky layers"
        >
          More
        </button>
      </div>

      <div className="radar-stage">
        {ventuskyOn ? (
          <MapOverlays
            lat={lat}
            lon={lon}
            mode={overlay}
            placeName={placeName}
            mapZoom={compact ? 5 : 6}
            compact={compact}
          />
        ) : (
          <>
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

              {meta.animated && frames.length > 0 ? (
                <SmoothRadarLoop
                  frames={frames}
                  frameIdx={frameIdx}
                  frameUrl={frameUrl}
                  opacity={opacity}
                  maxNativeZoom={meta.maxNativeZoom}
                  attribution={meta.attribution}
                  fadeMs={fadeMs}
                />
              ) : (
                <WeatherTileLayer
                  urlTemplate={primaryUrl}
                  opacity={opacity}
                  maxNativeZoom={meta.maxNativeZoom}
                  zIndex={200}
                  attribution={meta.attribution}
                />
              )}

              <FireSmokeLayers
                lat={lat}
                lon={lon}
                showFires={showFires}
                showSmoke={false}
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
          </>
        )}
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
            Model map (Ventusky)
            <select
              value={overlay}
              onChange={(e) => setOverlay(e.target.value as OverlayMode)}
            >
              {OVERLAY_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
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
        </div>

        <p className="radar-product-hint">
          {overlay !== 'none'
            ? 'Interactive model fields from Ventusky — pan, zoom, and scrub time inside the map.'
            : meta.desc}
          {showFires ? ' · NASA FIRMS 24h fires' : ''}
        </p>
      </div>
    </section>
  )
}
