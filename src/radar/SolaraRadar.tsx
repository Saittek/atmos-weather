/**
 * Solara HD Radar — MapLibre GL (rebuild).
 * Dual-buffer frames: keep the last radar image up until the next tiles load, then fade.
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
  frameUsesWms,
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

const HOLD_MS: Record<SpeedKey, number> = { slow: 640, normal: 480, fast: 300 }
const FADE_MS: Record<SpeedKey, number> = { slow: 420, normal: 340, fast: 220 }

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (2 - 2 * t) ** 3 / 2
}

function sleep(ms: number, cancelled: () => boolean) {
  return new Promise<void>((resolve) => {
    if (ms <= 0 || cancelled()) {
      resolve()
      return
    }
    const t = window.setTimeout(resolve, ms)
    const poll = window.setInterval(() => {
      if (!cancelled()) return
      window.clearTimeout(t)
      window.clearInterval(poll)
      resolve()
    }, 40)
    window.setTimeout(() => window.clearInterval(poll), ms + 20)
  })
}

const RADAR_BUFS = [
  { src: 'solara-radar-src-0', lyr: 'solara-radar-lyr-0' },
  { src: 'solara-radar-src-1', lyr: 'solara-radar-lyr-1' },
] as const

type RadarBufState = { active: 0 | 1; url: string | null }

type MapLibreNS = {
  Map: typeof maplibregl.Map
  NavigationControl: typeof maplibregl.NavigationControl
  Marker: typeof maplibregl.Marker
}

function radarNativeMaxZoom(product: RadarSourceId, frame: RadarFrame | null): number {
  // WMS is rendered per-view, so keep requesting at high zoom.
  // XYZ mosaics must cap at native z so MapLibre overzooms instead of 404ing.
  if (frameUsesWms(product, frame)) return 14
  return getSourceMeta(product).maxNativeZoom
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

function radarBeforeId(map: MapLibreMap): string | undefined {
  if (map.getLayer('place-glow')) return 'place-glow'
  if (map.getLayer('place-dot')) return 'place-dot'
  if (map.getLayer('home-dot')) return 'home-dot'
  if (map.getLayer('severe-warn-fill')) return 'severe-warn-fill'
  return undefined
}

function dropRadarBuf(map: MapLibreMap, i: 0 | 1) {
  const { src, lyr } = RADAR_BUFS[i]
  try {
    if (map.getLayer(lyr)) map.removeLayer(lyr)
    if (map.getSource(src)) map.removeSource(src)
  } catch {
    /* ignore */
  }
}

function resetRadarBufs(map: MapLibreMap, state: RadarBufState) {
  dropRadarBuf(map, 0)
  dropRadarBuf(map, 1)
  state.active = 0
  state.url = null
}

function waitForSource(map: MapLibreMap, sourceId: string, ms = 900): Promise<void> {
  try {
    if (map.isSourceLoaded(sourceId)) return Promise.resolve()
  } catch {
    /* continue */
  }
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      map.off('sourcedata', onData)
      window.clearTimeout(t)
      resolve()
    }
    const onData = (e: { sourceId?: string }) => {
      if (e.sourceId !== sourceId) return
      try {
        if (map.isSourceLoaded(sourceId)) finish()
      } catch {
        finish()
      }
    }
    map.on('sourcedata', onData)
    const t = window.setTimeout(finish, ms)
  })
}

function addRadarBuf(
  map: MapLibreMap,
  i: 0 | 1,
  tileUrl: string,
  tileSize: number,
  opacity: number,
  maxzoom: number,
) {
  const { src, lyr } = RADAR_BUFS[i]
  dropRadarBuf(map, i)
  map.addSource(src, {
    type: 'raster',
    tiles: [tileUrl],
    tileSize,
    maxzoom,
    attribution: 'Radar',
  })
  map.addLayer(
    {
      id: lyr,
      type: 'raster',
      source: src,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      paint: {
        'raster-opacity': opacity,
        'raster-fade-duration': 0,
        'raster-resampling': 'linear',
        'raster-opacity-transition': { duration: 0, delay: 0 },
      } as any,
    },
    radarBeforeId(map),
  )
}

function setBufOpacity(map: MapLibreMap, i: 0 | 1, opacity: number) {
  const { lyr } = RADAR_BUFS[i]
  if (map.getLayer(lyr)) map.setPaintProperty(lyr, 'raster-opacity', opacity)
}

