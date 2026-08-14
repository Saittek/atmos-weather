/**
 * Solara HD Radar — MapLibre GL (rebuild).
 * Reliable frame apply matches GlobalRadarGlobe: remove source/layer → re-add.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'
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

const RADAR_SRC = 'solara-radar-src'
const RADAR_LYR = 'solara-radar-lyr'

type MapLibreNS = {
  Map: typeof maplibregl.Map
  NavigationControl: typeof maplibregl.NavigationControl
}

function getMapLibre(): MapLibreNS {
  const ns = maplibregl as unknown as MapLibreNS & { default?: MapLibreNS }
  if (typeof ns.Map === 'function') return ns
  if (ns.default && typeof ns.default.Map === 'function') return ns.default
  throw new Error('MapLibre failed to load')
}

function waitForBox(el: HTMLElement, timeoutMs = 2000): Promise<void> {
  if (el.clientWidth > 16 && el.clientHeight > 16) return Promise.resolve()
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      ro?.disconnect()
      window.clearTimeout(timer)
      resolve()
    }
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            if (el.clientWidth > 16 && el.clientHeight > 16) finish()
          })
        : null
    ro?.observe(el)
    const timer = window.setTimeout(finish, timeoutMs)
  })
}

function expandCarto(url: string): string[] {
  if (!url.includes('{s}')) return [url.replace('{r}', '')]
  return ['a', 'b', 'c', 'd'].map((s) => url.replace('{s}', s).replace('{r}', ''))
}

function buildBasemapStyle(
  id: BasemapId,
  mapboxToken: string | null,
): StyleSpecification {
  if (mapboxToken && id === 'dark') {
    return {
      version: 8,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {
        basemap: {
          type: 'raster',
          tiles: [
            `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${encodeURIComponent(mapboxToken)}`,
          ],
          tileSize: 256,
          attribution: '© Mapbox © OpenStreetMap',
        },
      },
      layers: [
        {
          id: 'bg',
          type: 'background',
          paint: { 'background-color': '#0a0e18' },
        },
        { id: 'basemap', type: 'raster', source: 'basemap', minzoom: 0, maxzoom: 22 },
      ],
    }
  }

  const catalog: Record<BasemapId, { tiles: string[]; attr: string }> = {
    dark: {
      tiles: expandCarto('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'),
      attr: '© OSM © CARTO',
    },
    street: {
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      attr: '© OpenStreetMap',
    },
    sat: {
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      attr: '© Esri',
    },
  }
  const b = catalog[id]
  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      basemap: {
        type: 'raster',
        tiles: b.tiles,
        tileSize: 256,
        attribution: b.attr,
      },
    },
    layers: [
      {
        id: 'bg',
        type: 'background',
        paint: { 'background-color': '#0a0e18' },
      },
      { id: 'basemap', type: 'raster', source: 'basemap', minzoom: 0, maxzoom: 22 },
    ],
  }
}

/** Same pattern as GlobalRadarGlobe — tear down + rebuild radar source each frame. */
function applyRadarFrame(
  map: MapLibreMap,
  tileUrl: string | null,
  opacity: number,
  tileSize: number,
) {
  try {
    if (map.getLayer(RADAR_LYR)) map.removeLayer(RADAR_LYR)
    if (map.getSource(RADAR_SRC)) map.removeSource(RADAR_SRC)
  } catch {
    /* ignore */
  }
  if (!tileUrl) return

  try {
    map.addSource(RADAR_SRC, {
      type: 'raster',
      tiles: [tileUrl],
      tileSize,
      maxzoom: 12,
      attribution: 'Radar',
    })
    map.addLayer({
      id: RADAR_LYR,
      type: 'raster',
      source: RADAR_SRC,
      paint: {
        'raster-opacity': opacity,
        'raster-fade-duration': 0,
        'raster-resampling': 'linear',
      },
    })
  } catch (e) {
    console.warn('[radar] apply frame', e)
  }
}

