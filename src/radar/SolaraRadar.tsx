/**
 * Solara HD Radar — MapLibre GL rebuild (replaces Leaflet RadarMap).
 * Auto product · 512px RainViewer · ECCC WMS · IEM NEXRAD · glass chrome.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './solara-radar.css'
import {
  RADAR_SOURCES,
  defaultSourceForLocation,
  fetchRainViewerMaps,
  getMapboxToken,
  getSourceMeta,
  isCanadaRadarRegion,
  isNexradMosaicRegion,
  loadFrames,
  primaryTileUrl,
  type RadarFrame,
  type RadarSourceId,
} from '../api/radar'
import {
  fetchSpcStormReports,
  fetchStormWarnings,
  type StormReport,
  type StormWarning,
} from '../api/severeLayers'
import { fetchFiresNear, type FireHotspot } from '../api/fires'
import type { LocationResult } from '../api/types'
import type { Units } from '../utils/format'
import { formatRadarTime } from '../utils/format'
import { useI18n } from '../i18n/I18nProvider'
import { isConstrainedDevice } from '../utils/device'

export interface MapFocusRequest {
  lat: number
  lon: number
  zoom?: number
  /** Optional identity so repeated focuses re-trigger fly */
  token?: number | string
}

export interface SolaraRadarProps {
  lat: number
  lon: number
  placeName: string
  units: Units
  severeMode?: boolean
  mapId?: string
  pageMode?: boolean
  chaserOverlays?: boolean
  initialSource?: RadarSourceId
  focusRequest?: MapFocusRequest | null
  threatPolygons?: StormWarning[] | null
  homeLocation?: LocationResult | null
}

type SpeedKey = 'slow' | 'normal' | 'fast'
type BasemapId = 'dark' | 'street' | 'sat'

const HOLD_MS: Record<SpeedKey, number> = { slow: 720, normal: 400, fast: 180 }
const FADE_MS: Record<SpeedKey, number> = { slow: 320, normal: 220, fast: 140 }

const BASEMAPS: Record<BasemapId, { name: string; tiles: string[]; attr: string }> = {
  dark: {
    name: 'Dark',
    tiles: ['https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'],
    attr: '© OSM © CARTO',
  },
  street: {
    name: 'Street',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attr: '© OpenStreetMap',
  },
  sat: {
    name: 'Satellite',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
    attr: '© Esri',
  },
}

function expandCarto(tiles: string[]): string[] {
  // MapLibre needs concrete subdomains
  return tiles.flatMap((t) =>
    t.includes('{s}')
      ? ['a', 'b', 'c', 'd'].map((s) => t.replace('{s}', s).replace('{r}', ''))
      : [t],
  )
}

function basemapStyle(id: BasemapId, mapboxToken: string | null): maplibregl.StyleSpecification {
  if (mapboxToken && id === 'dark') {
    return {
      version: 8,
      sources: {
        basemap: {
          type: 'raster',
          tiles: [
            `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/512/{z}/{x}/{y}@2x?access_token=${encodeURIComponent(mapboxToken)}`,
          ],
          tileSize: 512,
          attribution: '© Mapbox © OpenStreetMap',
        },
      },
      layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
    }
  }
  const b = BASEMAPS[id]
  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles: expandCarto(b.tiles),
        tileSize: 256,
        attribution: b.attr,
      },
    },
    layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
  }
}

const RADAR_A = 'solara-radar-a'
const RADAR_B = 'solara-radar-b'
const LAYER_A = 'solara-radar-layer-a'
const LAYER_B = 'solara-radar-layer-b'

function ensureRadarSources(map: MapLibreMap, tileSize: number) {
  for (const id of [RADAR_A, RADAR_B]) {
    if (!map.getSource(id)) {
      map.addSource(id, {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/0/0/0.png'],
        tileSize,
        attribution: 'Radar',
        maxzoom: 12,
      })
    }
  }
  if (!map.getLayer(LAYER_A)) {
    map.addLayer({
      id: LAYER_A,
      type: 'raster',
      source: RADAR_A,
      paint: { 'raster-opacity': 0.82, 'raster-fade-duration': 0 },
    })
  }
  if (!map.getLayer(LAYER_B)) {
    map.addLayer({
      id: LAYER_B,
      type: 'raster',
      source: RADAR_B,
      paint: { 'raster-opacity': 0, 'raster-fade-duration': 0 },
    })
  }
}