function crossfadeBufs(
  map: MapLibreMap,
  from: 0 | 1,
  to: 0 | 1,
  opacity: number,
  fadeMs: number,
  stale: () => boolean,
) {
  if (fadeMs <= 0 || from === to) {
    setBufOpacity(map, to, opacity)
    if (from !== to) setBufOpacity(map, from, 0)
    return Promise.resolve()
  }
  const t0 = performance.now()
  return new Promise<void>((resolve) => {
    const step = (now: number) => {
      if (stale()) {
        resolve()
        return
      }
      const t = Math.min(1, (now - t0) / fadeMs)
      const e = easeInOut(t)
      setBufOpacity(map, to, e * opacity)
      setBufOpacity(map, from, (1 - e) * opacity)
      if (t < 1) window.requestAnimationFrame(step)
      else resolve()
    }
    window.requestAnimationFrame(step)
  })
}

async function showRadarFrame(
  map: MapLibreMap,
  state: RadarBufState,
  tileUrl: string | null,
  opacity: number,
  tileSize: number,
  maxzoom: number,
  fadeMs: number,
  stale: () => boolean,
) {
  if (!tileUrl) {
    resetRadarBufs(map, state)
    return
  }
  if (state.url === tileUrl) {
    setBufOpacity(map, state.active, opacity)
    return
  }

  const incoming: 0 | 1 = state.url == null ? state.active : ((1 - state.active) as 0 | 1)
  try {
    addRadarBuf(map, incoming, tileUrl, tileSize, incoming === state.active ? opacity : 0, maxzoom)
  } catch (e) {
    console.warn('[radar] add frame', e)
    return
  }
  await waitForSource(map, RADAR_BUFS[incoming].src)
  if (stale() || !map.getLayer(RADAR_BUFS[incoming].lyr)) return

  if (incoming === state.active) {
    setBufOpacity(map, incoming, opacity)
  } else {
    await crossfadeBufs(map, state.active, incoming, opacity, fadeMs, stale)
    if (stale()) return
  }
  state.active = incoming
  state.url = tileUrl
}

const prefetchSeen = new Set<string>()

function lngLatToTile(lon: number, lat: number, z: number) {
  const n = 2 ** z
  const x = Math.floor(((lon + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  )
  return { x, y }
}

function prefetchTemplate(map: MapLibreMap, template: string, maxZ = 7) {
  if (!template.includes('{z}') || !template.includes('{x}')) return
  let z = 1
  let west = -180
  let east = 180
  let north = 85
  let south = -85
  try {
    z = Math.min(maxZ, Math.max(1, Math.round(map.getZoom())))
    const b = map.getBounds()
    west = b.getWest()
    east = b.getEast()
    north = b.getNorth()
    south = b.getSouth()
  } catch {
    return
  }
  const nw = lngLatToTile(west, north, z)
  const se = lngLatToTile(east, south, z)
  const x0 = Math.min(nw.x, se.x) - 1
  const x1 = Math.max(nw.x, se.x) + 1
  const y0 = Math.min(nw.y, se.y) - 1
  const y1 = Math.max(nw.y, se.y) + 1
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const url = template
        .replaceAll('{z}', String(z))
        .replaceAll('{x}', String(x))
        .replaceAll('{y}', String(y))
      if (prefetchSeen.has(url)) continue
      if (prefetchSeen.size > 800) prefetchSeen.clear()
      prefetchSeen.add(url)
      const img = new Image()
      img.decoding = 'async'
      img.src = url
    }
  }
}

