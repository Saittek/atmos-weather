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
import {
  destinationPoint,
  screenToLatLonOrtho,
  solarElevationSin,
  sublunarPoint,
  subsolarPoint,
  terminatorLine,
} from '../utils/sunTerminator'
import { moonPhase } from '../utils/moon'
import { useI18n } from '../i18n/I18nProvider'
import {
  eclipsesToGeoJSON,
  upcomingSolarEclipses,
  type SolarEclipse,
} from '../data/solarEclipses'
import {
  layersForMode,
  loadGlobePrefs,
  saveGlobePrefs,
  type GlobeMode,
} from '../lib/globePrefs'

const SPEED_MS = { slow: 900, normal: 520, fast: 300 } as const
type SpeedKey = keyof typeof SPEED_MS

/** Single radar layer — dual-buffer remove/add was a major source of flicker. */
const RADAR_ID = 'radar-live'
const RADAR_MAXZOOM = 7

/** Solar eclipse path layers (NASA Espenak path tables). */
const ECLIPSE_SOURCE = 'globe-eclipses'
const ECLIPSE_PARTIAL_FILL = 'globe-eclipse-partial-fill'
const ECLIPSE_PARTIAL_LINE = 'globe-eclipse-partial-line'
const ECLIPSE_TOTALITY_FILL = 'globe-eclipse-totality-fill'
const ECLIPSE_TOTALITY_LINE = 'globe-eclipse-totality-line'
const ECLIPSE_CENTER = 'globe-eclipse-centerline'
const ECLIPSE_LAYER_IDS = [
  ECLIPSE_PARTIAL_FILL,
  ECLIPSE_PARTIAL_LINE,
  ECLIPSE_TOTALITY_FILL,
  ECLIPSE_TOTALITY_LINE,
  ECLIPSE_CENTER,
] as const

/** Camera zoom range — high max keeps sharp tiles available when zooming in. */
const GLOBE_MIN_ZOOM = 0.7
const GLOBE_MAX_ZOOM = 6.5
/** Comfortable full-earth view after tile warm-up. */
const GLOBE_WORLD_ZOOM = 1.35
const GLOBE_WORLD_CENTER: [number, number] = [0, 8]
/** Tile cache — high enough for spin, not so large it thrashs memory/GPU. */
const GLOBE_TILE_CACHE = 900

/**
 * Spin: advance every N frames to cut map+overlay work (~half the main-thread cost).
 * Degrees per advance chosen so full rotation stays ~90s at 60fps.
 */
const SPIN_EVERY_N_FRAMES = 2
const SPIN_DEG_PER_TICK = 0.24

/** Day/night paint budget (internal buffer long edge). */
const DN_MAX_EDGE_IDLE = 320
const DN_MAX_EDGE_SPIN = 200
const DN_MAX_EDGE_DRAG = 240

type BasemapId = 'satellite' | 'voyager' | 'light' | 'dark'

type BasemapDef = {
  id: BasemapId
  label: string
  tiles: string[]
  labels?: string[]
  maxzoom: number
  attribution: string
  sky: { sky: string; horizon: string; fog: string }
}

const BASEMAPS: Record<BasemapId, BasemapDef> = {
  satellite: {
    id: 'satellite',
    label: 'Satellite',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
    labels: [
      'https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png',
      'https://b.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png',
    ],
    maxzoom: 14,
    attribution: 'Imagery © Esri · Labels © CARTO',
    sky: { sky: '#0c1a2e', horizon: '#1e3a5f', fog: '#071018' },
  },
  voyager: {
    id: 'voyager',
    label: 'Color',
    tiles: [
      'https://a.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}@2x.png',
      'https://b.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}@2x.png',
      'https://c.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}@2x.png',
    ],
    labels: [
      'https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
      'https://b.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
    ],
    maxzoom: 13,
    attribution: '© OpenStreetMap · © CARTO',
    sky: { sky: '#87b8e8', horizon: '#c5dcf5', fog: '#6a9fd4' },
  },
  light: {
    id: 'light',
    label: 'Light',
    tiles: [
      'https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png',
      'https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png',
    ],
    labels: [
      'https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}@2x.png',
      'https://b.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}@2x.png',
    ],
    maxzoom: 13,
    attribution: '© OpenStreetMap · © CARTO',
    sky: { sky: '#9ec5ea', horizon: '#dbeafe', fog: '#7eb0df' },
  },
  dark: {
    id: 'dark',
    label: 'Dark',
    tiles: [
      'https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
      'https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
    ],
    labels: [
      'https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png',
      'https://b.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png',
    ],
    maxzoom: 13,
    attribution: '© OpenStreetMap · © CARTO',
    sky: { sky: '#020617', horizon: '#0f172a', fog: '#020617' },
  },
}

const REGIONS: { id: string; labelKey: string; center: [number, number]; zoom: number }[] = [
  { id: 'world', labelKey: 'globe.world', center: GLOBE_WORLD_CENTER, zoom: GLOBE_WORLD_ZOOM },
  { id: 'atl', labelKey: 'globe.atlantic', center: [-55, 22], zoom: 2.6 },
  { id: 'epac', labelKey: 'globe.epac', center: [-120, 18], zoom: 2.7 },
  { id: 'cpac', labelKey: 'globe.cpac', center: [-160, 20], zoom: 2.7 },
  { id: 'wpac', labelKey: 'globe.wpac', center: [140, 18], zoom: 2.5 },
  { id: 'nio', labelKey: 'globe.nio', center: [75, 15], zoom: 2.8 },
]

const BASEMAP_LABEL_KEYS: Record<BasemapId, string> = {
  satellite: 'globe.satellite',
  voyager: 'globe.color',
  light: 'globe.light',
  dark: 'globe.dark',
}

interface GlobeProps {
  /** Mission mode from GlobePage segment control */
  missionMode?: GlobeMode
  onMissionModeChange?: (mode: GlobeMode) => void
}

/** Sample longitudes used to pull max-zoom tiles into the cache around the sphere. */
const WARM_LON_SAMPLES = [0, -90, 90, 180, -45, 45, -135, 135]

/** Global IR / cloud tops (NASA GIBS — no API key). */
const GIBS_IR_TILES =
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_Band13_Clean_Infrared/default/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png'
const IR_SOURCE = 'globe-ir'
const IR_LAYER = 'globe-ir-layer'



function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function buildStyle(basemap: BasemapDef) {
  const sources: Record<string, maplibregl.RasterSourceSpecification> = {
    basemap: {
      type: 'raster',
      tiles: basemap.tiles,
      tileSize: 256,
      attribution: basemap.attribution,
      maxzoom: basemap.maxzoom,
    },
  }
  const layers: maplibregl.LayerSpecification[] = [
    {
      id: 'space-bg',
      type: 'background',
      paint: {
        'background-color': '#010208',
        'background-opacity': 0, // starfield canvas shows through
      },
    },
    {
      id: 'basemap',
      type: 'raster',
      source: 'basemap',
      paint: { 'raster-opacity': 1, 'raster-fade-duration': 0 },
    },
  ]
  if (basemap.labels?.length) {
    sources.labels = {
      type: 'raster',
      tiles: basemap.labels,
      tileSize: 256,
      attribution: '© CARTO',
      maxzoom: Math.min(basemap.maxzoom, 12),
    }
    layers.push({
      id: 'labels',
      type: 'raster',
      source: 'labels',
      paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 0 },
    })
  }
  return { version: 8 as const, name: 'Solara Globe', sources, layers }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function normalizeLon(lon: number): number {
  let x = lon
  while (x > 180) x -= 360
  while (x < -180) x += 360
  return x
}

/**
 * True when (lon,lat) is on the front hemisphere of the globe for the current
 * camera center. map.project() still returns coords for the back side — those
 * make hurricane paths jump across the disk while rotating.
 */
/** cos(angular distance) from camera look-at to a lon/lat on the unit sphere. */
function frontCosC(
  lon: number,
  lat: number,
  centerLng: number,
  centerLat: number,
): number {
  const toRad = Math.PI / 180
  const φ1 = centerLat * toRad
  const λ1 = centerLng * toRad
  const φ2 = lat * toRad
  const λ2 = lon * toRad
  return (
    Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1)
  )
}

function isFrontOfGlobe(
  lon: number,
  lat: number,
  centerLng: number,
  centerLat: number,
  /** 0 = horizon; higher hides near-limb points that jitter */
  margin = 0.12,
): boolean {
  return frontCosC(lon, lat, centerLng, centerLat) > margin
}

function smoothstep01(t: number): number {
  const x = Math.max(0, Math.min(1, t))
  return x * x * (3 - 2 * x)
}

/** Deep space around the globe (not atmospheric sky). */
function applySpaceSky(map: MapLibreMap) {
  try {
    map.setSky({
      'sky-color': '#02040c',
      'sky-horizon-blend': 0.08,
      'horizon-color': '#050814',
      'horizon-fog-blend': 0.05,
      'fog-color': '#010208',
      'fog-ground-blend': 0.02,
    })
  } catch {
    /* optional */
  }
  try {
    const m = map as MapLibreMap & { setFog?: (f: Record<string, unknown>) => void }
    m.setFog?.({
      range: [0.8, 12],
      color: 'rgb(2, 4, 12)',
      'high-color': 'rgb(4, 8, 22)',
      'space-color': 'rgb(1, 2, 8)',
      'horizon-blend': 0.04,
      'star-intensity': 0.45,
    })
  } catch {
    /* optional */
  }
}

function waitMs(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms))
}

/**
 * Pull highest-detail basemap tiles into MapLibre's cache by briefly visiting
 * max zoom at sample longitudes, then return to the world view.
 */
