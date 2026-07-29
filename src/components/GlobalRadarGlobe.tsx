import { useCallback, useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  loadGlobalRadarLoop,
  rainViewerTileUrl,
  type RadarFrame,
} from '../api/radar'
import { fetchTropicalGlobeData } from '../api/weather'
import type { TropicalGlobeData, TropicalStorm } from '../api/types'
import { formatRadarTime } from '../utils/format'

const SPEED_MS = { slow: 900, normal: 480, fast: 260 } as const
type SpeedKey = keyof typeof SPEED_MS

const RADAR_A = 'radar-a'
const RADAR_B = 'radar-b'
/** RainViewer mosaic max native zoom (globe overzooms beyond this). */
const RADAR_MAXZOOM = 7

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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
  const trackSvgRef = useRef<SVGSVGElement>(null)
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
  const tropicalDataRef = useRef<TropicalGlobeData | null>(null)
  const showTropicalRef = useRef(true)

  const [loading, setLoading] = useState(true)
  const [loadHint, setLoadHint] = useState('Loading Earth…')
  const [error, setError] = useState<string | null>(null)
  const [frames, setFrames] = useState<RadarFrame[]>([])
  const [frameIdx, setFrameIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<SpeedKey>('normal')
  const [opacity, setOpacity] = useState(0.85)
  const [nowIndex, setNowIndex] = useState(0)
  const [storms, setStorms] = useState<TropicalStorm[]>([])
  const [showTropical, setShowTropical] = useState(true)
  const markersRef = useRef<maplibregl.Marker[]>([])

  opacityRef.current = opacity
  showTropicalRef.current = showTropical

  const clearStormMarkers = useCallback(() => {
    for (const m of markersRef.current) m.remove()
    markersRef.current = []
  }, [])

  /**
   * Draw past/forecast tracks + cones as SVG on top of the canvas.
   * Paths are HTML (like markers) so they never fight WebGL radar layers.
   */
  const redrawTrackOverlay = useCallback(() => {
    const map = mapRef.current
    const svg = trackSvgRef.current
    const data = tropicalDataRef.current
    if (!svg) return
    if (!map || !data || !showTropicalRef.current || !data.storms.length) {
      svg.innerHTML = ''
      svg.style.display = 'none'
      return
    }

    const canvas = map.getCanvas()
    const w = canvas.clientWidth || canvas.width
    const h = canvas.clientHeight || canvas.height
    if (w < 2 || h < 2) return

    svg.style.display = ''
    svg.setAttribute('width', String(w))
    svg.setAttribute('height', String(h))
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`)

    const projectLine = (coords: [number, number][]): string => {
      const parts: string[] = []
      let penDown = false
      for (const [lon, lat] of coords) {
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
          penDown = false
          continue
        }
        const p = map.project([lon, lat])
        // Skip points far outside the viewport (behind globe / off-screen)
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
          penDown = false
          continue
        }
        if (p.x < -w || p.x > w * 2 || p.y < -h || p.y > h * 2) {
          penDown = false
          continue
        }
        parts.push(`${penDown ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
        penDown = true
      }
      return parts.join(' ')
    }

    const nodes: string[] = []

    for (const s of data.storms) {
      // Forecast cone (amber)
      const ring =
        s.coneRing ??
        (data.cones?.features
          ?.find((f) => f.properties?.id === s.id || f.properties?.name === s.name)
          ?.geometry?.coordinates as [number, number][][] | undefined)?.[0]
      if (ring && ring.length >= 3) {
        const d = projectLine(ring as [number, number][])
        if (d.includes('L')) {
          nodes.push(
            `<path class="globe-svg-cone" d="${d} Z" />`,
            `<path class="globe-svg-cone-stroke" d="${d} Z" fill="none" />`,
          )
        }
      }

      // Past path (white)
      const pastSegs: [number, number][][] =
        s.pastTrackSegments?.length
          ? s.pastTrackSegments
          : s.pastTrack && s.pastTrack.length >= 2
            ? [s.pastTrack]
            : []
      for (const seg of pastSegs) {
        const d = projectLine(seg)
        if (d.includes('L')) {
          nodes.push(`<path class="globe-svg-past-glow" d="${d}" fill="none" />`)
          nodes.push(`<path class="globe-svg-past" d="${d}" fill="none" />`)
        }
      }

      // Forecast path (pink dashed)
      if (s.track && s.track.length >= 2) {
        const d = projectLine(s.track)
        if (d.includes('L')) {
          nodes.push(`<path class="globe-svg-fcst-glow" d="${d}" fill="none" />`)
          nodes.push(`<path class="globe-svg-fcst" d="${d}" fill="none" />`)
        }
      }

      // Forecast advisory points
      if (s.forecastPoints?.length) {
        for (const pt of s.forecastPoints) {
          const p = map.project([pt.lon, pt.lat])
          if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
          if (p.x < 0 || p.x > w || p.y < 0 || p.y > h) continue
          nodes.push(
            `<circle class="globe-svg-fcst-pt" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" />`,
          )
        }
      }
    }

    // Also draw any FeatureCollection tracks not mirrored on storms (safety net)
    for (const f of data.tracks?.features ?? []) {
      if (f.geometry?.type === 'LineString' && Array.isArray(f.geometry.coordinates)) {
        const name = String(f.properties?.name ?? '')
        if (data.storms.some((s) => s.name === name && (s.track?.length ?? 0) >= 2)) continue
        const d = projectLine(f.geometry.coordinates as [number, number][])
        if (d.includes('L')) {
          nodes.push(`<path class="globe-svg-fcst" d="${d}" fill="none" />`)
        }
      }
    }

    svg.innerHTML = nodes.join('')
  }, [])

  /** Storm markers + SVG tracks only — no WebGL tropical layers (those buried radar). */
  const applyTropicalLayers = useCallback(
    (map: MapLibreMap, data: TropicalGlobeData, visible: boolean) => {
      tropicalDataRef.current = data
      showTropicalRef.current = visible

      clearStormMarkers()
      if (!visible) {
        redrawTrackOverlay()
        return
      }

      for (const s of data.storms) {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'globe-storm-marker'
        const isHu = /hurricane|major/i.test(s.classification)
        el.innerHTML = `<span class="globe-storm-dot ${isHu ? 'is-hu' : ''}"></span><span class="globe-storm-label">${escapeHtml(s.name)} · ${escapeHtml(s.classification)}</span>`
        el.title = [
          s.name,
          s.classification,
          s.intensity,
          s.movement ? `Moving ${s.movement}` : '',
          s.pressure ? `${s.pressure} mb` : '',
          s.track && s.track.length > 1 ? 'Forecast track shown' : '',
          s.pastTrack && s.pastTrack.length > 1 ? 'Past path shown' : '',
        ]
          .filter(Boolean)
          .join(' · ')
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          map.flyTo({ center: [s.lon, s.lat], zoom: Math.max(map.getZoom(), 3.2), essential: true })
        })
        const marker = new maplibregl.Marker({ element: el, anchor: 'left' })
          .setLngLat([s.lon, s.lat])
          .addTo(map)
        markersRef.current.push(marker)
      }

      redrawTrackOverlay()
    },
    [clearStormMarkers, redrawTrackOverlay],
  )

  /** Keep active radar layer above basemap + labels so precip is never buried. */
  const raiseRadarLayers = useCallback((map: MapLibreMap) => {
    for (const id of [RADAR_A, RADAR_B]) {
      if (map.getLayer(id)) {
        try {
          map.moveLayer(id)
        } catch {
          /* ignore */
        }
      }
    }
  }, [])

  /**
   * Swap radar frame using dual buffers.
   * removeSource/addSource is more reliable than setTiles on MapLibre globe.
   * Layer sits on TOP of the style stack (SVG storm paths are HTML above the canvas).
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
      if (!url.includes('{z}')) {
        console.warn('[globe] bad radar tile url', url)
        return
      }

      const nextBuf: 0 | 1 = bufRef.current === 0 ? 1 : 0
      const nextId = nextBuf === 0 ? RADAR_A : RADAR_B
      const prevId = bufRef.current === 0 ? RADAR_A : RADAR_B

      try {
        // Replace next buffer with this frame's tiles
        if (map.getLayer(nextId)) map.removeLayer(nextId)
        if (map.getSource(nextId)) map.removeSource(nextId)

        map.addSource(nextId, {
          type: 'raster',
          tiles: [url],
          tileSize: 256,
          maxzoom: RADAR_MAXZOOM,
          attribution: 'Radar © RainViewer',
        })
        // No beforeId → top of WebGL stack (above basemap + city labels)
        map.addLayer({
          id: nextId,
          type: 'raster',
          source: nextId,
          paint: {
            'raster-opacity': opacityVal,
            'raster-fade-duration': 0,
            'raster-resampling': 'linear',
          },
        })

        // Hide previous buffer (keep source warm for next swap)
        if (map.getLayer(prevId)) {
          map.setPaintProperty(prevId, 'raster-opacity', 0)
        }

        bufRef.current = nextBuf
        raiseRadarLayers(map)
        map.triggerRepaint()
      } catch (e) {
        console.warn('[globe] applyFrame failed', e)
      }
    },
    [raiseRadarLayers],
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
        applyFrame(ni, opacityRef.current)

        setLoadHint('Finishing radar tiles…')
        await waitForIdle(map, 10000)
        if (cancelled) return

        // Re-assert radar after idle (tiles sometimes need a second paint on globe)
        applyFrame(ni, opacityRef.current)

        // Hurricanes / tropical cyclones (NHC) + forecast tracks
        setLoadHint('Loading tropical cyclones…')
        try {
          const tropical = await fetchTropicalGlobeData()
          if (!cancelled && tropical && mapRef.current) {
            setStorms(tropical.storms)
            applyTropicalLayers(mapRef.current, tropical, true)
            // Keep radar on top after storm markers/SVG
            applyFrame(frameIdxRef.current, opacityRef.current)

            // Frame storms so past + forecast paths fit (Pacific EP/CP this season)
            if (tropical.storms.length) {
              const lons = tropical.storms.flatMap((s) => {
                const pts = [
                  s.lon,
                  ...(s.track?.map((c) => c[0]) ?? []),
                  ...(s.pastTrack?.map((c) => c[0]) ?? []),
                ]
                return pts
              })
              const lats = tropical.storms.flatMap((s) => {
                const pts = [
                  s.lat,
                  ...(s.track?.map((c) => c[1]) ?? []),
                  ...(s.pastTrack?.map((c) => c[1]) ?? []),
                ]
                return pts
              })
              if (lons.length && lats.length) {
                const minLon = Math.min(...lons)
                const maxLon = Math.max(...lons)
                const minLat = Math.min(...lats)
                const maxLat = Math.max(...lats)
                const midLon = (minLon + maxLon) / 2
                const midLat = (minLat + maxLat) / 2
                const span = Math.max(maxLon - minLon, maxLat - minLat, 8)
                const z = span > 50 ? 1.5 : span > 25 ? 2.1 : span > 12 ? 2.6 : 3.2
                map.easeTo({
                  center: [midLon, midLat],
                  zoom: z,
                  duration: 1600,
                })
                map.once('moveend', () => {
                  if (cancelled) return
                  applyFrame(frameIdxRef.current, opacityRef.current)
                  redrawTrackOverlay()
                })
              }
            }
          }
        } catch {
          /* tropical optional */
        }
        if (cancelled) return

        setLoading(false)
        // Redraw SVG tracks on camera change only (not every render — that starved radar tiles)
        map.on('move', redrawTrackOverlay)
        map.on('zoom', redrawTrackOverlay)
        map.on('rotate', redrawTrackOverlay)
        map.on('pitch', redrawTrackOverlay)
        map.on('resize', redrawTrackOverlay)
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
      clearStormMarkers()
      try {
        map.off('move', redrawTrackOverlay)
        map.off('zoom', redrawTrackOverlay)
        map.off('rotate', redrawTrackOverlay)
        map.off('pitch', redrawTrackOverlay)
        map.off('resize', redrawTrackOverlay)
      } catch {
        /* ignore */
      }
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

  // Toggle tropical SVG + markers (radar always stays)
  useEffect(() => {
    showTropicalRef.current = showTropical
    for (const m of markersRef.current) {
      const el = m.getElement()
      if (el) el.style.display = showTropical ? '' : 'none'
    }
    redrawTrackOverlay()
  }, [showTropical, redrawTrackOverlay])

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
      {/* SVG tracks sit above the WebGL canvas — globe GeoJSON lines are unreliable */}
      <svg
        ref={trackSvgRef}
        className="globe-track-svg"
        aria-hidden="true"
        style={{ display: 'none' }}
      />

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

      {storms.length > 0 && (
        <div className="globe-storm-panel" role="region" aria-label="Active tropical cyclones">
          <div className="globe-storm-panel-head">
            <strong>🌀 Active storms</strong>
            <button
              type="button"
              className={`chip-btn ${showTropical ? 'active' : ''}`}
              onClick={() => setShowTropical((v) => !v)}
              aria-pressed={showTropical}
            >
              {showTropical ? 'Hide tracks' : 'Show tracks'}
            </button>
          </div>
          <ul className="globe-storm-list">
            {storms.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="globe-storm-card"
                  onClick={() => {
                    mapRef.current?.flyTo({
                      center: [s.lon, s.lat],
                      zoom: 3.4,
                      essential: true,
                    })
                  }}
                >
                  <span className="globe-storm-card-name">
                    {s.name}
                    <em>{s.classification}</em>
                  </span>
                  <span className="globe-storm-card-meta">
                    {[s.intensity, s.movement, s.pressure ? `${s.pressure} mb` : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  {(s.track && s.track.length > 1) || (s.pastTrack && s.pastTrack.length > 1) ? (
                    <span className="globe-storm-card-track">
                      {[
                        s.pastTrack && s.pastTrack.length > 1 ? 'Past path' : null,
                        s.track && s.track.length > 1 ? 'Forecast track' : null,
                      ]
                        .filter(Boolean)
                        .join(' + ')}{' '}
                      on map
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
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
          Drag to rotate · scroll / pinch to zoom · radar stays on
          {storms.length
            ? ` · ${storms.length} storm${storms.length > 1 ? 's' : ''}: white = past path, pink dashed = forecast`
            : ' · no active NHC tropical cyclones'}
        </p>
      </div>
    </div>
  )
}