function upsertPlacePin(
  map: MapLibreMap,
  ML: MapLibreNS,
  marker: maplibregl.Marker | null,
  lon: number,
  lat: number,
  placeName: string,
): maplibregl.Marker {
  if (marker) {
    marker.setLngLat([lon, lat])
    marker.getElement().title = placeName
    marker.getElement().setAttribute('aria-label', placeName)
    return marker
  }
  const el = document.createElement('div')
  el.className = 'sr-pin'
  el.title = placeName
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', placeName)
  el.innerHTML =
    '<span class="sr-pin-head"></span><span class="sr-pin-point"></span><span class="sr-pin-pulse"></span>'
  return new ML.Marker({ element: el, anchor: 'bottom' }).setLngLat([lon, lat]).addTo(map)
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
  const tileUrlRef = useRef<string | null>(null)
  const opacityRef = useRef(0.84)
  const bufRef = useRef<RadarBufState>({ active: 0, url: null })
  const applyBusyRef = useRef(false)
  const frameIdxRef = useRef(0)
  const playingRef = useRef(false)
  const desiredRef = useRef<{
    url: string | null
    opacity: number
    tileSize: number
    maxzoom: number
  }>({
    url: null,
    opacity: 0.84,
    tileSize: 256,
    maxzoom: 7,
  })
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const mlRef = useRef<MapLibreNS | null>(null)

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
  const radarMaxZ = radarNativeMaxZoom(product, frame)

  const tileUrl = useMemo(
    () => primaryTileUrl(product, frame, rvHost, { hd }),
    [product, frame, rvHost, hd],
  )
  tileUrlRef.current = tileUrl
  opacityRef.current = opacity
  frameIdxRef.current = frameIdx
  playingRef.current = playing

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
          minZoom: 1,
          maxZoom: 18,
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
      mlRef.current = ML
      setMapError(null)

      const onReady = () => {
        if (cancelled || !map) return
        mapReadyRef.current = true
        setMapReady(true)
        bumpSize(map)
        markerRef.current = upsertPlacePin(map, ML, markerRef.current, lon, lat, placeName)
        bufRef.current = { active: 0, url: null }
        void showRadarFrame(
          map,
          bufRef.current,
          tileUrlRef.current,
          opacityRef.current,
          tileSize,
          radarNativeMaxZoom(product, null),
          0,
          () => false,
        )
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
        markerRef.current?.remove()
      } catch {
        /* ignore */
      }
      markerRef.current = null
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

  // Camera + place pin
  useEffect(() => {
    const map = mapRef.current
    const ML = mlRef.current
    if (!map || !ML || !mapReadyRef.current) return
    map.easeTo({ center: [lon, lat], duration: 500 })
    markerRef.current = upsertPlacePin(map, ML, markerRef.current, lon, lat, placeName)
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
      bufRef.current = { active: 0, url: null }
      applyBusyRef.current = false
      if (mlRef.current) {
        markerRef.current = upsertPlacePin(
          map,
          mlRef.current,
          markerRef.current,
          lon,
          lat,
          placeName,
        )
      }
      void showRadarFrame(
        map,
        bufRef.current,
        tileUrlRef.current,
        opacityRef.current,
        tileSize,
        radarNativeMaxZoom(product, null),
        0,
        () => false,
      )
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

  // Scrub / first paint — play loop owns swaps while animating
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || playing) return
    desiredRef.current = { url: tileUrl, opacity, tileSize, maxzoom: radarMaxZ }

    const pump = async () => {
      if (applyBusyRef.current) return
      applyBusyRef.current = true
      try {
        while (true) {
          const want = desiredRef.current
          await showRadarFrame(
            map,
            bufRef.current,
            want.url,
            want.opacity,
            want.tileSize,
            want.maxzoom,
            90,
            () => desiredRef.current.url !== want.url,
          )
          if (desiredRef.current.url === want.url && bufRef.current.url !== want.url) {
            break
          }
          if (
            desiredRef.current.url === want.url &&
            desiredRef.current.opacity === want.opacity
          ) {
            break
          }
        }
      } finally {
        applyBusyRef.current = false
        if (bufRef.current.url !== desiredRef.current.url) {
          void pump()
        }
      }
    }
    void pump()
  }, [tileUrl, opacity, tileSize, radarMaxZ, mapReady, playing])

  // Playback: wait for the next tiles, then ease-in/out crossfade. Never advance early.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    if (!(playing && inView && !document.hidden && frames.length > 1)) return

    let cancelled = false
    const stale = () => cancelled || !playingRef.current

    for (const f of frames) {
      const u = primaryTileUrl(product, f, rvHost, { hd })
      if (u) prefetchTemplate(map, u, radarMaxZ)
    }

    const run = async () => {
      while (!stale()) {
        const list = frames
        if (list.length < 2) return
        const next = (frameIdxRef.current + 1) % list.length
        const url = primaryTileUrl(product, list[next], rvHost, { hd })
        const after = (next + 1) % list.length
        const peek = primaryTileUrl(product, list[after], rvHost, { hd })
        if (peek) prefetchTemplate(map, peek, radarMaxZ)

        const fade = FADE_MS[speed]
        const hold = HOLD_MS[speed]
        const t0 = performance.now()
        await showRadarFrame(
          map,
          bufRef.current,
          url,
          opacityRef.current,
          tileSize,
          radarMaxZ,
          fade,
          stale,
        )
        if (stale()) return
        frameIdxRef.current = next
        setFrameIdx(next)
        const used = performance.now() - t0
        await sleep(Math.max(40, hold - used), stale)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [playing, inView, mapReady, frames, speed, product, rvHost, hd, tileSize, radarMaxZ])

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
