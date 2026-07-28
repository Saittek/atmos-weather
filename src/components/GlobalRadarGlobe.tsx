import { useCallback, useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  loadGlobalRadarLoop,
  rainViewerTileUrl,
  type RadarFrame,
} from '../api/radar'
import { formatRadarTime } from '../utils/format'

const SPEED_MS = { slow: 900, normal: 480, fast: 260 } as const
type SpeedKey = keyof typeof SPEED_MS

const RADAR_A = 'radar-a'
const RADAR_B = 'radar-b'

/** Stable dark world basemap (standard XYZ) — loads cleanly on globe */
function buildStyle() {
  return {
    version: 8 as const,
    name: 'Solara Globe',
    sources: {
      basemap: {
        type: 'raster' as const,
        tiles: [
          'https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
          'https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
          'https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
        ],
        tileSize: 256,
        attribution: '© OpenStreetMap · © CARTO',
        // Low maxzoom = whole-world tiles stay in cache; less re-render thrash
        maxzoom: 6,
      },
      labels: {
        type: 'raster' as const,
        tiles: [
          'https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png',
          'https://b.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png',
        ],
        tileSize: 256,
        attribution: '© CARTO',
        maxzoom: 6,
      },
    },
    layers: [
      {
        id: 'basemap',
        type: 'raster' as const,
        source: 'basemap',
        paint: {
          'raster-opacity': 1,
          'raster-fade-duration': 0,
        },
      },
      {
        id: 'labels',
        type: 'raster' as const,
        source: 'labels',
        paint: {
          'raster-opacity': 0.75,
          'raster-fade-duration': 0,
        },
      },
    ],
  }
}

function waitForIdle(map: MapLibreMap, timeoutMs = 12000): Promise<void> {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      map.off('idle', onIdle)
      window.clearTimeout(timer)
      resolve()
    }
    const onIdle = () => finish()
    const timer = window.setTimeout(finish, timeoutMs)
    // Already idle?
    map.once('idle', onIdle)
    // Nudge a repaint so idle fires after tiles settle
    try {
      map.triggerRepaint()
    } catch {
      /* ignore */
    }
  })
}