async function warmGlobeTiles(
  map: MapLibreMap,
  cancelled: () => boolean,
  onHint?: (s: string) => void,
): Promise<void> {
  const warmZoom = Math.min(map.getMaxZoom(), GLOBE_MAX_ZOOM)
  onHint?.('Loading high-detail Earth…') // caller passes te() when used
  // First: max zoom at home longitude so local tiles fill immediately
  map.jumpTo({ center: GLOBE_WORLD_CENTER, zoom: warmZoom, bearing: 0, pitch: 0 })
  await waitMs(280)
  if (cancelled()) return

  for (let i = 0; i < WARM_LON_SAMPLES.length; i++) {
    if (cancelled()) return
    onHint?.(`Caching Earth tiles ${i + 1}/${WARM_LON_SAMPLES.length}…`)
    map.jumpTo({
      center: [WARM_LON_SAMPLES[i], 8],
      zoom: warmZoom,
      bearing: 0,
      pitch: 0,
    })
    // Let the tile pipeline request + decode a frame of high-zoom imagery
    await waitMs(160)
  }
  if (cancelled()) return

  // Settle on full-earth view — high-zoom tiles remain in maxTileCacheSize
  map.jumpTo({
    center: GLOBE_WORLD_CENTER,
    zoom: GLOBE_WORLD_ZOOM,
    bearing: 0,
    pitch: 0,
  })
  await waitMs(200)
}