function setRasterTiles(map: MapLibreMap, sourceId: string, tileUrl: string, tileSize: number) {
  const src = map.getSource(sourceId) as { setTiles?: (t: string[]) => void } | undefined
  if (src && typeof src.setTiles === 'function') {
    src.setTiles([tileUrl])
    return
  }
  const layerId = sourceId === RADAR_A ? LAYER_A : LAYER_B
  if (map.getLayer(layerId)) map.removeLayer(layerId)
  if (map.getSource(sourceId)) map.removeSource(sourceId)
  map.addSource(sourceId, {
    type: 'raster',
    tiles: [tileUrl],
    tileSize,
    maxzoom: 12,
  })
  map.addLayer({
    id: layerId,
    type: 'raster',
    source: sourceId,
    paint: { 'raster-opacity': sourceId === RADAR_A ? 0.82 : 0, 'raster-fade-duration': 0 },
  })
}

export function SolaraRadar({
  lat,
  lon,
  placeName,
  units: _units,
  severeMode = false,
  mapId = 'solara-radar',
  pageMode = false,
  chaserOverlays = false,
  initialSource,
  focusRequest = null,
  homeLocation = null,
}: SolaraRadarProps) {
  void _units
  const { te } = useI18n()
  const lite = useMemo(() => isConstrainedDevice(), [])
  const hd = !lite
  const mapboxToken = useMemo(() => getMapboxToken(), [])
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const activeBuf = useRef<'a' | 'b'>('a')
  const wantPlay = useRef(false)
  const playTimer = useRef<number | null>(null)

  const [product, setProduct] = useState<RadarSourceId>(
    () => initialSource ?? defaultSourceForLocation(lat, lon),
  )
  const [frames, setFrames] = useState<RadarFrame[]>([])
  const [frameIdx, setFrameIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<SpeedKey>(lite ? 'slow' : 'normal')
  const [opacity, setOpacity] = useState(0.84)
  const [basemap, setBasemap] = useState<BasemapId>('dark')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rvHost, setRvHost] = useState('https://tilecache.rainviewer.com')
  const [fullscreen, setFullscreen] = useState(false)
  const [inView, setInView] = useState(true)
  const [showFires, setShowFires] = useState(false)
  const [showWarn, setShowWarn] = useState(chaserOverlays || severeMode)
  const [showReports, setShowReports] = useState(chaserOverlays || severeMode)
  const wrapRef = useRef<HTMLElement>(null)

  const meta = getSourceMeta(product)
  const frame = frames[frameIdx] ?? null
  const tileSize = hd ? 512 : 256

  const tileUrl = useMemo(
    () => primaryTileUrl(product, frame, rvHost, { hd }),
    [product, frame, rvHost, hd],
  )

  // IntersectionObserver — pause when off-screen
  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([e]) => setInView(e.isIntersecting && e.intersectionRatio > 0.12),
      { threshold: [0, 0.12, 0.5] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Init MapLibre
  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return

    const map = new maplibregl.Map({
      container: el,
      style: basemapStyle(basemap, mapboxToken),
      center: [lon, lat],
      zoom: pageMode ? 6.2 : 7.1,
      attributionControl: { compact: true },
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      fadeDuration: 0,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    map.on('load', () => {
      ensureRadarSources(map, tileSize)
      // Place marker
      if (!map.getSource('place')) {
        map.addSource('place', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { name: placeName },
                geometry: { type: 'Point', coordinates: [lon, lat] },
              },
            ],
          },
        })
        map.addLayer({
          id: 'place-glow',
          type: 'circle',
          source: 'place',
          paint: {
            'circle-radius': 14,
            'circle-color': '#38bdf8',
            'circle-opacity': 0.22,
            'circle-blur': 0.6,
          },
        })
        map.addLayer({
          id: 'place-dot',
          type: 'circle',
          source: 'place',
          paint: {
            'circle-radius': 6,
            'circle-color': '#7dd3fc',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#0f172a',
          },
        })
      }
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, [])

  // Fly to place when coords change
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.easeTo({ center: [lon, lat], duration: 600 })
    const src = map.getSource('place') as GeoJSONSource | undefined
    src?.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: placeName },
          geometry: { type: 'Point', coordinates: [lon, lat] },
        },
      ],
    })
  }, [lat, lon, placeName])

  // Home marker
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const id = 'home-place'
    if (!homeLocation) {
      if (map.getLayer('home-dot')) map.removeLayer('home-dot')
      if (map.getSource(id)) map.removeSource(id)
      return
    }
    const data: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: homeLocation.name || 'Home' },
          geometry: {
            type: 'Point',
            coordinates: [homeLocation.longitude, homeLocation.latitude],
          },
        },
      ],
    }
    if (map.getSource(id)) {
      ;(map.getSource(id) as GeoJSONSource).setData(data)
    } else {
      map.addSource(id, { type: 'geojson', data })
      map.addLayer({
        id: 'home-dot',
        type: 'circle',
        source: id,
        paint: {
          'circle-radius': 7,
          'circle-color': '#fbbf24',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#0f172a',
        },
      })
    }
  }, [homeLocation])

  // Focus request (chase)
  useEffect(() => {
    if (!focusRequest || !mapRef.current) return
    mapRef.current.flyTo({
      center: [focusRequest.lon, focusRequest.lat],
      zoom: focusRequest.zoom ?? 8,
      duration: 900,
    })
  }, [focusRequest])

  // Basemap switch
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const style = basemapStyle(basemap, mapboxToken)
    map.setStyle(style)
    map.once('style.load', () => {
      ensureRadarSources(map, tileSize)
      // re-apply current radar tiles after style reset
      if (tileUrl) {
        setRasterTiles(map, RADAR_A, tileUrl, tileSize)
        map.setPaintProperty(LAYER_A, 'raster-opacity', opacity)
      }
    })
  }, [basemap, mapboxToken, tileSize]) // eslint-disable-line react-hooks/exhaustive-deps

  // Product default when place moves
  useEffect(() => {
    setProduct((prev) => {
      if (
        prev === 'storm_chaser' ||
        prev === 'global_loop' ||
        prev === 'mapbox_radar' ||
        prev === 'eccc_radar' ||
        prev === 'us_nexrad_loop'
      ) {
        return initialSource ?? defaultSourceForLocation(lat, lon)
      }
      return prev
    })
  }, [lat, lon, initialSource])

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const needsRv =
        product === 'global_loop' ||
        product === 'mapbox_radar' ||
        (product === 'storm_chaser' &&
          !isCanadaRadarRegion(lat, lon) &&
          !isNexradMosaicRegion(lat, lon))
      if (needsRv) {
        try {
          const maps = await fetchRainViewerMaps()
          setRvHost(maps.host || 'https://tilecache.rainviewer.com')
        } catch {
          /* continue */
        }
      }
      const next = await loadFrames(product, { lite, lat, lon })
      if (!next.length) throw new Error(te('radar.noFrames'))
      setFrames(next)
      setFrameIdx(next.length - 1)
    } catch (e) {
      setFrames([])
      setError(e instanceof Error ? e.message : te('radar.failed'))
    } finally {
      setLoading(false)
    }
  }, [product, lite, lat, lon, te])

  useEffect(() => {
    void reload()
  }, [reload])

  // Refresh frames periodically
  useEffect(() => {
    const mins = playing ? (lite ? 5 : 4) : lite ? 12 : 8
    const id = window.setInterval(() => {
      if (document.hidden || !inView) return
      void reload()
    }, mins * 60_000)
    return () => window.clearInterval(id)
  }, [reload, playing, lite, inView])

  // Apply frame tiles with crossfade
  useEffect(() => {
    const map = mapRef.current
    if (!map || !tileUrl || !map.isStyleLoaded()) return
    ensureRadarSources(map, tileSize)

    const nextBuf = activeBuf.current === 'a' ? 'b' : 'a'
    const nextSrc = nextBuf === 'a' ? RADAR_A : RADAR_B
    const nextLayer = nextBuf === 'a' ? LAYER_A : LAYER_B
    const prevLayer = activeBuf.current === 'a' ? LAYER_A : LAYER_B

    setRasterTiles(map, nextSrc, tileUrl, tileSize)
    map.setPaintProperty(nextLayer, 'raster-opacity', 0)
    map.setPaintProperty(prevLayer, 'raster-opacity', opacity)

    const fade = FADE_MS[speed]
    const t0 = performance.now()
    let raf = 0
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / fade)
      map.setPaintProperty(nextLayer, 'raster-opacity', opacity * p)
      map.setPaintProperty(prevLayer, 'raster-opacity', opacity * (1 - p))
      if (p < 1) raf = requestAnimationFrame(step)
      else {
        map.setPaintProperty(prevLayer, 'raster-opacity', 0)
        map.setPaintProperty(nextLayer, 'raster-opacity', opacity)
        activeBuf.current = nextBuf
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [tileUrl, tileSize, opacity, speed])

  // Opacity live update
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const layer = activeBuf.current === 'a' ? LAYER_A : LAYER_B
    try {
      map.setPaintProperty(layer, 'raster-opacity', opacity)
    } catch {
      /* style mid-swap */
    }
  }, [opacity])

  // Playback
  useEffect(() => {
    if (playTimer.current) {
      window.clearInterval(playTimer.current)
      playTimer.current = null
    }
    const run = playing && inView && !document.hidden && frames.length > 1
    if (!run) return
    playTimer.current = window.setInterval(() => {
      setFrameIdx((i) => (i + 1) % frames.length)
    }, HOLD_MS[speed] + FADE_MS[speed])
    return () => {
      if (playTimer.current) window.clearInterval(playTimer.current)
    }
  }, [playing, inView, frames.length, speed])

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) setPlaying(false)
      else if (wantPlay.current && inView) setPlaying(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [inView])

  // Severe + fires GeoJSON
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const applyCollection = (
      sourceId: string,
      layerId: string,
      data: GeoJSON.FeatureCollection,
      paint: Record<string, unknown>,
      type: 'circle' | 'fill' | 'line',
    ) => {
      if (!map.isStyleLoaded()) return
      if (map.getSource(sourceId)) {
        ;(map.getSource(sourceId) as GeoJSONSource).setData(data)
      } else {
        map.addSource(sourceId, { type: 'geojson', data })
        if (type === 'fill') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          map.addLayer({
            id: layerId,
            type: 'fill',
            source: sourceId,
            paint,
          } as any)
          map.addLayer({
            id: `${layerId}-line`,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': '#f87171',
              'line-width': 1.5,
              'line-opacity': 0.85,
            },
          })
        } else if (type === 'circle') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          map.addLayer({
            id: layerId,
            type: 'circle',
            source: sourceId,
            paint,
          } as any)
        }
      }
    }

    let cancelled = false
    const run = async () => {
      if (showWarn) {
        try {
          const warns = await fetchStormWarnings()
          if (cancelled) return
          const fc: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: (warns as StormWarning[])
              .filter((w) => w.geometry)
              .map((w) => ({
                type: 'Feature' as const,
                properties: {
                  event: w.label,
                  severity: w.significance,
                  headline: w.label,
                },
                geometry: w.geometry as GeoJSON.Geometry,
              })),
          }
          applyCollection(
            'severe-warn',
            'severe-warn-fill',
            fc,
            {
              'fill-color': '#f87171',
              'fill-opacity': 0.18,
            },
            'fill',
          )
        } catch {
          /* soft */
        }
      } else if (map.getLayer('severe-warn-fill')) {
        map.removeLayer('severe-warn-fill')
        if (map.getLayer('severe-warn-fill-line')) map.removeLayer('severe-warn-fill-line')
        if (map.getSource('severe-warn')) map.removeSource('severe-warn')
      }

      if (showReports) {
        try {
          const reports = await fetchSpcStormReports()
          if (cancelled) return
          // Keep reports near the view (~5°)
          const near = (reports as StormReport[]).filter(
            (r) => Math.abs(r.lat - lat) < 5 && Math.abs(r.lon - lon) < 5,
          )
          const fc: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: near.map((r) => ({
              type: 'Feature' as const,
              properties: { type: r.kind, remark: r.magnitude },
              geometry: {
                type: 'Point',
                coordinates: [r.lon, r.lat],
              },
            })),
          }
          applyCollection(
            'severe-reports',
            'severe-reports-dot',
            fc,
            {
              'circle-radius': 5,
              'circle-color': '#fbbf24',
              'circle-stroke-width': 1,
              'circle-stroke-color': '#0f172a',
            },
            'circle',
          )
        } catch {
          /* soft */
        }
      } else if (map.getLayer('severe-reports-dot')) {
        map.removeLayer('severe-reports-dot')
        if (map.getSource('severe-reports')) map.removeSource('severe-reports')
      }

      if (showFires) {
        try {
          const fires = await fetchFiresNear(lat, lon, 3.5, 200)
          if (cancelled) return
          const list = Array.isArray(fires) ? fires : []
          const fc: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: (list as FireHotspot[])
              .filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lon))
              .slice(0, 400)
              .map((f) => ({
                type: 'Feature' as const,
                properties: { bright: f.brightness },
                geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
              })),
          }
          applyCollection(
            'firms-fires',
            'firms-fires-dot',
            fc,
            {
              'circle-radius': 4,
              'circle-color': '#fb923c',
              'circle-opacity': 0.85,
              'circle-stroke-width': 0.5,
              'circle-stroke-color': '#7c2d12',
            },
            'circle',
          )
        } catch {
          /* soft */
        }
      } else if (map.getLayer('firms-fires-dot')) {
        map.removeLayer('firms-fires-dot')
        if (map.getSource('firms-fires')) map.removeSource('firms-fires')
      }
    }

    if (map.isStyleLoaded()) void run()
    else map.once('load', () => void run())
    return () => {
      cancelled = true
    }
  }, [showWarn, showReports, showFires, lat, lon])

  const togglePlay = () => {
    setPlaying((p) => {
      const next = !p
      wantPlay.current = next
      return next
    })
  }

  const timeLabel = frame
    ? formatRadarTime(frame.time)
    : loading
      ? te('radar.loadingName', { name: meta.name })
      : '—'

  return (
    <section
      ref={wrapRef as React.RefObject<HTMLElement>}
      className={`panel radar-panel solara-radar ${pageMode ? 'is-page radar-page-mode' : 'is-compact radar-compact'} ${fullscreen ? 'is-fullscreen' : ''}`}
      id={mapId}
    >
      <div className="sr-stage">
        <div ref={containerRef} className="sr-map" role="img" aria-label={`Radar for ${placeName}`} />

        <div className="sr-legend" aria-hidden>
          <div className="sr-legend-bar" />
          <div className="sr-legend-row">
            <span>Light</span>
            <span>Severe</span>
          </div>
        </div>

        {loading && (
          <div className="sr-status" role="status">
            <div className="spinner large" />
            <span>{te('radar.loadingName', { name: meta.name })}</span>
          </div>
        )}
        {error && !loading && (
          <div className="sr-status is-error" role="alert">
            <span>{error}</span>
            <button type="button" className="primary-btn" onClick={() => void reload()}>
              Retry
            </button>
          </div>
        )}
      </div>

      <div className="sr-dock">
        <div className="sr-row sr-row-main">
          <div className="sr-time">
            {timeLabel}
            {frames.length > 0 && (
              <em>
                {frameIdx + 1}/{frames.length}
              </em>
            )}
            {hd && <span className="sr-hd-badge" style={{ marginLeft: '0.4rem' }}>HD</span>}
          </div>
          <div className="sr-row">
            <button type="button" className="chip-btn" onClick={togglePlay} disabled={frames.length < 2}>
              {playing ? '⏸' : '▶'}
            </button>
            <select
              className="sr-product"
              value={speed}
              onChange={(e) => setSpeed(e.target.value as SpeedKey)}
              aria-label="Playback speed"
            >
              <option value="slow">Slow</option>
              <option value="normal">Normal</option>
              <option value="fast">Fast</option>
            </select>
            <button
              type="button"
              className="chip-btn"
              onClick={() => setFullscreen((f) => !f)}
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {fullscreen ? '↘' : 'Fullscreen'}
            </button>
          </div>
        </div>

        <input
          className="sr-scrub"
          type="range"
          min={0}
          max={Math.max(0, frames.length - 1)}
          value={frameIdx}
          disabled={!frames.length}
          onChange={(e) => {
            wantPlay.current = false
            setPlaying(false)
            setFrameIdx(Number(e.target.value))
          }}
          aria-label={te('radar.timeline')}
        />

        <div className="sr-row">
          <select
            className="sr-product"
            value={product}
            onChange={(e) => setProduct(e.target.value as RadarSourceId)}
            aria-label={te('common.source')}
          >
            {RADAR_SOURCES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            className="sr-product"
            value={basemap}
            onChange={(e) => setBasemap(e.target.value as BasemapId)}
            aria-label="Basemap"
          >
            <option value="dark">Dark</option>
            <option value="street">Street</option>
            <option value="sat">Satellite</option>
          </select>
          <label className="chip-btn" style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
            <span>Opacity</span>
            <input
              type="range"
              min={0.35}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              style={{ width: '4.5rem' }}
            />
          </label>
        </div>

        <div className="sr-layers" role="group" aria-label="Overlays">
          <button
            type="button"
            className={`chip-btn ${showWarn ? 'is-on' : ''}`}
            onClick={() => setShowWarn((v) => !v)}
          >
            {te('radar.warnWatch')}
          </button>
          <button
            type="button"
            className={`chip-btn ${showReports ? 'is-on' : ''}`}
            onClick={() => setShowReports((v) => !v)}
          >
            {te('radar.reports')}
          </button>
          <button
            type="button"
            className={`chip-btn ${showFires ? 'is-on' : ''}`}
            onClick={() => setShowFires((v) => !v)}
          >
            {te('radar.fires')}
          </button>
        </div>
      </div>
    </section>
  )
}

export default SolaraRadar