export function GlobalRadarGlobe() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const playingRef = useRef(false)
  const frameIdxRef = useRef(0)
  const framesRef = useRef<RadarFrame[]>([])
  const hostRef = useRef('https://tilecache.rainviewer.com')
  const opacityRef = useRef(0.85)
  const timerRef = useRef<number | null>(null)
  /** Which radar buffer is currently visible: 0 = A, 1 = B */
  const bufRef = useRef<0 | 1>(0)
  const readyRef = useRef(false)

  const [loading, setLoading] = useState(true)
  const [loadHint, setLoadHint] = useState('Loading Earth…')
  const [error, setError] = useState<string | null>(null)
  const [frames, setFrames] = useState<RadarFrame[]>([])
  const [frameIdx, setFrameIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<SpeedKey>('normal')
  const [opacity, setOpacity] = useState(0.85)
  const [nowIndex, setNowIndex] = useState(0)

  opacityRef.current = opacity

  const ensureRadarBuffers = useCallback((map: MapLibreMap) => {
    for (const id of [RADAR_A, RADAR_B]) {
      if (!map.getSource(id)) {
        // Placeholder 1x1 transparent — replaced before first show
        map.addSource(id, {
          type: 'raster',
          tiles: [
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          ],
          tileSize: 256,
          maxzoom: 7,
          attribution: 'Radar © RainViewer',
        })
      }
      if (!map.getLayer(id)) {
        map.addLayer(
          {
            id,
            type: 'raster',
            source: id,
            paint: {
              'raster-opacity': 0,
              'raster-fade-duration': 0,
              'raster-resampling': 'linear',
            },
          },
          'labels',
        )
      }
    }
  }, [])

  /**
   * Swap radar frame using dual buffers.
   * removeSource/addSource is more reliable than setTiles on MapLibre globe.
   */
  const applyFrame = useCallback(
    (idx: number, op?: number) => {
      const map = mapRef.current
      const list = framesRef.current
      if (!map || !readyRef.current || !list.length) return
      if (!map.isStyleLoaded()) return

      const frame = list[Math.max(0, Math.min(idx, list.length - 1))]
      if (!frame) return

      const opacityVal = op ?? opacityRef.current
      const url = rainViewerTileUrl(hostRef.current, frame.key)
      const nextBuf: 0 | 1 = bufRef.current === 0 ? 1 : 0
      const nextId = nextBuf === 0 ? RADAR_A : RADAR_B
      const prevId = bufRef.current === 0 ? RADAR_A : RADAR_B

      try {
        ensureRadarBuffers(map)

        // Replace next buffer source with new frame tiles
        if (map.getLayer(nextId)) map.removeLayer(nextId)
        if (map.getSource(nextId)) map.removeSource(nextId)

        map.addSource(nextId, {
          type: 'raster',
          tiles: [url],
          tileSize: 256,
          maxzoom: 7,
          attribution: 'Radar © RainViewer',
        })
        map.addLayer(
          {
            id: nextId,
            type: 'raster',
            source: nextId,
            paint: {
              'raster-opacity': opacityVal,
              'raster-fade-duration': 0,
              'raster-resampling': 'linear',
            },
          },
          'labels',
        )

        // Hide previous buffer
        if (map.getLayer(prevId)) {
          map.setPaintProperty(prevId, 'raster-opacity', 0)
        }

        bufRef.current = nextBuf
      } catch (e) {
        console.warn('[globe] applyFrame failed', e)
      }
    },
    [ensureRadarBuffers],
  )

  const stopLoop = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startLoop = useCallback(() => {
    stopLoop()
    timerRef.current = window.setInterval(() => {
      if (!playingRef.current || !framesRef.current.length) return
      const next = (frameIdxRef.current + 1) % framesRef.current.length
      frameIdxRef.current = next
      setFrameIdx(next)
      applyFrame(next)
    }, SPEED_MS[speed])
  }, [applyFrame, speed, stopLoop])

  // Init map + fully load world, then radar
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let cancelled = false

    const map = new maplibregl.Map({
      container: el,
      style: buildStyle(),
      center: [0, 15],
      zoom: 1.15,
      minZoom: 0.5,
      maxZoom: 5.5,
      pitch: 0,
      bearing: 0,
      // Keep whole-world tiles warm
      maxTileCacheSize: 600,
      fadeDuration: 0,
      refreshExpiredTiles: false,
      attributionControl: { compact: true },
      dragRotate: true,
      touchPitch: false,
      renderWorldCopies: false,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right')

    const boot = async () => {
      try {
        setLoadHint('Building globe…')
        await new Promise<void>((resolve) => {
          if (map.isStyleLoaded()) resolve()
          else map.once('load', () => resolve())
        })
        if (cancelled) return

        try {
          map.setProjection({ type: 'globe' })
        } catch {
          /* flat fallback */
        }
        try {
          map.setSky({
            'sky-color': '#020617',
            'sky-horizon-blend': 0.5,
            'horizon-color': '#0f172a',
            'horizon-fog-blend': 0.35,
            'fog-color': '#020617',
            'fog-ground-blend': 0.15,
          })
        } catch {
          /* optional */
        }

        // Settle camera so full sphere is in view, then wait for basemap tiles
        map.jumpTo({ center: [0, 15], zoom: 1.15, bearing: 0, pitch: 0 })
        setLoadHint('Loading world map…')
        await waitForIdle(map, 14000)
        if (cancelled) return

        setLoadHint('Loading global radar…')
        const { host, frames: fr, nowIndex: ni } = await loadGlobalRadarLoop({ maxPast: 12 })
        if (cancelled) return

        if (!fr.length) {
          setError('No radar frames available')
          setLoading(false)
          return
        }

        hostRef.current = host
        framesRef.current = fr
        frameIdxRef.current = ni
        setFrames(fr)
        setNowIndex(ni)
        setFrameIdx(ni)

        readyRef.current = true
        ensureRadarBuffers(map)
        applyFrame(ni, opacityRef.current)

        setLoadHint('Finishing radar tiles…')
        await waitForIdle(map, 10000)
        if (cancelled) return

        setLoading(false)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load Earth radar')
        setLoading(false)
      }
    }

    void boot()

    return () => {
      cancelled = true
      readyRef.current = false
      stopLoop()
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, [])

  // Opacity on visible buffer
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const visibleId = bufRef.current === 0 ? RADAR_A : RADAR_B
    if (map.getLayer(visibleId)) {
      map.setPaintProperty(visibleId, 'raster-opacity', opacity)
    }
  }, [opacity])

  // Play / pause
  useEffect(() => {
    playingRef.current = playing
    if (playing) {
      // Advance immediately so user sees motion on first click
      if (framesRef.current.length > 1) {
        const next = (frameIdxRef.current + 1) % framesRef.current.length
        frameIdxRef.current = next
        setFrameIdx(next)
        applyFrame(next)
      }
      startLoop()
    } else {
      stopLoop()
    }
    return () => stopLoop()
  }, [playing, startLoop, stopLoop, applyFrame])

  // Speed change while playing
  useEffect(() => {
    if (playing) startLoop()
  }, [speed, playing, startLoop])

  const goNow = () => {
    setPlaying(false)
    frameIdxRef.current = nowIndex
    setFrameIdx(nowIndex)
    applyFrame(nowIndex)
  }

  const step = (dir: -1 | 1) => {
    setPlaying(false)
    if (!frames.length) return
    const next = (frameIdxRef.current + dir + frames.length) % frames.length
    frameIdxRef.current = next
    setFrameIdx(next)
    applyFrame(next)
  }

  const frame = frames[frameIdx]
  const isNow = frameIdx === nowIndex
  const isForecast = frameIdx > nowIndex

  return (
    <div className="globe-stage">
      <div ref={containerRef} className="globe-canvas" role="img" aria-label="3D Earth with global radar" />

      {loading && (
        <div className="globe-overlay-msg" role="status">
          <div className="spinner large" />
          <span>{loadHint}</span>
        </div>
      )}
      {error && (
        <div className="globe-overlay-msg error" role="alert">
          <p>{error}</p>
          <button type="button" className="chip-btn" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      )}

      <div className="globe-controls" role="toolbar" aria-label="Radar playback">
        <div className="globe-controls-main">
          <button
            type="button"
            className="chip-btn globe-play-btn"
            onClick={() => setPlaying((p) => !p)}
            disabled={!frames.length || loading}
            title={playing ? 'Pause' : 'Play loop'}
            aria-pressed={playing}
          >
            {playing ? '❚❚ Pause' : '▶ Play'}
          </button>
          <button
            type="button"
            className="chip-btn"
            onClick={() => step(-1)}
            disabled={!frames.length || loading}
            title="Previous frame"
          >
            ‹
          </button>
          <button
            type="button"
            className="chip-btn"
            onClick={() => step(1)}
            disabled={!frames.length || loading}
            title="Next frame"
          >
            ›
          </button>
          <button
            type="button"
            className={`chip-btn ${isNow ? 'active' : ''}`}
            onClick={goNow}
            disabled={!frames.length || loading}
            title="Jump to latest observation"
          >
            Now
          </button>
          <label className="globe-speed">
            <span className="sr-only">Speed</span>
            <select
              value={speed}
              onChange={(e) => setSpeed(e.target.value as SpeedKey)}
              aria-label="Playback speed"
            >
              <option value="slow">Slow</option>
              <option value="normal">Normal</option>
              <option value="fast">Fast</option>
            </select>
          </label>
        </div>
        <div className="globe-controls-meta">
          <span className="globe-time">
            {frame ? formatRadarTime(frame.time) : '—'}
            {isNow && <em> · now</em>}
            {isForecast && <em> · forecast</em>}
          </span>
          <label className="globe-opacity">
            Opacity
            <input
              type="range"
              min={0.35}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
            />
          </label>
        </div>
        <p className="globe-hint">
          Drag to rotate · scroll / pinch to zoom · global radar (RainViewer)
        </p>
      </div>
    </div>
  )
}