function addPlaceMarker(map: MapLibreMap, lon: number, lat: number, placeName: string) {
  try {
    if (map.getSource('place')) return
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
  } catch (e) {
    console.warn('[radar] place marker', e)
  }
}

function upsertGeoJson(
  map: MapLibreMap,
  sourceId: string,
  layerId: string,
  data: GeoJSON.FeatureCollection,
  kind: 'fill' | 'circle',
  paint: Record<string, unknown>,
) {
  if (!map.isStyleLoaded()) return
  const existing = map.getSource(sourceId) as GeoJSONSource | undefined
  if (existing) {
    existing.setData(data)
    return
  }
  map.addSource(sourceId, { type: 'geojson', data })
  if (kind === 'fill') {
    map.addLayer({
      id: layerId,
      type: 'fill',
      source: sourceId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      paint: paint as any,
    })
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
  } else {
    map.addLayer({
      id: layerId,
      type: 'circle',
      source: sourceId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      paint: paint as any,
    })
  }
}

function removeOverlay(map: MapLibreMap, sourceId: string, layerId: string) {
  try {
    if (map.getLayer(`${layerId}-line`)) map.removeLayer(`${layerId}-line`)
    if (map.getLayer(layerId)) map.removeLayer(layerId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)
  } catch {
    /* ignore */
  }
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

  const wrapRef = useRef<HTMLElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const mapReadyRef = useRef(false)
  const basemapInitRef = useRef(true)
  const wantPlay = useRef(false)
  const playTimer = useRef<number | null>(null)
  const tileUrlRef = useRef<string | null>(null)
  const opacityRef = useRef(0.84)

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
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [showFires, setShowFires] = useState(false)
  const [showWarn, setShowWarn] = useState(chaserOverlays || severeMode)
  const [showReports, setShowReports] = useState(chaserOverlays || severeMode)

  const meta = getSourceMeta(product)
  const frame = frames[frameIdx] ?? null
  const tileSize = hd ? 512 : 256

  const tileUrl = useMemo(
    () => primaryTileUrl(product, frame, rvHost, { hd }),
    [product, frame, rvHost, hd],
  )
  tileUrlRef.current = tileUrl
  opacityRef.current = opacity

  // Visibility
  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([e]) => setInView(e.isIntersecting && e.intersectionRatio > 0.08),
      { threshold: [0, 0.08, 0.4] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Create map once — wait for a real box so MapLibre does not boot at 0×0
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let cancelled = false
    let map: MapLibreMap | null = null
    let ro: ResizeObserver | null = null
    const stage = el.parentElement

    const bumpSize = (m: MapLibreMap) => {
      try {
        m.resize()
      } catch {
        /* ignore */
      }
    }

    const start = async () => {
      await waitForBox(el)
      if (cancelled) return

      let ML: MapLibreNS
      try {
        ML = getMapLibre()
      } catch (e) {
        setMapError(e instanceof Error ? e.message : 'Map engine failed')
        return
      }

      try {
        map = new ML.Map({
          container: el,
          style: buildBasemapStyle('dark', mapboxToken),
          center: [lon, lat],
          zoom: pageMode ? 6.2 : 7.1,
          attributionControl: { compact: true },
          maxPitch: 0,
          dragRotate: false,
          pitchWithRotate: false,
          fadeDuration: 0,
          renderWorldCopies: true,
        })
      } catch (e) {
        setMapError(e instanceof Error ? e.message : 'Could not start the map')
        return
      }

      if (cancelled) {
        map.remove()
        return
      }

      map.addControl(new ML.NavigationControl({ showCompass: false }), 'top-right')
      mapRef.current = map
      setMapError(null)

      const onReady = () => {
        if (cancelled || !map) return
        mapReadyRef.current = true
        setMapReady(true)
        bumpSize(map)
        addPlaceMarker(map, lon, lat, placeName)
        applyRadarFrame(map, tileUrlRef.current, opacityRef.current, tileSize)
      }

      if (map.loaded()) onReady()
      else map.once('load', onReady)
      map.once('idle', () => {
        if (map && !mapReadyRef.current) onReady()
        else if (map) bumpSize(map)
      })

      ro =
        typeof ResizeObserver !== 'undefined'
          ? new ResizeObserver(() => {
              if (map) bumpSize(map)
            })
          : null
      ro?.observe(el)
      if (stage && stage !== el) ro?.observe(stage)

      map.on('error', (e) => {
        console.warn('[radar] map error', e?.error || e)
      })

      window.requestAnimationFrame(() => map && bumpSize(map))
      window.setTimeout(() => map && bumpSize(map), 120)
      window.setTimeout(() => map && bumpSize(map), 400)
    }

    void start()

    return () => {
      cancelled = true
      ro?.disconnect()
      mapReadyRef.current = false
      try {
        map?.remove()
      } catch {
        /* ignore */
      }
      mapRef.current = null
      setMapReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- create once
  }, [])

  // Resize when layout changes — never skip just because IO said "out of view"
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const t = window.setTimeout(() => {
      try {
        map.resize()
      } catch {
        /* ignore */
      }
    }, 80)
    return () => window.clearTimeout(t)
  }, [inView, fullscreen, pageMode, mapReady])

  // Camera + place marker
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReadyRef.current) return
    map.easeTo({ center: [lon, lat], duration: 500 })
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
  }, [lat, lon, placeName, mapReady])

  // Home marker
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const id = 'home-place'
    if (!homeLocation) {
      removeOverlay(map, id, 'home-dot')
      return
    }
    upsertGeoJson(
      map,
      id,
      'home-dot',
      {
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
      },
      'circle',
      {
        'circle-radius': 7,
        'circle-color': '#fbbf24',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#0f172a',
      },
    )
  }, [homeLocation, mapReady])

  // Chase focus
  useEffect(() => {
    if (!focusRequest || !mapRef.current) return
    mapRef.current.flyTo({
      center: [focusRequest.lon, focusRequest.lat],
      zoom: focusRequest.zoom ?? 8,
      duration: 900,
    })
  }, [focusRequest])

  // Basemap change (skip first paint — map already created with dark)
  useEffect(() => {
    if (basemapInitRef.current) {
      basemapInitRef.current = false
      return
    }
    const map = mapRef.current
    if (!map) return
    mapReadyRef.current = false
    setMapReady(false)
    map.setStyle(buildBasemapStyle(basemap, mapboxToken))
    map.once('style.load', () => {
      mapReadyRef.current = true
      setMapReady(true)
      map.resize()
      applyRadarFrame(map, tileUrlRef.current, opacityRef.current, tileSize)
      addPlaceMarker(map, lon, lat, placeName)
    })
  }, [basemap, mapboxToken, tileSize, placeName, lat, lon])

  // Auto product when place changes
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
          !isNexradMosaicRegion(lat, lon)) ||
        // storm_chaser in US uses IEM but also RV for labels — always warm host for global fallback
        product === 'storm_chaser'

      if (needsRv) {
        try {
          const maps = await fetchRainViewerMaps()
          setRvHost(maps.host || 'https://tilecache.rainviewer.com')
        } catch {
          /* ECCC/IEM may still work */
        }
      }

      const next = await loadFrames(product, { lite, lat, lon })
      if (!next.length) throw new Error(te('radar.noFrames'))
      setFrames(next)
      setFrameIdx(Math.max(0, next.length - 1))
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

  // Periodic refresh
  useEffect(() => {
    const mins = playing ? (lite ? 5 : 4) : lite ? 12 : 8
    const id = window.setInterval(() => {
      if (document.hidden || !inView) return
      void reload()
    }, mins * 60_000)
    return () => window.clearInterval(id)
  }, [reload, playing, lite, inView])

  // Apply radar tiles whenever frame/url ready and map is ready
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    applyRadarFrame(map, tileUrl, opacity, tileSize)
  }, [tileUrl, opacity, tileSize, mapReady])

  // Playback
  useEffect(() => {
    if (playTimer.current) {
      window.clearInterval(playTimer.current)
      playTimer.current = null
    }
    if (!(playing && inView && !document.hidden && frames.length > 1)) return
    playTimer.current = window.setInterval(() => {
      setFrameIdx((i) => (i + 1) % frames.length)
    }, HOLD_MS[speed])
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

  // Overlays
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    let cancelled = false

    const run = async () => {
      if (showWarn) {
        try {
          const warns = await fetchStormWarnings()
          if (cancelled || !mapRef.current) return
          const fc: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: warns
              .filter((w) => w.geometry)
              .slice(0, 200)
              .map((w) => ({
                type: 'Feature' as const,
                properties: { label: w.label },
                geometry: w.geometry as GeoJSON.Geometry,
              })),
          }
          upsertGeoJson(map, 'severe-warn', 'severe-warn-fill', fc, 'fill', {
            'fill-color': '#f87171',
            'fill-opacity': 0.16,
          })
        } catch {
          /* soft */
        }
      } else {
        removeOverlay(map, 'severe-warn', 'severe-warn-fill')
      }

      if (showReports) {
        try {
          const reports = await fetchSpcStormReports()
          if (cancelled || !mapRef.current) return
          const near = reports.filter(
            (r) => Math.abs(r.lat - lat) < 6 && Math.abs(r.lon - lon) < 6,
          )
          const fc: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: near.map((r: StormReport) => ({
              type: 'Feature' as const,
              properties: { kind: r.kind },
              geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
            })),
          }
          upsertGeoJson(map, 'severe-reports', 'severe-reports-dot', fc, 'circle', {
            'circle-radius': 5,
            'circle-color': '#fbbf24',
            'circle-stroke-width': 1,
            'circle-stroke-color': '#0f172a',
          })
        } catch {
          /* soft */
        }
      } else {
        removeOverlay(map, 'severe-reports', 'severe-reports-dot')
      }

      if (showFires) {
        try {
          const fires = await fetchFiresNear(lat, lon, 3.5, 200)
          if (cancelled || !mapRef.current) return
          const fc: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: fires
              .filter((f: FireHotspot) => Number.isFinite(f.lat) && Number.isFinite(f.lon))
              .map((f) => ({
                type: 'Feature' as const,
                properties: { bright: f.brightness },
                geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
              })),
          }
          upsertGeoJson(map, 'firms-fires', 'firms-fires-dot', fc, 'circle', {
            'circle-radius': 4,
            'circle-color': '#fb923c',
            'circle-opacity': 0.85,
            'circle-stroke-width': 0.5,
            'circle-stroke-color': '#7c2d12',
          })
        } catch {
          /* soft */
        }
      } else {
        removeOverlay(map, 'firms-fires', 'firms-fires-dot')
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [showWarn, showReports, showFires, lat, lon, mapReady])

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
      ref={(n) => {
        wrapRef.current = n
      }}
      className={`panel radar-panel solara-radar ${pageMode ? 'is-page radar-page-mode' : 'is-compact radar-compact'} ${fullscreen ? 'is-fullscreen' : ''}`}
      id={mapId}
    >
      <div className="sr-stage">
        <div
          ref={containerRef}
          className="sr-map"
          role="img"
          aria-label={`Radar for ${placeName}`}
        />

        <div className="sr-legend" aria-hidden>
          <div className="sr-legend-bar" />
          <div className="sr-legend-row">
            <span>Light</span>
            <span>Severe</span>
          </div>
        </div>

        {(loading || !mapReady) && !error && !mapError && (
          <div className="sr-status" role="status">
            <div className="spinner" />
            <span>{te('radar.loadingName', { name: meta.name })}</span>
          </div>
        )}
        {(error || mapError) && !loading && (
          <div className="sr-status is-error" role="alert">
            <span>{mapError || error}</span>
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
            {hd && (
              <span className="sr-hd-badge" style={{ marginLeft: '0.4rem' }}>
                HD
              </span>
            )}
          </div>
          <div className="sr-row">
            <button
              type="button"
              className="chip-btn"
              onClick={togglePlay}
              disabled={frames.length < 2}
            >
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
          <label
            className="chip-btn"
            style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}
          >
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
