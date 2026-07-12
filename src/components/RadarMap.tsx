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
  COLOR_SCHEMES,
  coverageTileUrl,
  fetchRadarMaps,
  getAllFrames,
  getSatelliteFrames,
  gibsInfraredAttribution,
  gibsInfraredTileUrl,
  productSettings,
  RADAR_PRODUCTS,
  satelliteTileUrl,
  tileUrl,
  type ColorScheme,
  type RadarProduct,
} from '../api/radar'
import type { RadarFrame, RadarMaps } from '../api/types'
import { formatRadarTime } from '../utils/format'
import type { Units } from '../utils/format'
import { MapOverlays, type OverlayMode } from './MapOverlays'
import { FireSmokeLayers } from './FireSmokeLayers'

interface Props {
  lat: number
  lon: number
  placeName: string
  units: Units
  severeMode?: boolean
  mapId?: string
  /** Full-viewport page mode (/radar) */
  pageMode?: boolean
}

type Basemap = 'dark' | 'street' | 'sat'

const BASEMAPS: Record<Basemap, { url: string; attr: string; name: string }> = {
  dark: {
    name: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
  street: {
    name: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  sat: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: 'Tiles &copy; Esri',
  },
}

/** Frame hold time (ms) before advancing */
const SPEED_MS = { slow: 900, normal: 520, fast: 280 } as const
type SpeedKey = keyof typeof SPEED_MS

function fadeMs(speed: SpeedKey): number {
  if (speed === 'fast') return 140
  if (speed === 'slow') return 320
  return 220
}

/** Pause on the latest frame before looping (real radar-loop feel) */
const LOOP_HOLD_MS = 750

function MapRecenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lon], map.getZoom(), { animate: true })
  }, [lat, lon, map])
  return null
}

/** Leaflet measures container size once — fix 0-height mounts (full-page) + resizes */
function MapSizeFix() {
  const map = useMap()
  useEffect(() => {
    const fix = () => {
      try {
        map.invalidateSize({ animate: false })
      } catch {
        /* map may be torn down */
      }
    }
    fix()
    const t1 = window.setTimeout(fix, 80)
    const t2 = window.setTimeout(fix, 320)
    const t3 = window.setTimeout(fix, 800)
    window.addEventListener('resize', fix)
    const el = map.getContainer()
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => fix()) : null
    if (el && ro) ro.observe(el.parentElement ?? el)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
      window.removeEventListener('resize', fix)
      ro?.disconnect()
    }
  }, [map])
  return null
}

/**
 * Video-style radar engine:
 * 1. Stacks every frame as a TileLayer (hidden at opacity 0)
 * 2. Preloads viewport tiles for all frames
 * 3. Crossfades with requestAnimationFrame (no layer teardown)
 */