export function GlobalRadarGlobe({
  missionMode: missionModeProp,
  onMissionModeChange,
}: GlobeProps = {}) {
  const { te, locale } = useI18n()
  const prefs0 = loadGlobePrefs()
  const modeLayers0 = layersForMode(missionModeProp ?? prefs0.mode)
  const containerRef = useRef<HTMLDivElement>(null)
  const trackSvgRef = useRef<SVGSVGElement>(null)
  const dayNightCanvasRef = useRef<HTMLCanvasElement>(null)
  /** Offscreen buffer for smooth day/night upscale (reused). */
  const dayNightBufRef = useRef<HTMLCanvasElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)

  const framesRef = useRef<RadarFrame[]>([])
  const frameIdxRef = useRef(0)
  const hostRef = useRef('https://tilecache.rainviewer.com')
  const opacityRef = useRef(0.78)
  const showRadarRef = useRef(true)
  const readyRef = useRef(false)
  const tropicalDataRef = useRef<TropicalGlobeData | null>(null)
  const showTropicalRef = useRef(true)
  const showDayNightRef = useRef(true)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const spaceCanvasRef = useRef<HTMLCanvasElement>(null)
  const sunBodyRef = useRef<HTMLDivElement>(null)
  const moonBodyRef = useRef<HTMLDivElement>(null)
  const showBodiesRef = useRef(true)
  const starsRef = useRef<{ x: number; y: number; r: number; a: number }[] | null>(null)

  /** Prevent overlapping radar swaps (main flicker source). */
  const radarBusyRef = useRef(false)
  const radarKeyRef = useRef<string | null>(null)
  const radarQueuedRef = useRef<number | null>(null)

  const playTimerRef = useRef<number | null>(null)
  const spinRafRef = useRef<number | null>(null)
  const spinningRef = useRef(false)
  /** True while user is dragging/zooming — spin pauses longitude so you can still pan. */
  const userInteractingRef = useRef(false)
  const interactEndTimerRef = useRef<number | null>(null)
  const overlayRafRef = useRef<number | null>(null)
  /** Separate throttle for expensive day/night (storms SVG stays more responsive). */
  const dayNightRafRef = useRef<number | null>(null)
  const dayNightLastPaintRef = useRef(0)
  const spinFrameRef = useRef(0)
  const basemapIdRef = useRef<BasemapId>('satellite')
  const swappingBasemapRef = useRef(false)
  const mountedRef = useRef(true)

  const [loading, setLoading] = useState(true)
  const [loadHint, setLoadHint] = useState(() => te('globe.loadingEarth'))
  const [error, setError] = useState<string | null>(null)
  const [frames, setFrames] = useState<RadarFrame[]>([])
  const [frameIdx, setFrameIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<SpeedKey>('normal')
  const [opacity, setOpacity] = useState(prefs0.opacity)
  const [nowIndex, setNowIndex] = useState(0)
  const [storms, setStorms] = useState<TropicalStorm[]>([])
  const [showTropical, setShowTropical] = useState(modeLayers0.showTropical)
  const [showRadar, setShowRadar] = useState(modeLayers0.showRadar)
  const [showLabels, setShowLabels] = useState(prefs0.showLabels)
  // mobile-perf: never start with IR on (extra tile layer + GPU)
  const [showIR, setShowIR] = useState(() => {
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('mobile-perf')) {
      return false
    }
    return prefs0.showIR
  })
  const [showDayNight, setShowDayNight] = useState(modeLayers0.showDayNight)
  /** Real-time Sun + Moon at subsolar / sublunar points */
  const [showBodies, setShowBodies] = useState(modeLayers0.showBodies)
  /** Solar eclipse paths + partial visibility (NASA) */
  const [showEclipses, setShowEclipses] = useState(modeLayers0.showEclipses)
  /** null = all upcoming; else focus one eclipse path */
  const [activeEclipseId, setActiveEclipseId] = useState<string | null>(null)
  const [eclipsePopup, setEclipsePopup] = useState<{
    title: string
    regions: string
    date: string
    maxDuration: string
    kind: string
    nasaUrl: string
    x: number
    y: number
  } | null>(null)
  const [spinning, setSpinning] = useState(
    modeLayers0.spinning && !prefersReducedMotion() ? modeLayers0.spinning : false,
  )
  const [basemapId, setBasemapId] = useState<BasemapId>(prefs0.basemapId)
  const [activeRegion, setActiveRegion] = useState('world')
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [playerMore, setPlayerMore] = useState(false)
  const [mapInteractive, setMapInteractive] = useState(false)
  const [missionMode, setMissionMode] = useState<GlobeMode>(
    missionModeProp ?? prefs0.mode,
  )
  const optionsMenuRef = useRef<HTMLDivElement>(null)
  const showEclipsesRef = useRef(modeLayers0.showEclipses)
  const activeEclipseIdRef = useRef<string | null>(null)

  const upcomingEclipses = upcomingSolarEclipses()

  /** Apply mission mode layer preset */
  const applyMissionMode = useCallback(
    (mode: GlobeMode, opts?: { flyStorms?: boolean; flyEclipse?: boolean }) => {
      const L = layersForMode(mode)
      setMissionMode(mode)
      setShowRadar(L.showRadar)
      setShowDayNight(L.showDayNight)
      setShowBodies(L.showBodies)
      setShowEclipses(L.showEclipses)
      setShowTropical(L.showTropical)
      // Lite presets force IR off; user can re-enable from options
      if (!L.showIR) setShowIR(false)
      if (!prefersReducedMotion()) setSpinning(L.spinning)
      else setSpinning(false)
      saveGlobePrefs({
        mode,
        spinning: L.spinning,
        ...(L.showIR ? {} : { showIR: false }),
      })
      onMissionModeChange?.(mode)
      if (mode === 'eclipse') {
        setActiveEclipseId(null)
        if (opts?.flyEclipse !== false && upcomingSolarEclipses()[0]) {
          /* fly after paint via effect */
        }
      }
      if (mode !== 'eclipse') setEclipsePopup(null)
    },
    [onMissionModeChange],
  )

  // Sync mode from page segment control
  useEffect(() => {
    if (missionModeProp && missionModeProp !== missionMode) {
      applyMissionMode(missionModeProp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- external mode driver
  }, [missionModeProp])

  // Persist a few prefs
  useEffect(() => {
    saveGlobePrefs({
      basemapId,
      showIR,
      showLabels,
      opacity,
      spinning,
    })
  }, [basemapId, showIR, showLabels, opacity, spinning])

  opacityRef.current = opacity
  showRadarRef.current = showRadar
  showTropicalRef.current = showTropical
  showDayNightRef.current = showDayNight
  showBodiesRef.current = showBodies
  showEclipsesRef.current = showEclipses
  activeEclipseIdRef.current = activeEclipseId
  spinningRef.current = spinning
  basemapIdRef.current = basemapId

  const clearStormMarkers = useCallback(() => {
    for (const m of markersRef.current) m.remove()
    markersRef.current = []
  }, [])

  const removeEclipseLayers = useCallback((map: MapLibreMap) => {
    for (const id of ECLIPSE_LAYER_IDS) {
      try {
        if (map.getLayer(id)) map.removeLayer(id)
      } catch {
        /* ignore */
      }
    }
    try {
      if (map.getSource(ECLIPSE_SOURCE)) map.removeSource(ECLIPSE_SOURCE)
    } catch {
      /* ignore */
    }
  }, [])

  /**
   * Draw NASA solar eclipse paths: partial visibility band, path of totality,
   * and central line. Filterable to one event.
   */
  const syncEclipseLayers = useCallback(
    (map: MapLibreMap, visible: boolean, focusId: string | null) => {
      if (swappingBasemapRef.current) return
      try {
        if (!visible) {
          for (const id of ECLIPSE_LAYER_IDS) {
            if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none')
          }
          return
        }

        let list = upcomingSolarEclipses()
        if (focusId) list = list.filter((e) => e.id === focusId)
        const fc = eclipsesToGeoJSON(list)

        if (!map.getSource(ECLIPSE_SOURCE)) {
          map.addSource(ECLIPSE_SOURCE, { type: 'geojson', data: fc })
        } else {
          const src = map.getSource(ECLIPSE_SOURCE) as maplibregl.GeoJSONSource
          src.setData(fc)
        }

        // Insert under labels/radar when possible so paths sit on the basemap
        const before =
          map.getLayer(IR_LAYER) ? IR_LAYER
          : map.getLayer(RADAR_ID) ? RADAR_ID
          : map.getLayer('labels') ? 'labels'
          : undefined

        const add = (layer: maplibregl.LayerSpecification) => {
          if (map.getLayer(layer.id)) {
            map.setLayoutProperty(layer.id, 'visibility', 'visible')
            return
          }
          if (before && map.getLayer(before)) map.addLayer(layer, before)
          else map.addLayer(layer)
        }

        add({
          id: ECLIPSE_PARTIAL_FILL,
          type: 'fill',
          source: ECLIPSE_SOURCE,
          filter: ['==', ['get', 'kind'], 'partial'],
          paint: {
            'fill-color': '#fbbf24',
            'fill-opacity': 0.12,
          },
        })
        add({
          id: ECLIPSE_PARTIAL_LINE,
          type: 'line',
          source: ECLIPSE_SOURCE,
          filter: ['==', ['get', 'kind'], 'partial'],
          paint: {
            'line-color': '#f59e0b',
            'line-width': 1.2,
            'line-opacity': 0.55,
            'line-dasharray': [2, 2],
          },
        })
        add({
          id: ECLIPSE_TOTALITY_FILL,
          type: 'fill',
          source: ECLIPSE_SOURCE,
          filter: ['==', ['get', 'kind'], 'totality'],
          paint: {
            'fill-color': '#ef4444',
            'fill-opacity': 0.42,
          },
        })
        add({
          id: ECLIPSE_TOTALITY_LINE,
          type: 'line',
          source: ECLIPSE_SOURCE,
          filter: ['==', ['get', 'kind'], 'totality'],
          paint: {
            'line-color': '#fca5a5',
            'line-width': 1.8,
            'line-opacity': 0.95,
          },
        })
        add({
          id: ECLIPSE_CENTER,
          type: 'line',
          source: ECLIPSE_SOURCE,
          filter: ['==', ['get', 'kind'], 'centerline'],
          paint: {
            'line-color': '#fef08a',
            'line-width': 2.4,
            'line-opacity': 0.95,
          },
        })
      } catch (e) {
        console.warn('[globe] eclipse layers', e)
      }
    },
    [],
  )

  const flyToEclipse = useCallback(
    (e: SolarEclipse) => {
      const map = mapRef.current
      if (!map || !readyRef.current) return
      setSpinning(false)
      setShowEclipses(true)
      setActiveEclipseId(e.id)
      setActiveRegion('eclipse')
      map.easeTo({
        center: e.focus,
        zoom: e.zoom,
        bearing: 0,
        pitch: 0,
        duration: 1100,
        essential: true,
      })
    },
    [],
  )

  /** Estimate Earth disk center + radius in CSS pixels (same approach as day/night). */
  const earthDiskPx = useCallback((map: MapLibreMap) => {
    const mapCanvas = map.getCanvas()
    const cssW = mapCanvas.clientWidth || 1
    const cssH = mapCanvas.clientHeight || 1
    const center = map.getCenter()
    const cLng = center.lng
    const cLat = center.lat
    const centerPt = map.project([cLng, cLat])
    let Rcss = 0
    for (let b = 0; b < 360; b += 30) {
      const [lon, lat] = destinationPoint(cLng, cLat, 89.2, b)
      if (frontCosC(lon, lat, cLng, cLat) <= -0.05) continue
      const p = map.project([lon, lat])
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
      const d = Math.hypot(p.x - centerPt.x, p.y - centerPt.y)
      if (d > Rcss && d < Math.hypot(cssW, cssH) * 1.15) Rcss = d
    }
    if (Rcss < 12) Rcss = Math.min(cssW, cssH) * 0.42
    return { cx: centerPt.x, cy: centerPt.y, R: Rcss * 1.02, cLng, cLat, cssW, cssH }
  }, [])

  /**
   * Starfield OVER the map (MapLibre canvas is opaque, so underlay never shows).
   * Punch a hole over the Earth disk so stars only fill deep space around the planet.
   */
  const paintStarfield = useCallback(() => {
    const canvas = spaceCanvasRef.current
    const map = mapRef.current
    if (!canvas) return
    const mapCanvas = map?.getCanvas()
    const w = mapCanvas?.clientWidth || canvas.clientWidth || window.innerWidth || 1
    const h = mapCanvas?.clientHeight || canvas.clientHeight || window.innerHeight || 1
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      starsRef.current = null
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    // Soft space wash outside the planet
    const g = ctx.createRadialGradient(w * 0.5, h * 0.45, Math.min(w, h) * 0.15, w * 0.5, h * 0.5, Math.max(w, h) * 0.7)
    g.addColorStop(0, 'rgba(8, 14, 36, 0)')
    g.addColorStop(0.45, 'rgba(4, 8, 22, 0.35)')
    g.addColorStop(1, 'rgba(1, 2, 10, 0.72)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)

    if (!starsRef.current) {
      const n = Math.floor((w * h) / 1400)
      const stars: { x: number; y: number; r: number; a: number }[] = []
      for (let i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() < 0.1 ? 1.5 + Math.random() * 1.4 : 0.45 + Math.random() * 1.0,
          a: 0.45 + Math.random() * 0.55,
        })
      }
      starsRef.current = stars
    }
    for (const s of starsRef.current) {
      ctx.beginPath()
      ctx.fillStyle = `rgba(235, 242, 255, ${s.a})`
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      ctx.fill()
    }

    // Cut out Earth so stars don't sit on continents
    if (map && readyRef.current) {
      try {
        const disk = earthDiskPx(map)
        ctx.save()
        ctx.globalCompositeOperation = 'destination-out'
        ctx.beginPath()
        ctx.arc(disk.cx, disk.cy, disk.R * 0.99, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      } catch {
        /* ignore */
      }
    }
  }, [earthDiskPx])

  /**
   * Place Sun & Moon in space outside the Earth disk, along real sky directions.
   */
  const updateCelestialBodies = useCallback(
    (map: MapLibreMap, date = new Date()) => {
      const sunEl = sunBodyRef.current
      const moonEl = moonBodyRef.current
      if (!sunEl || !moonEl) return

      if (!showBodiesRef.current) {
        sunEl.style.opacity = '0'
        moonEl.style.opacity = '0'
        sunEl.style.visibility = 'hidden'
        moonEl.style.visibility = 'hidden'
        return
      }

      const sun = subsolarPoint(date)
      const moon = sublunarPoint(date)
      const phase = moonPhase(date)
      const disk = earthDiskPx(map)

      const place = (
        el: HTMLDivElement,
        lon: number,
        lat: number,
        spaceMul: number,
        title: string,
        kind: 'sun' | 'moon',
      ) => {
        const cosC = frontCosC(lon, lat, disk.cLng, disk.cLat)
        /**
         * Bodies sit outside Earth at ~spaceMul radii from the center.
         * A surface-limb test (cosC < 0) hides them too early — they should
         * stay visible beside the planet until Earth truly occludes them.
         * Orthographic occlusion for a point at radius f·R:
         *   hide when cosC < −√(1 − 1/f²)
         */
        const f = Math.max(1.05, spaceMul)
        const occludeCos = -Math.sqrt(Math.max(0, 1 - 1 / (f * f)))
        // Small hysteresis so they don't flicker at the threshold
        if (cosC < occludeCos - 0.04) {
          el.style.opacity = '0'
          el.style.visibility = 'hidden'
          return
        }

        // Direction from disk center toward the body on the sphere
        let surf = map.project([lon, lat])
        let dx = surf.x - disk.cx
        let dy = surf.y - disk.cy
        let len = Math.hypot(dx, dy)
        if (len < 8) {
          // Nearly face-on: nudge so we don't stick to the disk center
          const sample = map.project([
            disk.cLng + (((lon - disk.cLng + 540) % 360) - 180) * 0.25,
            disk.cLat + (lat - disk.cLat) * 0.25,
          ])
          const [ol, oa] = destinationPoint(disk.cLng, disk.cLat, 28, 55)
          const mid = map.project([ol, oa])
          dx = sample.x - disk.cx || mid.x - disk.cx
          dy = sample.y - disk.cy || mid.y - disk.cy
          len = Math.hypot(dx, dy) || 1
        }
        const ux = dx / len
        const uy = dy / len
        // Place outside the limb; as the body goes far-side, pull slightly toward the limb
        // so it visually slides behind the planet rather than vanishing mid-space.
        const behind = Math.max(0, -cosC)
        const dist = disk.R * (spaceMul - behind * 0.35)
        const x = disk.cx + ux * dist
        const y = disk.cy + uy * dist
        // Scale: larger when toward camera; soft fade only near true occlusion
        const fade =
          cosC > occludeCos + 0.12
            ? 1
            : Math.max(0.15, (cosC - (occludeCos - 0.04)) / 0.16)
        const scale = 0.72 + 0.5 * Math.max(0, cosC)
        const base = kind === 'sun' ? 72 : 48
        const size = Math.round(base * scale)

        el.style.visibility = 'visible'
        el.style.opacity = String(fade)
        el.style.width = `${size}px`
        el.style.height = `${size}px`
        el.style.transform = `translate3d(${Math.round(x - size / 2)}px, ${Math.round(y - size / 2)}px, 0)`
        // Keep above Earth disk while visible beside it
        el.style.zIndex = cosC > occludeCos + 0.08 ? '8' : '5'
        el.title = title
        el.setAttribute('aria-label', title)
        if (kind === 'moon') {
          el.style.setProperty('--moon-illum', String(phase.illumination / 100))
          el.dataset.waxing = phase.phase < 0.5 ? '1' : '0'
        }
      }

      place(
        sunEl,
        sun.lon,
        sun.lat,
        1.45,
        `Sun · direction ${sun.lat.toFixed(1)}°, ${sun.lon.toFixed(1)}°`,
        'sun',
      )
      place(
        moonEl,
        moon.lon,
        moon.lat,
        1.28,
        `Moon · ${phase.name} · ${moon.lat.toFixed(1)}°, ${moon.lon.toFixed(1)}°`,
        'moon',
      )
    },
    [earthDiskPx],
  )

  /**
   * Fast day/night:
   * - World view: orthographic sphere math (no map.unproject — huge win while spinning)
   * - Zoomed in: sparse unproject only (low buffer, no re-project test)
   */
  const paintDayNight = useCallback((map: MapLibreMap, date = new Date()) => {
    const canvas = dayNightCanvasRef.current
    if (!canvas) return
    const mapCanvas = map.getCanvas()
    const cssW = mapCanvas.clientWidth || mapCanvas.width
    const cssH = mapCanvas.clientHeight || mapCanvas.height
    if (cssW < 2 || cssH < 2) return

    if (!showDayNightRef.current) {
      canvas.style.display = 'none'
      return
    }
    canvas.style.display = ''

    const spinning = spinningRef.current && !userInteractingRef.current
    const dragging = userInteractingRef.current
    const maxEdge = spinning
      ? DN_MAX_EDGE_SPIN
      : dragging
        ? DN_MAX_EDGE_DRAG
        : DN_MAX_EDGE_IDLE
    const scale = Math.min(1, maxEdge / Math.max(cssW, cssH))
    const sw = Math.max(2, Math.round(cssW * scale))
    const sh = Math.max(2, Math.round(cssH * scale))

    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 1.5)
    const outW = Math.round(cssW * dpr)
    const outH = Math.round(cssH * dpr)
    if (canvas.width !== outW || canvas.height !== outH) {
      canvas.width = outW
      canvas.height = outH
    }
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, outW, outH)

    const center = map.getCenter()
    const cLng = center.lng
    const cLat = center.lat
    const zoom = map.getZoom()
    const centerPt = map.project([cLng, cLat])
    const sun = subsolarPoint(date)

    // Estimate disk radius (max of sparse limb samples)
    let Rcss = 0
    for (let b = 0; b < 360; b += 30) {
      const [lon, lat] = destinationPoint(cLng, cLat, 89.2, b)
      if (frontCosC(lon, lat, cLng, cLat) <= -0.05) continue
      const p = map.project([lon, lat])
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
      const d = Math.hypot(p.x - centerPt.x, p.y - centerPt.y)
      if (d > Rcss && d < Math.hypot(cssW, cssH) * 1.15) Rcss = d
    }
    if (Rcss < 12) Rcss = Math.min(cssW, cssH) * 0.42
    Rcss *= 1.015

    // Full-disk on screen → pure math orthographic (fast). Zoomed → unproject path.
    const useOrtho = zoom <= 2.55 && Rcss < Math.max(cssW, cssH) * 0.7

    let buf = dayNightBufRef.current
    if (!buf) {
      buf = document.createElement('canvas')
      dayNightBufRef.current = buf
    }
    if (buf.width !== sw || buf.height !== sh) {
      buf.width = sw
      buf.height = sh
    }
    const bctx = buf.getContext('2d', { alpha: true })
    if (!bctx) return
    const img = bctx.createImageData(sw, sh)
    const data = img.data

    const sx = sw / cssW
    const sy = sh / cssH
    const termSoft = 0.07
    const maxA = 175
    const limbSoft = 0.05

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const cssX = (x + 0.5) / sx
        const cssY = (y + 0.5) / sy
        let lon: number
        let lat: number
        let limbA = 1

        if (useOrtho) {
          const hit = screenToLatLonOrtho(
            cssX,
            cssY,
            centerPt.x,
            centerPt.y,
            Rcss,
            cLng,
            cLat,
          )
          if (!hit) continue
          lon = hit.lon
          lat = hit.lat
          limbA = hit.limb
        } else {
          let ll: { lng: number; lat: number }
          try {
            ll = map.unproject([cssX, cssY])
          } catch {
            continue
          }
          if (!Number.isFinite(ll.lng) || !Number.isFinite(ll.lat)) continue
          const cosC = frontCosC(ll.lng, ll.lat, cLng, cLat)
          if (cosC <= 0) continue
          limbA = cosC >= limbSoft ? 1 : smoothstep01(cosC / limbSoft)
          lon = ll.lng
          lat = ll.lat
        }

        const sinEl = solarElevationSin(lon, lat, sun)
        let nightA = 0
        if (sinEl <= -termSoft) nightA = 1
        else if (sinEl < termSoft) {
          nightA = smoothstep01((termSoft - sinEl) / (2 * termSoft))
        } else continue

        const a = Math.round(maxA * nightA * limbA)
        if (a < 1) continue
        const i = (y * sw + x) * 4
        data[i] = 4
        data[i + 1] = 12
        data[i + 2] = 40
        data[i + 3] = a
      }
    }
    bctx.putImageData(img, 0, 0)

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = spinning ? 'low' : 'high'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.drawImage(buf, 0, 0, sw, sh, 0, 0, cssW, cssH)

    // Terminator stroke (lighter while spinning — no shadow blur)
    const termSamples = spinning ? 96 : 160
    const term = terminatorLine(date, termSamples)
    ctx.strokeStyle = 'rgba(253, 230, 138, 0.9)'
    ctx.lineWidth = 1.75
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    if (!spinning) {
      ctx.shadowColor = 'rgba(251, 191, 36, 0.35)'
      ctx.shadowBlur = 3
    }
    ctx.beginPath()
    let pen = false
    let prevX = 0
    let prevY = 0
    const jumpLim = Math.max(40, Rcss * 0.4)
    for (const [lon, lat] of term) {
      if (frontCosC(lon, lat, cLng, cLat) <= 0.03) {
        pen = false
        continue
      }
      const p = map.project([lon, lat])
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        pen = false
        continue
      }
      if (useOrtho) {
        const d = Math.hypot(p.x - centerPt.x, p.y - centerPt.y)
        if (d > Rcss + 4) {
          pen = false
          continue
        }
      }
      if (pen && Math.hypot(p.x - prevX, p.y - prevY) > jumpLim) pen = false
      if (!pen) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
      pen = true
      prevX = p.x
      prevY = p.y
    }
    ctx.stroke()
    ctx.shadowBlur = 0

    // Sun is drawn as a 3D space body outside Earth — not on the surface.

    dayNightLastPaintRef.current = performance.now()
  }, [])

  /** Throttled day/night — spin ~10–12 fps shade; idle ~full rate on settle. */
  const scheduleDayNight = useCallback(
    (force = false) => {
      if (!showDayNightRef.current) {
        const c = dayNightCanvasRef.current
        if (c) c.style.display = 'none'
        return
      }
      if (dayNightRafRef.current != null && !force) return
      const minGap =
        spinningRef.current && !userInteractingRef.current
          ? 90
          : userInteractingRef.current
            ? 55
            : 28
      const run = () => {
        dayNightRafRef.current = null
        const map = mapRef.current
        if (!map) return
        const now = performance.now()
        if (!force && now - dayNightLastPaintRef.current < minGap) {
          dayNightRafRef.current = window.requestAnimationFrame(run)
          return
        }
        try {
          paintDayNight(map)
        } catch {
          /* ignore */
        }
      }
      dayNightRafRef.current = window.requestAnimationFrame(run)
    },
    [paintDayNight],
  )

  /**
   * Storm SVG overlay (cheap). Day/night is scheduled separately + throttled.
   */
  const scheduleOverlay = useCallback(() => {
    scheduleDayNight(false)
    if (overlayRafRef.current != null) return
    overlayRafRef.current = window.requestAnimationFrame(() => {
      overlayRafRef.current = null
      const map = mapRef.current
      const svg = trackSvgRef.current
      const data = tropicalDataRef.current
      if (!map) return

      try {
        paintStarfield()
        updateCelestialBodies(map)
      } catch {
        /* ignore */
      }

      const hideMarkers = () => {
        for (const m of markersRef.current) {
          const el = m.getElement()
          if (el) {
            el.style.opacity = '0'
            el.style.pointerEvents = 'none'
          }
        }
      }

      if (!svg) return

      if (!data || !showTropicalRef.current || !data.storms.length) {
        svg.innerHTML = ''
        svg.style.display = 'none'
        hideMarkers()
        return
      }

      const mapCanvas = map.getCanvas()
      const w = mapCanvas.clientWidth || mapCanvas.width
      const h = mapCanvas.clientHeight || mapCanvas.height
      if (w < 2 || h < 2) return

      const center = map.getCenter()
      const cLng = center.lng
      const cLat = center.lat

      svg.style.display = ''
      svg.setAttribute('width', String(w))
      svg.setAttribute('height', String(h))
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`)

      type Pt = { x: number; y: number; lon: number; lat: number }

      const projectVisible = (lon: number, lat: number): Pt | null => {
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
        if (!isFrontOfGlobe(lon, lat, cLng, cLat)) return null
        const p = map.project([lon, lat])
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null
        // Far off-canvas after project (rare near limb)
        if (p.x < -120 || p.x > w + 120 || p.y < -120 || p.y > h + 120) return null
        return { x: p.x, y: p.y, lon, lat }
      }

      /** Build SVG path data; lift pen when a point goes behind the globe. */
      const pathFromCoords = (coords: [number, number][]): string => {
        const parts: string[] = []
        let penDown = false
        let prev: Pt | null = null
        for (const [lon, lat] of coords) {
          const pt = projectVisible(lon, lat)
          if (!pt) {
            penDown = false
            prev = null
            continue
          }
          // Also break on huge screen jumps (antimeridian / projection seams)
          if (prev && penDown) {
            const dx = pt.x - prev.x
            const dy = pt.y - prev.y
            if (dx * dx + dy * dy > (w * 0.45) * (w * 0.45)) {
              penDown = false
            }
          }
          parts.push(`${penDown ? 'L' : 'M'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
          penDown = true
          prev = pt
        }
        return parts.join(' ')
      }

      /** Continuous front-side segments only (for cone fill — never chord the back). */
      const visibleSegments = (coords: [number, number][]): Pt[][] => {
        const segs: Pt[][] = []
        let cur: Pt[] = []
        let prev: Pt | null = null
        for (const [lon, lat] of coords) {
          const pt = projectVisible(lon, lat)
          if (!pt) {
            if (cur.length >= 2) segs.push(cur)
            cur = []
            prev = null
            continue
          }
          if (prev) {
            const dx = pt.x - prev.x
            const dy = pt.y - prev.y
            if (dx * dx + dy * dy > (w * 0.45) * (w * 0.45)) {
              if (cur.length >= 2) segs.push(cur)
              cur = []
            }
          }
          cur.push(pt)
          prev = pt
        }
        if (cur.length >= 2) segs.push(cur)
        return segs
      }

      const nodes: string[] = []
      for (const s of data.storms) {
        const ring =
          s.coneRing ??
          (data.cones?.features
            ?.find((f) => f.properties?.id === s.id || f.properties?.name === s.name)
            ?.geometry?.coordinates as [number, number][][] | undefined)?.[0]

        if (ring && ring.length >= 3) {
          const segs = visibleSegments(ring as [number, number][])
          // Only fill when most of the ring is on the front (avoids wild filled triangles)
          const frontCount = (ring as [number, number][]).filter(([lon, lat]) =>
            isFrontOfGlobe(lon, lat, cLng, cLat),
          ).length
          const mostlyFront = frontCount >= ring.length * 0.55
          for (const seg of segs) {
            if (seg.length < 2) continue
            const d = seg
              .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
              .join(' ')
            if (mostlyFront && segs.length === 1 && seg.length >= 4) {
              nodes.push(`<path class="globe-svg-cone" d="${d} Z" />`)
            }
            nodes.push(`<path class="globe-svg-cone-stroke" d="${d}" fill="none" />`)
          }
        }

        const pastSegs: [number, number][][] =
          s.pastTrackSegments?.length
            ? s.pastTrackSegments
            : s.pastTrack && s.pastTrack.length >= 2
              ? [s.pastTrack]
              : []
        for (const seg of pastSegs) {
          const d = pathFromCoords(seg)
          if (d.includes('L')) {
            nodes.push(`<path class="globe-svg-past-glow" d="${d}" fill="none" />`)
            nodes.push(`<path class="globe-svg-past" d="${d}" fill="none" />`)
          }
        }

        if (s.track && s.track.length >= 2) {
          const d = pathFromCoords(s.track)
          if (d.includes('L')) {
            nodes.push(`<path class="globe-svg-fcst-glow" d="${d}" fill="none" />`)
            nodes.push(`<path class="globe-svg-fcst" d="${d}" fill="none" />`)
          }
        }

        for (const pt of s.forecastPoints ?? []) {
          const p = projectVisible(pt.lon, pt.lat)
          if (!p) continue
          if (p.x < 0 || p.x > w || p.y < 0 || p.y > h) continue
          nodes.push(
            `<circle class="globe-svg-fcst-pt" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" />`,
          )
        }
      }

      svg.innerHTML = nodes.join('')

      // Storm name markers: fade when center is on the far side
      for (const m of markersRef.current) {
        const el = m.getElement()
        if (!el) continue
        if (!showTropicalRef.current) {
          el.style.opacity = '0'
          el.style.pointerEvents = 'none'
          continue
        }
        const ll = m.getLngLat()
        const front = isFrontOfGlobe(ll.lng, ll.lat, cLng, cLat, 0.08)
        el.style.opacity = front ? '1' : '0'
        el.style.pointerEvents = front ? 'auto' : 'none'
        el.style.transition = 'opacity 0.12s linear'
      }
    })
  }, [scheduleDayNight, updateCelestialBodies, paintStarfield])

  const placeMarkers = useCallback(
    (map: MapLibreMap, data: TropicalGlobeData, visible: boolean) => {
      tropicalDataRef.current = data
      showTropicalRef.current = visible
      clearStormMarkers()
      if (!visible) {
        scheduleOverlay()
        return
      }
      for (const s of data.storms) {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'globe-storm-marker'
        const isHu = /hurricane|major/i.test(s.classification)
        el.innerHTML = `<span class="globe-storm-dot ${isHu ? 'is-hu' : ''}"></span><span class="globe-storm-label">${escapeHtml(s.name)} · ${escapeHtml(s.classification)}</span>`
        el.title = [s.name, s.classification, s.intensity, s.movement, s.pressure ? `${s.pressure} mb` : '']
          .filter(Boolean)
          .join(' · ')
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          setSpinning(false)
          map.easeTo({
            center: [s.lon, s.lat],
            zoom: Math.max(map.getZoom(), 3.1),
            bearing: 0,
            pitch: 0,
            duration: 900,
            essential: true,
          })
        })
        markersRef.current.push(
          new maplibregl.Marker({ element: el, anchor: 'left' }).setLngLat([s.lon, s.lat]).addTo(map),
        )
      }
      scheduleOverlay()
    },
    [clearStormMarkers, scheduleOverlay],
  )

  /**
   * Apply one radar frame. Single layer, skip if same path, queue if busy.
   * Never stacks dual buffers that thrash WebGL on globe.
   */
  const applyFrame = useCallback((idx: number, force = false) => {
    const map = mapRef.current
    const list = framesRef.current
    if (!map || !readyRef.current || !list.length || swappingBasemapRef.current) return
    if (!map.isStyleLoaded()) return

    const safeIdx = Math.max(0, Math.min(idx, list.length - 1))
    const frame = list[safeIdx]
    if (!frame) return

    if (radarBusyRef.current) {
      radarQueuedRef.current = safeIdx
      return
    }

    const opacityVal = showRadarRef.current ? opacityRef.current : 0
    const url = rainViewerTileUrl(hostRef.current, frame.key)
    if (!url.includes('{z}')) return

    // Same tile path — only touch opacity
    if (!force && radarKeyRef.current === frame.key && map.getLayer(RADAR_ID)) {
      try {
        map.setPaintProperty(RADAR_ID, 'raster-opacity', opacityVal)
      } catch {
        /* ignore */
      }
      return
    }

    radarBusyRef.current = true
    try {
      if (map.getLayer(RADAR_ID)) map.removeLayer(RADAR_ID)
      if (map.getSource(RADAR_ID)) map.removeSource(RADAR_ID)

      map.addSource(RADAR_ID, {
        type: 'raster',
        tiles: [url],
        tileSize: 256,
        maxzoom: RADAR_MAXZOOM,
        attribution: 'Radar © RainViewer',
      })

      const beforeId = map.getLayer('labels') ? 'labels' : undefined
      map.addLayer(
        {
          id: RADAR_ID,
          type: 'raster',
          source: RADAR_ID,
          paint: {
            'raster-opacity': opacityVal,
            'raster-fade-duration': 0,
            'raster-resampling': 'linear',
          },
        },
        beforeId,
      )
      radarKeyRef.current = frame.key
    } catch (e) {
      console.warn('[globe] applyFrame failed', e)
    } finally {
      radarBusyRef.current = false
      const queued = radarQueuedRef.current
      if (queued != null && queued !== safeIdx) {
        radarQueuedRef.current = null
        // Defer so we don't recurse in the same stack
        window.setTimeout(() => applyFrame(queued), 0)
      } else {
        radarQueuedRef.current = null
      }
    }
  }, [])

  const stopPlayTimer = useCallback(() => {
    if (playTimerRef.current != null) {
      window.clearInterval(playTimerRef.current)
      playTimerRef.current = null
    }
  }, [])

  const startPlayTimer = useCallback(() => {
    stopPlayTimer()
    playTimerRef.current = window.setInterval(() => {
      if (!framesRef.current.length) return
      const next = (frameIdxRef.current + 1) % framesRef.current.length
      frameIdxRef.current = next
      setFrameIdx(next)
      applyFrame(next)
    }, SPEED_MS[speed])
  }, [applyFrame, speed, stopPlayTimer])

  const stopSpin = useCallback(() => {
    if (spinRafRef.current != null) {
      window.cancelAnimationFrame(spinRafRef.current)
      spinRafRef.current = null
    }
  }, [])

  /**
   * Equatorial spin: advance longitude while keeping the user's latitude.
   * Pauses while the user is dragging / zooming so you can still move around.
   * Advances every N frames to cut map re-renders + overlay work roughly in half.
   */
  const startSpin = useCallback(() => {
    stopSpin()
    spinFrameRef.current = 0
    const tick = () => {
      if (!spinningRef.current) {
        spinRafRef.current = null
        return
      }
      const map = mapRef.current
      spinFrameRef.current += 1
      // Skip frames while the user is dragging/zooming so spin doesn't fight the camera
      if (
        map &&
        !swappingBasemapRef.current &&
        !userInteractingRef.current &&
        spinFrameRef.current % SPIN_EVERY_N_FRAMES === 0
      ) {
        try {
          const c = map.getCenter()
          const lon = normalizeLon(c.lng - SPIN_DEG_PER_TICK)
          map.jumpTo({
            center: [lon, c.lat],
            bearing: 0,
            pitch: 0,
          })
        } catch {
          /* ignore */
        }
      }
      spinRafRef.current = window.requestAnimationFrame(tick)
    }
    spinRafRef.current = window.requestAnimationFrame(tick)
  }, [stopSpin])

  const flyRegion = useCallback((regionId: string) => {
    const map = mapRef.current
    const r = REGIONS.find((x) => x.id === regionId)
    if (!map || !r) return
    setSpinning(false)
    setActiveRegion(regionId)
    map.easeTo({
      center: r.center,
      zoom: r.zoom,
      duration: 1100,
      bearing: 0,
      pitch: 0,
      essential: true,
    })
  }, [])

  const focusStorms = useCallback(() => {
    const map = mapRef.current
    if (!map || !storms.length) return
    setSpinning(false)
    setActiveRegion('storms')
    const lons = storms.flatMap((s) => [
      s.lon,
      ...(s.track?.map((c) => c[0]) ?? []),
      ...(s.pastTrack?.map((c) => c[0]) ?? []),
    ])
    const lats = storms.flatMap((s) => [
      s.lat,
      ...(s.track?.map((c) => c[1]) ?? []),
      ...(s.pastTrack?.map((c) => c[1]) ?? []),
    ])
    const minLon = Math.min(...lons)
    const maxLon = Math.max(...lons)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const span = Math.max(maxLon - minLon, maxLat - minLat, 8)
    const z = span > 50 ? 1.5 : span > 25 ? 2.1 : span > 12 ? 2.6 : 3.2
    map.easeTo({
      center: [(minLon + maxLon) / 2, (minLat + maxLat) / 2],
      zoom: z,
      bearing: 0,
      pitch: 0,
      duration: 1200,
      essential: true,
    })
  }, [storms])

  // ── Mount map once ──────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    mountedRef.current = true
    let cancelled = false
    const initial = BASEMAPS.satellite

    const map = new maplibregl.Map({
      container: el,
      style: buildStyle(initial),
      // Boot at max zoom so first tiles requested are highest detail
      center: GLOBE_WORLD_CENTER,
      zoom: GLOBE_MAX_ZOOM,
      minZoom: GLOBE_MIN_ZOOM,
      maxZoom: GLOBE_MAX_ZOOM,
      pitch: 0,
      bearing: 0,
      maxTileCacheSize: GLOBE_TILE_CACHE,
      fadeDuration: 0,
      refreshExpiredTiles: false,
      attributionControl: { compact: true },
      // Drag pans the globe (longitude); twist/roll causes “glitchy” feel with spin
      dragRotate: false,
      touchPitch: false,
      pitchWithRotate: false,
      renderWorldCopies: false,
    })
    mapRef.current = map
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }),
      'top-right',
    )

    // Keep hurricane SVG + markers locked to the globe while dragging / spinning.
    // scheduleOverlay is rAF-coalesced so this stays cheap.
    const onMove = () => scheduleOverlay()
    map.on('move', onMove)
    map.on('zoom', onMove)
    map.on('pitch', onMove)
    map.on('rotate', onMove)

    // While spinning, still allow pan/zoom: pause auto-longitude until interaction ends
    const markInteractStart = () => {
      userInteractingRef.current = true
      if (interactEndTimerRef.current != null) {
        window.clearTimeout(interactEndTimerRef.current)
        interactEndTimerRef.current = null
      }
    }
    const markInteractEnd = () => {
      if (interactEndTimerRef.current != null) window.clearTimeout(interactEndTimerRef.current)
      // Brief delay so inertia / wheel settle before spin resumes; then HQ day/night
      interactEndTimerRef.current = window.setTimeout(() => {
        userInteractingRef.current = false
        interactEndTimerRef.current = null
        scheduleDayNight(true)
      }, 180)
    }
    map.on('dragstart', markInteractStart)
    map.on('dragend', markInteractEnd)
    map.on('zoomstart', markInteractStart)
    map.on('zoomend', markInteractEnd)
    map.on('rotatestart', markInteractStart)
    map.on('rotateend', markInteractEnd)
    map.on('pitchstart', markInteractStart)
    map.on('pitchend', markInteractEnd)
    map.on('mousedown', markInteractStart)
    map.on('mouseup', markInteractEnd)
    map.on('touchstart', markInteractStart)
    map.on('touchend', markInteractEnd)
    const onWheel = () => {
      markInteractStart()
      markInteractEnd()
    }
    map.on('wheel', onWheel)

    // Solar eclipse path clicks → info card
    const onEclipseClick = (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] },
    ) => {
      const f = e.features?.[0]
      if (!f?.properties) return
      const p = f.properties
      const isFr = locale === 'fr'
      setEclipsePopup({
        title: String(isFr && p.titleFr ? p.titleFr : p.title || ''),
        regions: String(isFr && p.regionsFr ? p.regionsFr : p.regions || ''),
        date: String(p.date || ''),
        maxDuration: String(p.maxDuration || ''),
        kind: String(p.kind || ''),
        nasaUrl: String(p.nasaUrl || ''),
        x: e.point.x,
        y: e.point.y,
      })
      if (p.id) setActiveEclipseId(String(p.id))
    }
    const onEclipseEnter = () => {
      map.getCanvas().style.cursor = 'pointer'
    }
    const onEclipseLeave = () => {
      map.getCanvas().style.cursor = ''
    }
    for (const lid of [
      ECLIPSE_TOTALITY_FILL,
      ECLIPSE_PARTIAL_FILL,
      ECLIPSE_CENTER,
      ECLIPSE_TOTALITY_LINE,
    ]) {
      map.on('click', lid, onEclipseClick)
      map.on('mouseenter', lid, onEclipseEnter)
      map.on('mouseleave', lid, onEclipseLeave)
    }

    const ro = new ResizeObserver(() => {
      try {
        map.resize()
        scheduleOverlay()
      } catch {
        /* ignore */
      }
    })
    ro.observe(el)

    const boot = async () => {
      try {
        setLoadHint(te('globe.building'))
        await new Promise<void>((resolve) => {
          if (map.isStyleLoaded()) resolve()
          else map.once('load', () => resolve())
        })
        if (cancelled) return

        try {
          map.setProjection({ type: 'globe' })
        } catch {
          /* flat ok */
        }
        applySpaceSky(map)
        paintStarfield()

        // Interactive ASAP at world view (defer expensive full-sphere tile warm)
        map.jumpTo({
          center: GLOBE_WORLD_CENTER,
          zoom: GLOBE_WORLD_ZOOM,
          bearing: 0,
          pitch: 0,
        })
        readyRef.current = true
        setMapInteractive(true)
        scheduleOverlay()
        syncEclipseLayers(map, showEclipsesRef.current, activeEclipseIdRef.current)
        try {
          updateCelestialBodies(map)
        } catch {
          /* ignore */
        }

        // Radar + tropical in parallel (don't block on tile warm)
        setLoadHint(te('globe.loadingRadar'))
        const radarP = loadGlobalRadarLoop({ maxPast: 12 }).catch(() => null)
        const tropicalP = fetchTropicalGlobeData().catch(() => null)

        const radar = await radarP
        if (cancelled) return

        if (!radar || !radar.frames.length) {
          setError(te('globe.noFrames'))
          setLoading(false)
          return
        }

        hostRef.current = radar.host
        framesRef.current = radar.frames
        frameIdxRef.current = radar.nowIndex
        setFrames(radar.frames)
        setNowIndex(radar.nowIndex)
        setFrameIdx(radar.nowIndex)
        applyFrame(radar.nowIndex, true)
        setLoadHint(te('globe.ready'))
        setLoading(false)

        // Background tile warm (detail when zooming) — non-blocking
        void warmGlobeTiles(map, () => cancelled, () => {
          /* quiet */
        }).catch(() => {
          /* optional */
        })

        setLoadHint(te('globe.loadingTropical'))
        try {
          const tropical = await tropicalP
          if (!cancelled && tropical && mapRef.current) {
            setStorms(tropical.storms)
            const showTracks = showTropicalRef.current
            placeMarkers(mapRef.current, tropical, showTracks)
            // Storms mode: frame active storms
            if (
              tropical.storms.length &&
              (missionModeProp === 'storms' || loadGlobePrefs().mode === 'storms')
            ) {
              const list = tropical.storms
              const lons = list.flatMap((s) => [
                s.lon,
                ...(s.track?.map((c) => c[0]) ?? []),
                ...(s.pastTrack?.map((c) => c[0]) ?? []),
              ])
              const lats = list.flatMap((s) => [
                s.lat,
                ...(s.track?.map((c) => c[1]) ?? []),
                ...(s.pastTrack?.map((c) => c[1]) ?? []),
              ])
              if (lons.length && lats.length) {
                const minLon = Math.min(...lons)
                const maxLon = Math.max(...lons)
                const minLat = Math.min(...lats)
                const maxLat = Math.max(...lats)
                const span = Math.max(maxLon - minLon, maxLat - minLat, 8)
                const z = span > 50 ? 1.5 : span > 25 ? 2.1 : span > 12 ? 2.6 : 3.2
                setActiveRegion('storms')
                map.easeTo({
                  center: [(minLon + maxLon) / 2, (minLat + maxLat) / 2],
                  zoom: z,
                  bearing: 0,
                  pitch: 0,
                  duration: prefersReducedMotion() ? 0 : 1100,
                  essential: true,
                })
              }
            }
          }
        } catch {
          /* optional */
        }
        if (cancelled) return

        scheduleOverlay()
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : te('globe.failed'))
        setLoading(false)
        setMapInteractive(true)
      }
    }

    void boot()

    // Keep Sun/Moon in real time (positions drift slowly; 30s is fine)
    const bodyTimer = window.setInterval(() => {
      const m = mapRef.current
      if (m && readyRef.current) {
        try {
          updateCelestialBodies(m)
        } catch {
          /* ignore */
        }
      }
    }, 30_000)

    return () => {
      cancelled = true
      mountedRef.current = false
      readyRef.current = false
      window.clearInterval(bodyTimer)
      stopPlayTimer()
      stopSpin()
      clearStormMarkers()
      if (overlayRafRef.current != null) {
        window.cancelAnimationFrame(overlayRafRef.current)
        overlayRafRef.current = null
      }
      ro.disconnect()
      if (interactEndTimerRef.current != null) {
        window.clearTimeout(interactEndTimerRef.current)
        interactEndTimerRef.current = null
      }
      if (dayNightRafRef.current != null) {
        window.cancelAnimationFrame(dayNightRafRef.current)
        dayNightRafRef.current = null
      }
      try {
        map.off('move', onMove)
        map.off('zoom', onMove)
        map.off('pitch', onMove)
        map.off('rotate', onMove)
        map.off('dragstart', markInteractStart)
        map.off('dragend', markInteractEnd)
        map.off('zoomstart', markInteractStart)
        map.off('zoomend', markInteractEnd)
        map.off('rotatestart', markInteractStart)
        map.off('rotateend', markInteractEnd)
        map.off('pitchstart', markInteractStart)
        map.off('pitchend', markInteractEnd)
        map.off('mousedown', markInteractStart)
        map.off('mouseup', markInteractEnd)
        map.off('touchstart', markInteractStart)
        map.off('touchend', markInteractEnd)
        map.off('wheel', onWheel)
        for (const lid of [
          ECLIPSE_TOTALITY_FILL,
          ECLIPSE_PARTIAL_FILL,
          ECLIPSE_CENTER,
          ECLIPSE_TOTALITY_LINE,
        ]) {
          map.off('click', lid, onEclipseClick)
          map.off('mouseenter', lid, onEclipseEnter)
          map.off('mouseleave', lid, onEclipseLeave)
        }
      } catch {
        /* ignore */
      }
      map.remove()
      mapRef.current = null
      radarKeyRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, [])

  // Opacity / radar visibility without rebuilding tiles
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || !map.getLayer(RADAR_ID)) return
    try {
      map.setPaintProperty(RADAR_ID, 'raster-opacity', showRadar ? opacity : 0)
    } catch {
      /* ignore */
    }
  }, [opacity, showRadar])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getLayer('labels')) return
    try {
      map.setLayoutProperty('labels', 'visibility', showLabels ? 'visible' : 'none')
    } catch {
      /* ignore */
    }
  }, [showLabels])

  useEffect(() => {
    showTropicalRef.current = showTropical
    for (const m of markersRef.current) {
      const el = m.getElement()
      if (el) el.style.display = showTropical ? '' : 'none'
    }
    scheduleOverlay()
  }, [showTropical, scheduleOverlay])

  // Spin on/off — honor prefers-reduced-motion; pause when tab hidden
  useEffect(() => {
    spinningRef.current = spinning
    if (spinning && prefersReducedMotion()) {
      setSpinning(false)
      return
    }
    const sync = () => {
      if (!spinningRef.current) {
        stopSpin()
        scheduleOverlay()
        return
      }
      if (typeof document !== 'undefined' && document.hidden) {
        stopSpin()
        return
      }
      startSpin()
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      stopSpin()
    }
  }, [spinning, startSpin, stopSpin, scheduleOverlay])

  // Cloud IR layer (GIBS)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    try {
      if (showIR) {
        if (!map.getSource(IR_SOURCE)) {
          map.addSource(IR_SOURCE, {
            type: 'raster',
            tiles: [GIBS_IR_TILES],
            tileSize: 256,
            maxzoom: 7,
            attribution: 'IR © NASA GIBS / NOAA GOES',
          })
        }
        if (!map.getLayer(IR_LAYER)) {
          const before = map.getLayer(RADAR_ID) ? RADAR_ID : map.getLayer('labels') ? 'labels' : undefined
          map.addLayer(
            {
              id: IR_LAYER,
              type: 'raster',
              source: IR_SOURCE,
              paint: {
                'raster-opacity': 0.55,
                'raster-fade-duration': 0,
              },
            },
            before,
          )
        } else {
          map.setLayoutProperty(IR_LAYER, 'visibility', 'visible')
        }
      } else if (map.getLayer(IR_LAYER)) {
        map.setLayoutProperty(IR_LAYER, 'visibility', 'none')
      }
    } catch (e) {
      console.warn('[globe] IR layer', e)
    }
  }, [showIR])

  // Solar eclipse paths
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    syncEclipseLayers(map, showEclipses, activeEclipseId)
    if (!showEclipses) setEclipsePopup(null)
  }, [showEclipses, activeEclipseId, syncEclipseLayers])

  useEffect(() => {
    showDayNightRef.current = showDayNight
    scheduleDayNight(true)
  }, [showDayNight, scheduleDayNight])

  useEffect(() => {
    showBodiesRef.current = showBodies
    const map = mapRef.current
    if (!map || !readyRef.current) return
    try {
      updateCelestialBodies(map)
    } catch {
      /* ignore */
    }
  }, [showBodies, updateCelestialBodies])

  // Play / pause — single timer, no double-start; pause when tab hidden (saves GPU)
  useEffect(() => {
    if (!playing) {
      stopPlayTimer()
      return () => stopPlayTimer()
    }
    const sync = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        stopPlayTimer()
        stopSpin()
      } else {
        startPlayTimer()
        if (spinningRef.current) startSpin()
      }
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      stopPlayTimer()
    }
  }, [playing, startPlayTimer, stopPlayTimer, stopSpin, startSpin])

  // Speed change restarts timer only while playing
  useEffect(() => {
    if (playing) startPlayTimer()
  }, [speed, playing, startPlayTimer])

  const lastBasemapApplied = useRef<BasemapId | null>(null)

  // Basemap switch — skip initial satellite (already in style); no thrash on mount
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    if (lastBasemapApplied.current === basemapId) return
    if (lastBasemapApplied.current === null && basemapId === 'satellite') {
      lastBasemapApplied.current = 'satellite'
      return
    }

    const def = BASEMAPS[basemapId]
    const wasSpinning = spinningRef.current
    setSpinning(false)
    swappingBasemapRef.current = true
    radarKeyRef.current = null

    try {
      removeEclipseLayers(map)
      if (map.getLayer(IR_LAYER)) map.removeLayer(IR_LAYER)
      if (map.getSource(IR_SOURCE)) map.removeSource(IR_SOURCE)
      if (map.getLayer(RADAR_ID)) map.removeLayer(RADAR_ID)
      if (map.getSource(RADAR_ID)) map.removeSource(RADAR_ID)
      if (map.getLayer('labels')) map.removeLayer('labels')
      if (map.getSource('labels')) map.removeSource('labels')
      if (map.getLayer('basemap')) map.removeLayer('basemap')
      if (map.getSource('basemap')) map.removeSource('basemap')

      map.addSource('basemap', {
        type: 'raster',
        tiles: def.tiles,
        tileSize: 256,
        maxzoom: def.maxzoom,
        attribution: def.attribution,
      })
      map.addLayer({
        id: 'basemap',
        type: 'raster',
        source: 'basemap',
        paint: { 'raster-opacity': 1, 'raster-fade-duration': 0 },
      })

      if (def.labels?.length) {
        map.addSource('labels', {
          type: 'raster',
          tiles: def.labels,
          tileSize: 256,
          maxzoom: Math.min(def.maxzoom, 12),
          attribution: '© CARTO',
        })
        map.addLayer({
          id: 'labels',
          type: 'raster',
          source: 'labels',
          paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 0 },
          layout: { visibility: showLabels ? 'visible' : 'none' },
        })
      }

      applySpaceSky(map)
      lastBasemapApplied.current = basemapId
    } catch (e) {
      console.warn('[globe] basemap swap failed', e)
    }

    swappingBasemapRef.current = false
    applyFrame(frameIdxRef.current, true)
    if (showIR) {
      try {
        if (!map.getSource(IR_SOURCE)) {
          map.addSource(IR_SOURCE, {
            type: 'raster',
            tiles: [GIBS_IR_TILES],
            tileSize: 256,
            maxzoom: 7,
            attribution: 'IR © NASA GIBS / NOAA GOES',
          })
        }
        if (!map.getLayer(IR_LAYER)) {
          const before = map.getLayer(RADAR_ID) ? RADAR_ID : map.getLayer('labels') ? 'labels' : undefined
          map.addLayer(
            {
              id: IR_LAYER,
              type: 'raster',
              source: IR_SOURCE,
              paint: { 'raster-opacity': 0.55, 'raster-fade-duration': 0 },
            },
            before,
          )
        }
      } catch {
        /* ignore */
      }
    }
    syncEclipseLayers(map, showEclipsesRef.current, activeEclipseIdRef.current)
    scheduleOverlay()
    if (wasSpinning) setSpinning(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showLabels/showIR at swap time
  }, [basemapId, applyFrame, scheduleOverlay, showLabels, showIR, removeEclipseLayers, syncEclipseLayers])

  useEffect(() => {
    if (!optionsOpen) return
    const onDoc = (e: MouseEvent) => {
      const el = optionsMenuRef.current
      if (el && !el.contains(e.target as Node)) setOptionsOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOptionsOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [optionsOpen])

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

  const scrub = (idx: number) => {
    setPlaying(false)
    frameIdxRef.current = idx
    setFrameIdx(idx)
    applyFrame(idx)
  }

  const frame = frames[frameIdx]
  const isNow = frameIdx === nowIndex
  const isForecast = frameIdx > nowIndex
  const progress = frames.length > 1 ? frameIdx / (frames.length - 1) : 0

  return (
    <div
      className={`globe-stage globe-theme-${basemapId} globe-stage-space globe-mission-stage mode-${missionMode}`}
    >
      {/* Deep space starfield behind the planet */}
      <canvas ref={spaceCanvasRef} className="globe-space-canvas" aria-hidden="true" />
      <div
        ref={containerRef}
        className="globe-canvas"
        role="img"
        aria-label={te('globe.title')}
      />
      <canvas
        ref={dayNightCanvasRef}
        className="globe-daynight-canvas"
        aria-hidden="true"
      />
      {/* Sun & Moon as 3D-style spheres out in space (not on the surface) */}
      <div
        ref={sunBodyRef}
        className="globe-space-body globe-space-sun"
        role="img"
        aria-label="Sun"
        aria-hidden={!showBodies}
      >
        <div className="globe-space-sun-core" />
        <div className="globe-space-sun-corona" />
        <span className="globe-space-body-label">Sun</span>
      </div>
      <div
        ref={moonBodyRef}
        className="globe-space-body globe-space-moon"
        role="img"
        aria-label="Moon"
        aria-hidden={!showBodies}
      >
        <div className="globe-space-moon-sphere">
          <div className="globe-space-moon-lit" />
          <div className="globe-space-moon-shade" />
        </div>
        <span className="globe-space-body-label">Moon</span>
      </div>
      <svg
        ref={trackSvgRef}
        className="globe-track-svg"
        aria-hidden="true"
        style={{ display: 'none' }}
      />

      {loading && mapInteractive && (
        <div className="globe-load-pill" role="status">
          <div className="spinner" />
          <span>{loadHint}</span>
        </div>
      )}
      {loading && !mapInteractive && (
        <div className="globe-overlay-msg" role="status">
          <div className="spinner large" />
          <span>{loadHint}</span>
        </div>
      )}
      {error && (
        <div className="globe-overlay-msg error" role="alert">
          <p>{error}</p>
          <button type="button" className="chip-btn" onClick={() => window.location.reload()}>
            {te('globe.retry')}
          </button>
        </div>
      )}

      {!loading && !error && (
        <div className="globe-mini-legend" aria-hidden>
          {showRadar && (
            <span>
              <i className="sw-radar" /> {te('globe.legendRadar')}
            </span>
          )}
          {showDayNight && (
            <span>
              <i className="sw-night" /> {te('globe.legendNight')}
            </span>
          )}
          {showTropical && storms.length > 0 && (
            <span>
              <i className="sw-fcst" /> {te('globe.legendFcst')}
            </span>
          )}
          {showEclipses && (
            <span>
              <i className="sw-eclipse" /> {te('globe.eclipseTotality')}
            </span>
          )}
        </div>
      )}

      {storms.length > 0 && (
        <div className="globe-storm-dock" aria-label={te('globe.activeStorms')}>
          {storms.slice(0, 8).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSpinning(false)
                mapRef.current?.easeTo({
                  center: [s.lon, s.lat],
                  zoom: Math.max(mapRef.current.getZoom(), 3.1),
                  bearing: 0,
                  pitch: 0,
                  duration: 900,
                  essential: true,
                })
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="globe-options" ref={optionsMenuRef}>
        <button
          type="button"
          className={`chip-btn globe-options-trigger ${optionsOpen ? 'active' : ''}`}
          onClick={() => setOptionsOpen((v) => !v)}
          aria-expanded={optionsOpen}
          aria-haspopup="menu"
          aria-controls="globe-options-menu"
          disabled={!mapInteractive && loading}
        >
          ⚙ {te('globe.options')}
          <span className="globe-options-caret" aria-hidden="true">
            {optionsOpen ? '▴' : '▾'}
          </span>
        </button>
        {optionsOpen && (
          <div
            id="globe-options-menu"
            className="globe-options-menu"
            role="menu"
            aria-label={te('globe.options')}
          >
            <div className="globe-options-section" role="group" aria-label={te('globe.mapStyle')}>
              <div className="globe-options-heading">{te('globe.mapStyle')}</div>
              <div className="globe-options-chips">
                {(Object.keys(BASEMAPS) as BasemapId[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={basemapId === id}
                    className={`chip-btn globe-options-chip ${basemapId === id ? 'active' : ''}`}
                    onClick={() => setBasemapId(id)}
                  >
                    {te(BASEMAP_LABEL_KEYS[id] as 'globe.satellite')}
                  </button>
                ))}
              </div>
            </div>

            <div className="globe-options-section" role="group" aria-label={te('globe.layers')}>
              <div className="globe-options-heading">{te('globe.layers')}</div>
              <div className="globe-options-chips">
                <button
                  type="button"
                  role="menuitemcheckbox"
                  className={`chip-btn globe-options-chip ${showRadar ? 'active' : ''}`}
                  onClick={() => setShowRadar((v) => !v)}
                  aria-checked={showRadar}
                >
                  {te('globe.layerRadar')}
                </button>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  className={`chip-btn globe-options-chip ${showIR ? 'active' : ''}`}
                  onClick={() => setShowIR((v) => !v)}
                  aria-checked={showIR}
                >
                  {te('globe.layerIR')}
                </button>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  className={`chip-btn globe-options-chip ${showDayNight ? 'active' : ''}`}
                  onClick={() => setShowDayNight((v) => !v)}
                  aria-checked={showDayNight}
                >
                  {te('globe.layerDayNight')}
                </button>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  className={`chip-btn globe-options-chip ${showBodies ? 'active' : ''}`}
                  onClick={() => setShowBodies((v) => !v)}
                  aria-checked={showBodies}
                >
                  {te('globe.layerBodies')}
                </button>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  className={`chip-btn globe-options-chip ${showTropical ? 'active' : ''}`}
                  onClick={() => setShowTropical((v) => !v)}
                  aria-checked={showTropical}
                  disabled={!storms.length}
                >
                  {te('globe.layerStorms')}
                </button>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  className={`chip-btn globe-options-chip ${showEclipses ? 'active' : ''}`}
                  onClick={() => setShowEclipses((v) => !v)}
                  aria-checked={showEclipses}
                  title={te('globe.eclipsesHint')}
                >
                  {te('globe.eclipses')}
                </button>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  className={`chip-btn globe-options-chip ${showLabels ? 'active' : ''}`}
                  onClick={() => setShowLabels((v) => !v)}
                  aria-checked={showLabels}
                >
                  {te('globe.layerLabels')}
                </button>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  className={`chip-btn globe-options-chip ${spinning ? 'active' : ''}`}
                  onClick={() => setSpinning((v) => !v)}
                  aria-checked={spinning}
                  disabled={prefersReducedMotion()}
                >
                  {te('globe.layerSpin')}
                </button>
              </div>
            </div>

            <div className="globe-options-section" role="group" aria-label={te('globe.region')}>
              <div className="globe-options-heading">{te('globe.region')}</div>
              <div className="globe-options-chips">
                {REGIONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="menuitem"
                    className={`chip-btn globe-options-chip ${activeRegion === r.id ? 'active' : ''}`}
                    onClick={() => {
                      flyRegion(r.id)
                      setOptionsOpen(false)
                    }}
                  >
                    {te(r.labelKey as 'globe.world')}
                  </button>
                ))}
                {storms.length > 0 && (
                  <button
                    type="button"
                    role="menuitem"
                    className={`chip-btn globe-options-chip ${activeRegion === 'storms' ? 'active' : ''}`}
                    onClick={() => {
                      focusStorms()
                      setOptionsOpen(false)
                    }}
                  >
                    {te('globe.activeStorms')}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {showEclipses && upcomingEclipses.length > 0 && !error && (
        <aside className="globe-eclipse-panel" aria-label={te('globe.eclipses')}>
          <div className="globe-eclipse-panel-head">
            <strong>🌑 {te('globe.eclipses')}</strong>
            <button
              type="button"
              className="globe-eclipse-close"
              onClick={() => setShowEclipses(false)}
              title={te('globe.eclipseHide')}
            >
              ×
            </button>
          </div>
          <ul className="globe-eclipse-list">
            {upcomingEclipses.map((ecl) => {
              const title = locale === 'fr' ? ecl.titleFr : ecl.title
              const regions = locale === 'fr' ? ecl.regionsFr : ecl.regions
              const active = activeEclipseId === ecl.id
              return (
                <li key={ecl.id}>
                  <button
                    type="button"
                    className={`globe-eclipse-item ${active ? 'active' : ''}`}
                    onClick={() => flyToEclipse(ecl)}
                  >
                    <span className="globe-eclipse-date">{ecl.date}</span>
                    <span className="globe-eclipse-name">{title}</span>
                    <span className="globe-eclipse-regions">
                      {regions} · max {ecl.maxDuration}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="globe-eclipse-credit">{te('globe.eclipseCredit')}</p>
        </aside>
      )}

      {eclipsePopup && (
        <div
          className="globe-eclipse-popup"
          style={{ left: Math.min(eclipsePopup.x + 12, (typeof window !== 'undefined' ? window.innerWidth : 400) - 280), top: Math.max(8, eclipsePopup.y - 8) }}
          role="dialog"
          aria-label={eclipsePopup.title}
        >
          <button
            type="button"
            className="globe-eclipse-popup-x"
            onClick={() => setEclipsePopup(null)}
            aria-label="Close"
          >
            ×
          </button>
          <strong>{eclipsePopup.title}</strong>
          <p>
            {eclipsePopup.kind === 'totality'
              ? te('globe.eclipseTotality')
              : eclipsePopup.kind === 'partial'
                ? te('globe.eclipsePartial')
                : te('globe.eclipseCenter')}
          </p>
          <p>{eclipsePopup.regions}</p>
          {eclipsePopup.maxDuration && (
            <p>
              {te('globe.eclipseMaxDur')}: {eclipsePopup.maxDuration}
            </p>
          )}
          {eclipsePopup.nasaUrl && (
            <a href={eclipsePopup.nasaUrl} target="_blank" rel="noreferrer">
              {te('globe.eclipseNasa')}
            </a>
          )}
        </div>
      )}

      <div className="globe-controls" role="toolbar" aria-label={te('globe.playback')}>
        <div className="globe-timeline-wrap">
          <input
            type="range"
            className="globe-timeline"
            min={0}
            max={Math.max(0, frames.length - 1)}
            step={1}
            value={frameIdx}
            disabled={!frames.length}
            onChange={(e) => scrub(Number(e.target.value))}
            aria-label={te('globe.timeline')}
            style={{ ['--globe-progress' as string]: `${progress * 100}%` } as Record<string, string>}
          />
          <div className="globe-timeline-marks">
            <span>{te('globe.past')}</span>
            <span className={isNow ? 'is-active' : ''}>{te('globe.now')}</span>
            {frames.length > nowIndex + 1 ? (
              <span className={isForecast ? 'is-active' : ''}>{te('globe.forecast')}</span>
            ) : (
              <span />
            )}
          </div>
        </div>

        <div className="globe-controls-main">
          <button
            type="button"
            className="chip-btn globe-play-btn"
            onClick={() => setPlaying((p) => !p)}
            disabled={!frames.length}
            aria-pressed={playing}
          >
            {playing ? `❚❚ ${te('globe.pause')}` : `▶ ${te('globe.play')}`}
          </button>
          <button type="button" className="chip-btn" onClick={() => step(-1)} disabled={!frames.length}>
            ‹
          </button>
          <button type="button" className="chip-btn" onClick={() => step(1)} disabled={!frames.length}>
            ›
          </button>
          <button
            type="button"
            className={`chip-btn ${isNow ? 'active' : ''}`}
            onClick={goNow}
            disabled={!frames.length}
          >
            {te('globe.now')}
          </button>
          <button
            type="button"
            className={`chip-btn ${playerMore ? 'active' : ''}`}
            onClick={() => setPlayerMore((v) => !v)}
            aria-expanded={playerMore}
            title={te('globe.moreControls')}
          >
            ···
          </button>
          <span className="globe-frame-count">
            {frames.length ? `${frameIdx + 1}/${frames.length}` : '—'}
          </span>
        </div>
        {playerMore && (
          <div className="globe-controls-meta">
            <span className="globe-time">
              {frame ? formatRadarTime(frame.time) : '—'}
              {isNow && <em> · {te('globe.now').toLowerCase()}</em>}
              {isForecast && <em> · {te('globe.forecast').toLowerCase()}</em>}
            </span>
            <label className="globe-speed">
              <span className="sr-only">{te('globe.speed')}</span>
              <select
                value={speed}
                onChange={(e) => setSpeed(e.target.value as SpeedKey)}
                aria-label={te('globe.speed')}
              >
                <option value="slow">{te('globe.speedSlow')}</option>
                <option value="normal">{te('globe.speedNormal')}</option>
                <option value="fast">{te('globe.speedFast')}</option>
              </select>
            </label>
            <label className="globe-opacity">
              {te('globe.opacity')}
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                disabled={!showRadar}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  )
}