function RadarEngine({
  host,
  frames,
  frameIdx,
  color,
  opacity,
  smooth,
  snow,
  fadeDuration,
  onBuffer,
}: {
  host: string
  frames: RadarFrame[]
  frameIdx: number
  color: ColorScheme
  opacity: number
  smooth: boolean
  snow: boolean
  fadeDuration: number
  onBuffer: (ready: boolean, progress: number) => void
}) {
  const map = useMap()
  const layersRef = useRef<L.TileLayer[]>([])
  const activeRef = useRef(0)
  const opacityRef = useRef(opacity)
  const fadeDurRef = useRef(fadeDuration)
  const rafRef = useRef<number | null>(null)
  const configKey = `${host}|${color}|${smooth}|${snow}|${frames.map((f) => f.path).join(',')}`

  opacityRef.current = opacity
  fadeDurRef.current = fadeDuration

  const cancelFade = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const showOnly = useCallback((idx: number, op: number) => {
    layersRef.current.forEach((l, i) => l.setOpacity(i === idx ? op : 0))
    activeRef.current = idx
  }, [])

  const fadeTo = useCallback(
    (toIdx: number) => {
      cancelFade()
      const layers = layersRef.current
      if (!layers.length) return
      const to = layers[toIdx]
      if (!to) return

      const target = opacityRef.current
      const duration = fadeDurRef.current
      const fromIdx = activeRef.current
      const from = layers[fromIdx]

      if (toIdx === fromIdx || duration <= 0) {
        showOnly(toIdx, target)
        return
      }

      to.setZIndex(230)
      from?.setZIndex(220)

      from?.setOpacity(target)
      to.setOpacity(0)

      const t0 = performance.now()

      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / duration)
        const e = t * t * (3 - 2 * t) // smoothstep
        from?.setOpacity(target * (1 - e))
        to.setOpacity(target * e)

        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick)
        } else {
          showOnly(toIdx, target)
          layers.forEach((l) => l.setZIndex(200))
          rafRef.current = null
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    },
    [cancelFade, showOnly],
  )

  // Build full frame stack when data / style changes
  useEffect(() => {
    cancelFade()
    layersRef.current.forEach((l) => map.removeLayer(l))
    layersRef.current = []

    if (!frames.length) {
      onBuffer(true, 1)
      return
    }

    onBuffer(false, 0)

    const layers = frames.map((frame) => {
      const layer = L.tileLayer(tileUrl(host, frame.path, color, smooth, snow), {
        opacity: 0,
        zIndex: 200,
        maxZoom: 12,
        maxNativeZoom: 7,
        tileSize: 256,
        className: 'radar-tiles',
        keepBuffer: 3,
        updateWhenIdle: false,
        updateWhenZooming: true,
        errorTileUrl:
          'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      })
      layer.addTo(map)
      const el = layer.getContainer()
      if (el) el.classList.add('radar-frame-layer')
      return layer
    })

    layersRef.current = layers

    const initial = Math.max(0, Math.min(frameIdx, frames.length - 1))
    showOnly(initial, opacityRef.current)

    let done = 0
    const total = layers.length
    const onLayerReady = () => {
      done += 1
      onBuffer(done >= total, done / total)
    }

    const handlers: Array<{ layer: L.TileLayer; fn: () => void }> = []
    layers.forEach((layer) => {
      const fn = () => {
        layer.off('load', fn)
        onLayerReady()
      }
      layer.on('load', fn)
      handlers.push({ layer, fn })
      requestAnimationFrame(() => layer.redraw())
    })

    // Don't block playback forever on a bad tile
    const safety = window.setTimeout(() => onBuffer(true, 1), 5000)

    // Keep tile cache warm when panning / zooming
    let panTimer: number | null = null
    const warm = () => {
      if (panTimer) window.clearTimeout(panTimer)
      panTimer = window.setTimeout(() => {
        layers.forEach((l) => l.redraw())
      }, 120)
    }
    map.on('moveend', warm)
    map.on('zoomend', warm)

    return () => {
      window.clearTimeout(safety)
      if (panTimer) window.clearTimeout(panTimer)
      cancelFade()
      map.off('moveend', warm)
      map.off('zoomend', warm)
      handlers.forEach(({ layer, fn }) => layer.off('load', fn))
      layers.forEach((l) => map.removeLayer(l))
      layersRef.current = []
    }
    // Only rebuild when stack config changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey, map, frames, host, color, smooth, snow, cancelFade, showOnly, onBuffer])

  useEffect(() => {
    const layers = layersRef.current
    if (!layers.length) return
    const active = layers[activeRef.current]
    // Only set when not mid-fade
    if (active && rafRef.current == null) {
      active.setOpacity(opacity)
    }
  }, [opacity])

  useEffect(() => {
    if (!layersRef.current.length) return
    fadeTo(frameIdx)
  }, [frameIdx, fadeTo])

  return null
}

function CoverageLayer({ host, show }: { host: string; show: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (!show) return
    const layer = L.tileLayer(coverageTileUrl(host), {
      opacity: 0.25,
      zIndex: 150,
      maxZoom: 12,
      maxNativeZoom: 7,
      className: 'coverage-tiles',
    })
    layer.addTo(map)
    return () => {
      map.removeLayer(layer)
    }
  }, [host, show, map])
  return null
}

/** RainViewer satellite IR when frames exist */
function SatelliteLayer({
  host,
  frame,
  opacity,
}: {
  host: string
  frame: RadarFrame | null
  opacity: number
}) {
  const map = useMap()

  useEffect(() => {
    if (!frame) return
    const layer = L.tileLayer(satelliteTileUrl(host, frame.path), {
      opacity,
      zIndex: 180,
      maxZoom: 12,
      maxNativeZoom: 7,
      className: 'satellite-tiles',
      attribution: 'Satellite &copy; RainViewer',
    })
    layer.addTo(map)
    return () => {
      map.removeLayer(layer)
    }
  }, [host, frame, map, opacity])

  return null
}

/** NASA GIBS IR fallback when RainViewer satellite list is empty */
function GibsInfraredLayer({ show, opacity }: { show: boolean; opacity: number }) {
  const map = useMap()
  useEffect(() => {
    if (!show) return
    const layer = L.tileLayer(gibsInfraredTileUrl(), {
      opacity,
      zIndex: 175,
      maxZoom: 9,
      maxNativeZoom: 7,
      className: 'satellite-tiles gibs-ir',
      attribution: gibsInfraredAttribution(),
      crossOrigin: true,
    })
    layer.addTo(map)
    return () => {
      map.removeLayer(layer)
    }
  }, [show, opacity, map])
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
  const [maps, setMaps] = useState<RadarMaps | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [frameIdx, setFrameIdx] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState<SpeedKey>('normal')
  const [opacity, setOpacity] = useState(0.78)
  const [product, setProduct] = useState<RadarProduct>('precip')
  const [color, setColor] = useState<ColorScheme>(6)
  const [basemap, setBasemap] = useState<Basemap>('dark')
  const [smooth, setSmooth] = useState(true)
  const [snow, setSnow] = useState(true)
  const [showCoverage, setShowCoverage] = useState(false)
  const [showRadar, setShowRadar] = useState(true)
  const [showSatellite, setShowSatellite] = useState(false)
  const [showFires, setShowFires] = useState(false)
  const [showSmoke, setShowSmoke] = useState(false)
  const [overlay, setOverlay] = useState<OverlayMode>('none')
  const [fullscreen, setFullscreen] = useState(false)
  const [bufferReady, setBufferReady] = useState(false)
  const [bufferProgress, setBufferProgress] = useState(0)
  const [mobileFocus, setMobileFocus] = useState(false)
  const wrapRef = useRef<HTMLElement>(null)

  // Mobile: taller radar stage by default
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)')
    const apply = () => setMobileFocus(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const radarFrames = useMemo(() => (maps ? getAllFrames(maps) : []), [maps])
  const satFrames = useMemo(() => (maps ? getSatelliteFrames(maps) : []), [maps])
  const host = maps?.host ?? 'https://tilecache.rainviewer.com'
  const pastCount = maps?.radar?.past?.length ?? 0
  const currentFrame = radarFrames[frameIdx] ?? null
  const satFrame = satFrames.length
    ? satFrames[Math.min(frameIdx, satFrames.length - 1)]
    : null
  const useGibsSat = showSatellite && !satFrame
  const fadeDuration = fadeMs(speed)

  // Satellite-only with no RainViewer frames: still allow “ready” playback UI
  useEffect(() => {
    if (showRadar && radarFrames.length) return
    if (showSatellite && (satFrame || useGibsSat)) {
      setBufferReady(true)
      setBufferProgress(1)
    }
  }, [showRadar, showSatellite, radarFrames.length, satFrame, useGibsSat])

  const onBuffer = useCallback((ready: boolean, progress: number) => {
    setBufferReady(ready)
    setBufferProgress(progress)
  }, [])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setBufferReady(false)
      setBufferProgress(0)
      const data = await fetchRadarMaps()
      setMaps(data)
      const all = getAllFrames(data)
      const pastLen = data.radar?.past?.length ?? all.length
      setFrameIdx(Math.max(0, pastLen - 1))
      setError(null)
    } catch {
      setError('Could not load radar tiles')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [load])

  // Video-style loop: hold each frame, longer hold on last, then restart
  useEffect(() => {
    const canLoopRadar = showRadar && radarFrames.length >= 2 && bufferReady
    const canLoopSat = !showRadar && showSatellite && satFrames.length >= 2
    if (!playing || (!canLoopRadar && !canLoopSat)) return

    const len = canLoopRadar ? radarFrames.length : satFrames.length
    const isLast = frameIdx >= len - 1
    const wait = isLast ? SPEED_MS[speed] + LOOP_HOLD_MS : SPEED_MS[speed]
    const timer = window.setTimeout(() => {
      setFrameIdx((i) => (i + 1) % len)
    }, wait)

    return () => window.clearTimeout(timer)
  }, [
    playing,
    radarFrames.length,
    satFrames.length,
    speed,
    bufferReady,
    frameIdx,
    showRadar,
    showSatellite,
  ])

  // Apply radar product presets (color / snow / sat combo)
  useEffect(() => {
    const s = productSettings(product)
    setColor(s.color)
    setSmooth(s.smooth)
    setSnow(s.snow)
    setShowRadar(s.showRadar)
    setShowSatellite(s.showSatellite)
  }, [product])

  // Severe mode: auto-play + slightly higher opacity
  useEffect(() => {
    if (severeMode) {
      setPlaying(true)
      setProduct('storm')
      setOpacity((o) => Math.max(o, 0.82))
    }
  }, [severeMode])

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

  const base = BASEMAPS[basemap]
  const isNowcast = frameIdx >= pastCount
  const timeLabel = currentFrame
    ? `${formatRadarTime(currentFrame.time)}${isNowcast ? ' (forecast)' : ''}`
    : '—'

  const showBufferOverlay = Boolean(maps && showRadar && radarFrames.length && !bufferReady)

  return (
    <section
      id={mapId}
      className={`panel radar-panel ${fullscreen ? 'is-fullscreen' : ''} ${pageMode ? 'radar-page-mode' : ''} ${severeMode ? 'severe-radar' : ''} ${mobileFocus && !pageMode ? 'radar-mobile-focus' : ''}`}
      ref={wrapRef}
    >
      <div className="panel-header radar-header">
        <div>
          <h2>Live Weather Radar</h2>
          <p className="radar-sub">
            Multi-product radar · satellite · fire/smoke · model overlays
            {mobileFocus ? ' · mobile focus' : ''}
          </p>
        </div>
        <div className="radar-header-actions">
          <button type="button" className="chip-btn" onClick={() => void load()} title="Refresh">
            ↻ Refresh
          </button>
          {!pageMode && (
            <button
              type="button"
              className="chip-btn radar-fs-btn"
              onClick={() => void toggleFullscreen()}
            >
              {fullscreen ? '⤓ Exit' : '⤢ Fullscreen'}
            </button>
          )}
        </div>
      </div>

      <div className="radar-stage">
        {loading && !maps && (
          <div className="radar-overlay-msg">
            <div className="spinner" />
            Loading high-resolution radar…
          </div>
        )}
        {error && !maps && (
          <div className="radar-overlay-msg error">
            {error}
            <button type="button" onClick={() => void load()}>
              Retry
            </button>
          </div>
        )}

        {showBufferOverlay && (
          <div className="radar-buffer-bar" aria-live="polite">
            <div className="radar-buffer-track">
              <div
                className="radar-buffer-fill"
                style={{ width: `${Math.round(bufferProgress * 100)}%` }}
              />
            </div>
            <span>Buffering frames… {Math.round(bufferProgress * 100)}%</span>
          </div>
        )}

        <MapContainer
          key={`${mapId}-${lat.toFixed(3)}-${lon.toFixed(3)}`}
          center={[lat, lon]}
          zoom={pageMode ? 6 : 7}
          minZoom={3}
          maxZoom={12}
          className="radar-map"
          zoomControl={true}
          attributionControl={true}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer url={base.url} attribution={base.attr} maxZoom={19} />
          <CoverageLayer host={host} show={showCoverage} />
          {showSatellite && satFrame && (
            <SatelliteLayer
              host={host}
              frame={satFrame}
              opacity={showRadar ? 0.55 : 0.88}
            />
          )}
          {useGibsSat && (
            <GibsInfraredLayer show opacity={showRadar ? 0.5 : 0.85} />
          )}
          {showRadar && radarFrames.length > 0 && (
            <RadarEngine
              host={host}
              frames={radarFrames}
              frameIdx={Math.min(frameIdx, radarFrames.length - 1)}
              color={color}
              opacity={opacity}
              smooth={smooth}
              snow={snow}
              fadeDuration={fadeDuration}
              onBuffer={onBuffer}
            />
          )}
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
                color === 6
                  ? 'linear-gradient(90deg,#00ecec,#01a0f6,#00ff00,#ffff00,#ff9000,#ff0000,#c000c0)'
                  : color === 2
                    ? 'linear-gradient(90deg,#3eb9ff,#0066ff,#00ff88,#ffff00,#ff6600,#ff0066)'
                    : 'linear-gradient(90deg,#88f,#0af,#0f0,#ff0,#f80,#f00,#f0f)',
            }}
          />
          <span>Heavy</span>
        </div>

        <div className="radar-time-badge">
          <span className={`pulse ${playing && bufferReady ? 'on' : ''}`} />
          {timeLabel}
          {isNowcast && <span className="nowcast-tag">NOWCAST</span>}
          <span className="frame-count">
            {radarFrames.length ? `${frameIdx + 1}/${radarFrames.length}` : ''}
          </span>
        </div>
      </div>

      <div className="radar-controls">
        <div className="playback">
          <button
            type="button"
            className="play-btn"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <button
            type="button"
            className="step-btn"
            onClick={() => {
              setPlaying(false)
              setFrameIdx(
                (i) => (i - 1 + radarFrames.length) % Math.max(radarFrames.length, 1),
              )
            }}
            aria-label="Previous frame"
          >
            ‹
          </button>
          <button
            type="button"
            className="step-btn"
            onClick={() => {
              setPlaying(false)
              setFrameIdx((i) => (i + 1) % Math.max(radarFrames.length, 1))
            }}
            aria-label="Next frame"
          >
            ›
          </button>
          <input
            type="range"
            className="timeline"
            min={0}
            max={Math.max(radarFrames.length - 1, 0)}
            value={Math.min(frameIdx, Math.max(radarFrames.length - 1, 0))}
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

        <div className="radar-options">
          <label className="opt">
            Radar product
            <select
              value={product}
              onChange={(e) => setProduct(e.target.value as RadarProduct)}
            >
              {RADAR_PRODUCTS.map((p) => (
                <option key={p.id} value={p.id} title={p.desc}>
                  {p.name}
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
            Colors
            <select
              value={color}
              onChange={(e) => setColor(Number(e.target.value) as ColorScheme)}
            >
              {COLOR_SCHEMES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
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

          <label className="toggle">
            <input
              type="checkbox"
              checked={showRadar}
              onChange={(e) => setShowRadar(e.target.checked)}
            />
            Radar
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showSatellite}
              onChange={(e) => setShowSatellite(e.target.checked)}
              disabled={!satFrames.length}
            />
            Satellite IR{!satFrames.length ? ' (n/a)' : ''}
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
          <label className="toggle">
            <input
              type="checkbox"
              checked={smooth}
              onChange={(e) => setSmooth(e.target.checked)}
            />
            Smooth tiles
          </label>
          <label className="toggle">
            <input type="checkbox" checked={snow} onChange={(e) => setSnow(e.target.checked)} />
            Snow colors
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showCoverage}
              onChange={(e) => setShowCoverage(e.target.checked)}
            />
            Coverage mask
          </label>
        </div>
        <p className="radar-product-hint">
          {RADAR_PRODUCTS.find((p) => p.id === product)?.desc}
          {useGibsSat ? ' · Satellite via NASA GIBS (RainViewer IR offline)' : ''}
          {showFires ? ' · NASA FIRMS hotspots (24h)' : ''}
          {showSmoke ? ' · PM2.5 smoke / haze field' : ''}
        </p>
        {(showSmoke || showFires) && (
          <div className="map-layer-legend" aria-hidden>
            {showSmoke && (
              <span className="legend-smoke">
                Smoke: green=clean → yellow → orange → red=hazardous PM2.5
              </span>
            )}
            {showFires && (
              <span className="legend-fire">Fires: yellow=weak → purple=intense FRP</span>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
