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
  isNight,
  subsolarPoint,
  terminatorLine,
} from '../utils/sunTerminator'

const SPEED_MS = { slow: 900, normal: 520, fast: 300 } as const
type SpeedKey = keyof typeof SPEED_MS

/** Single radar layer — dual-buffer remove/add was a major source of flicker. */
const RADAR_ID = 'radar-live'
const RADAR_MAXZOOM = 7

/** Camera zoom range — high max keeps sharp tiles available when zooming in. */
const GLOBE_MIN_ZOOM = 0.7
const GLOBE_MAX_ZOOM = 6.5
/** Comfortable full-earth view after tile warm-up. */
const GLOBE_WORLD_ZOOM = 1.35
const GLOBE_WORLD_CENTER: [number, number] = [0, 8]
/** Large cache so high-zoom basemap/radar tiles stay loaded while spinning. */
const GLOBE_TILE_CACHE = 2200

/** Degrees of longitude advanced per animation frame while spinning (~full turn ~90s at 60fps). */
const SPIN_DEG_PER_FRAME = 0.12

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

const REGIONS: { id: string; label: string; center: [number, number]; zoom: number }[] = [
  { id: 'world', label: 'World', center: GLOBE_WORLD_CENTER, zoom: GLOBE_WORLD_ZOOM },
  { id: 'atl', label: 'Atlantic', center: [-55, 22], zoom: 2.6 },
  { id: 'epac', label: 'E. Pacific', center: [-120, 18], zoom: 2.7 },
  { id: 'cpac', label: 'C. Pacific', center: [-160, 20], zoom: 2.7 },
  { id: 'wpac', label: 'W. Pacific', center: [140, 18], zoom: 2.5 },
  { id: 'nio', label: 'N. Indian', center: [75, 15], zoom: 2.8 },
]

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
function isFrontOfGlobe(
  lon: number,
  lat: number,
  centerLng: number,
  centerLat: number,
  /** 0 = horizon; higher hides near-limb points that jitter */
  margin = 0.12,
): boolean {
  const toRad = Math.PI / 180
  const φ1 = centerLat * toRad
  const λ1 = centerLng * toRad
  const φ2 = lat * toRad
  const λ2 = lon * toRad
  // Great-circle cos(c) between camera target and point on unit sphere
  const cosC =
    Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1)
  return cosC > margin
}

function applySky(map: MapLibreMap, basemap: BasemapDef) {
  try {
    map.setSky({
      'sky-color': basemap.sky.sky,
      'sky-horizon-blend': 0.55,
      'horizon-color': basemap.sky.horizon,
      'horizon-fog-blend': 0.4,
      'fog-color': basemap.sky.fog,
      'fog-ground-blend': 0.12,
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
  onHint?.('Loading high-detail Earth…')
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

export function GlobalRadarGlobe() {
  const containerRef = useRef<HTMLDivElement>(null)
  const trackSvgRef = useRef<SVGSVGElement>(null)
  const dayNightCanvasRef = useRef<HTMLCanvasElement>(null)
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
  const basemapIdRef = useRef<BasemapId>('satellite')
  const swappingBasemapRef = useRef(false)
  const mountedRef = useRef(true)

  const [loading, setLoading] = useState(true)
  const [loadHint, setLoadHint] = useState('Loading Earth…')
  const [error, setError] = useState<string | null>(null)
  const [frames, setFrames] = useState<RadarFrame[]>([])
  const [frameIdx, setFrameIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<SpeedKey>('normal')
  const [opacity, setOpacity] = useState(0.78)
  const [nowIndex, setNowIndex] = useState(0)
  const [storms, setStorms] = useState<TropicalStorm[]>([])
  const [showTropical, setShowTropical] = useState(true)
  const [showRadar, setShowRadar] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [showIR, setShowIR] = useState(false)
  const [showDayNight, setShowDayNight] = useState(true)
  const [spinning, setSpinning] = useState(false)
  const [basemapId, setBasemapId] = useState<BasemapId>('satellite')
  const [activeRegion, setActiveRegion] = useState('world')

  opacityRef.current = opacity
  showRadarRef.current = showRadar
  showTropicalRef.current = showTropical
  showDayNightRef.current = showDayNight
  spinningRef.current = spinning
  basemapIdRef.current = basemapId

  const clearStormMarkers = useCallback(() => {
    for (const m of markersRef.current) m.remove()
    markersRef.current = []
  }, [])

  /**
   * Paint day/night onto a canvas over the globe (unproject screen samples).
   * Much more reliable than GeoJSON fill on MapLibre globe + visible on satellite.
   */
  const paintDayNight = useCallback((map: MapLibreMap, date = new Date()) => {
    const canvas = dayNightCanvasRef.current
    if (!canvas) return
    const mapCanvas = map.getCanvas()
    const w = mapCanvas.clientWidth || mapCanvas.width
    const h = mapCanvas.clientHeight || mapCanvas.height
    if (w < 2 || h < 2) return

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, w, h)

    if (!showDayNightRef.current) {
      canvas.style.display = 'none'
      return
    }
    canvas.style.display = ''

    const center = map.getCenter()
    const cLng = center.lng
    const cLat = center.lat
    const centerPt = map.project([cLng, cLat])

    // Estimate on-screen globe radius from limb samples
    let R = 0
    let nR = 0
    for (let b = 0; b < 360; b += 30) {
      const [lon, lat] = destinationPoint(cLng, cLat, 89.5, b)
      if (!isFrontOfGlobe(lon, lat, cLng, cLat, -0.08)) continue
      const p = map.project([lon, lat])
      const d = Math.hypot(p.x - centerPt.x, p.y - centerPt.y)
      if (d > 20 && d < Math.max(w, h) * 0.95) {
        R += d
        nR++
      }
    }
    R = nR ? R / nR : Math.min(w, h) * 0.42
    const pad = 4
    const R2 = (R + pad) * (R + pad)
    const step = R > 300 ? 5 : R > 180 ? 4 : 3

    // Night shade (multiply blend in CSS darkens basemap)
    ctx.fillStyle = 'rgba(4, 12, 40, 0.72)'
    const y0 = Math.max(0, Math.floor(centerPt.y - R - pad))
    const y1 = Math.min(h, Math.ceil(centerPt.y + R + pad))
    const x0 = Math.max(0, Math.floor(centerPt.x - R - pad))
    const x1 = Math.min(w, Math.ceil(centerPt.x + R + pad))

    for (let y = y0; y < y1; y += step) {
      for (let x = x0; x < x1; x += step) {
        const dx = x - centerPt.x
        const dy = y - centerPt.y
        if (dx * dx + dy * dy > R2) continue
        let ll: { lng: number; lat: number }
        try {
          ll = map.unproject([x, y])
        } catch {
          continue
        }
        if (!Number.isFinite(ll.lng) || !Number.isFinite(ll.lat)) continue
        // Drop sky / back-side unprojects
        if (!isFrontOfGlobe(ll.lng, ll.lat, cLng, cLat, 0.04)) continue
        if (!isNight(ll.lng, ll.lat, date)) continue
        ctx.fillRect(x - step * 0.5, y - step * 0.5, step + 0.6, step + 0.6)
      }
    }

    // Gold terminator
    const term = terminatorLine(date, 180)
    ctx.strokeStyle = 'rgba(253, 230, 138, 0.95)'
    ctx.lineWidth = 2.25
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    let pen = false
    let prevX = 0
    let prevY = 0
    for (const [lon, lat] of term) {
      if (!isFrontOfGlobe(lon, lat, cLng, cLat, 0.06)) {
        pen = false
        continue
      }
      const p = map.project([lon, lat])
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        pen = false
        continue
      }
      if (pen) {
        const jump = Math.hypot(p.x - prevX, p.y - prevY)
        if (jump > R * 0.55) pen = false
      }
      if (!pen) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
      pen = true
      prevX = p.x
      prevY = p.y
    }
    ctx.stroke()

    // Small sun marker when on the front
    const sun = subsolarPoint(date)
    if (isFrontOfGlobe(sun.lon, sun.lat, cLng, cLat, 0.15)) {
      const sp = map.project([sun.lon, sun.lat])
      if (Number.isFinite(sp.x) && Number.isFinite(sp.y)) {
        const g = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 14)
        g.addColorStop(0, 'rgba(254, 243, 199, 0.95)')
        g.addColorStop(0.45, 'rgba(251, 191, 36, 0.55)')
        g.addColorStop(1, 'rgba(251, 191, 36, 0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(sp.x, sp.y, 14, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }, [])

  /**
   * Project storm geometry onto the SVG layer + repaint day/night canvas.
   * - Coalesced to one paint per animation frame (keeps spin/drag smooth)
   * - Culls points on the back of the globe (stops path “teleport” glitches)
   * - Day/night always paints (independent of storms)
   */
  const scheduleOverlay = useCallback(() => {
    if (overlayRafRef.current != null) return
    overlayRafRef.current = window.requestAnimationFrame(() => {
      overlayRafRef.current = null
      const map = mapRef.current
      const svg = trackSvgRef.current
      const data = tropicalDataRef.current
      if (!map) return

      // Day/night every frame (works without storms)
      try {
        paintDayNight(map)
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
  }, [paintDayNight])

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
   */
  const startSpin = useCallback(() => {
    stopSpin()
    const tick = () => {
      if (!spinningRef.current) {
        spinRafRef.current = null
        return
      }
      const map = mapRef.current
      // Skip frames while the user is dragging/zooming so spin doesn't fight the camera
      if (map && !swappingBasemapRef.current && !userInteractingRef.current) {
        try {
          const c = map.getCenter()
          // Keep the user's latitude — only rotate under them
          const lon = normalizeLon(c.lng - SPIN_DEG_PER_FRAME)
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
      // Brief delay so inertia / wheel settle before spin resumes
      interactEndTimerRef.current = window.setTimeout(() => {
        userInteractingRef.current = false
        interactEndTimerRef.current = null
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
        setLoadHint('Building globe…')
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
        applySky(map, initial)

        // Load Earth at max zoom around the sphere so detail stays in the tile cache
        await warmGlobeTiles(map, () => cancelled, setLoadHint)
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
        scheduleOverlay()

        // Paint radar at world view, then briefly re-warm radar tiles at high zoom
        applyFrame(ni, true)
        try {
          const warmZ = Math.min(map.getMaxZoom(), RADAR_MAXZOOM)
          map.jumpTo({ center: GLOBE_WORLD_CENTER, zoom: warmZ, bearing: 0, pitch: 0 })
          await waitMs(220)
          if (!cancelled) {
            applyFrame(ni, true)
            await waitMs(180)
          }
          if (!cancelled) {
            map.jumpTo({
              center: GLOBE_WORLD_CENTER,
              zoom: GLOBE_WORLD_ZOOM,
              bearing: 0,
              pitch: 0,
            })
            applyFrame(ni, true)
          }
        } catch {
          /* non-fatal */
        }

        setLoadHint('Loading tropical cyclones…')
        try {
          const tropical = await fetchTropicalGlobeData()
          if (!cancelled && tropical && mapRef.current) {
            setStorms(tropical.storms)
            placeMarkers(mapRef.current, tropical, true)
            // Default camera: frame active storms when any exist
            if (tropical.storms.length) {
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
                  duration: prefersReducedMotion() ? 0 : 1400,
                  essential: true,
                })
              }
            }
          }
        } catch {
          /* optional */
        }
        if (cancelled) return

        setLoading(false)
        scheduleOverlay()
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load Earth')
        setLoading(false)
      }
    }

    void boot()

    return () => {
      cancelled = true
      mountedRef.current = false
      readyRef.current = false
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

  // Spin on/off — honor prefers-reduced-motion
  useEffect(() => {
    spinningRef.current = spinning
    if (spinning && prefersReducedMotion()) {
      setSpinning(false)
      return
    }
    if (spinning) startSpin()
    else {
      stopSpin()
      scheduleOverlay()
    }
    return () => stopSpin()
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

  useEffect(() => {
    showDayNightRef.current = showDayNight
    scheduleOverlay()
  }, [showDayNight, scheduleOverlay])

  // Play / pause — single timer, no double-start
  useEffect(() => {
    if (playing) {
      startPlayTimer()
    } else {
      stopPlayTimer()
    }
    return () => stopPlayTimer()
  }, [playing, startPlayTimer, stopPlayTimer])

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

      applySky(map, def)
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
    scheduleOverlay()
    if (wasSpinning) setSpinning(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showLabels/showIR at swap time
  }, [basemapId, applyFrame, scheduleOverlay, showLabels, showIR])

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
    <div className={`globe-stage globe-theme-${basemapId}`}>
      <div
        ref={containerRef}
        className="globe-canvas"
        role="img"
        aria-label="3D Earth with global radar"
      />
      <canvas
        ref={dayNightCanvasRef}
        className="globe-daynight-canvas"
        aria-hidden="true"
      />
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

      <div className="globe-side-tools" aria-label="Globe tools">
        <div className="globe-basemap-row" role="group" aria-label="Map style">
          {(Object.keys(BASEMAPS) as BasemapId[]).map((id) => (
            <button
              key={id}
              type="button"
              className={`chip-btn globe-basemap-btn ${basemapId === id ? 'active' : ''}`}
              onClick={() => setBasemapId(id)}
              disabled={loading}
            >
              {BASEMAPS[id].label}
            </button>
          ))}
        </div>
        <div className="globe-layer-row" role="group" aria-label="Layers">
          <button
            type="button"
            className={`chip-btn ${showRadar ? 'active' : ''}`}
            onClick={() => setShowRadar((v) => !v)}
            aria-pressed={showRadar}
            disabled={loading}
          >
            Radar
          </button>
          <button
            type="button"
            className={`chip-btn ${showIR ? 'active' : ''}`}
            onClick={() => setShowIR((v) => !v)}
            aria-pressed={showIR}
            disabled={loading}
            title="Cloud tops / clean IR (NASA GIBS)"
          >
            IR
          </button>
          <button
            type="button"
            className={`chip-btn ${showDayNight ? 'active' : ''}`}
            onClick={() => setShowDayNight((v) => !v)}
            aria-pressed={showDayNight}
            disabled={loading}
            title="Day / night terminator"
          >
            Day/Night
          </button>
          <button
            type="button"
            className={`chip-btn ${showTropical ? 'active' : ''}`}
            onClick={() => setShowTropical((v) => !v)}
            aria-pressed={showTropical}
            disabled={loading || !storms.length}
          >
            Storms
          </button>
          <button
            type="button"
            className={`chip-btn ${showLabels ? 'active' : ''}`}
            onClick={() => setShowLabels((v) => !v)}
            aria-pressed={showLabels}
            disabled={loading}
          >
            Labels
          </button>
          <button
            type="button"
            className={`chip-btn ${spinning ? 'active' : ''}`}
            onClick={() => setSpinning((v) => !v)}
            aria-pressed={spinning}
            disabled={loading || prefersReducedMotion()}
            title={
              prefersReducedMotion()
                ? 'Spin disabled (reduced motion preference)'
                : 'Rotate Earth around the poles (equator spins past)'
            }
          >
            Spin
          </button>
        </div>
        <div className="globe-region-row" role="group" aria-label="Jump to region">
          {REGIONS.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`chip-btn globe-region-btn ${activeRegion === r.id ? 'active' : ''}`}
              onClick={() => flyRegion(r.id)}
              disabled={loading}
            >
              {r.label}
            </button>
          ))}
          {storms.length > 0 && (
            <button
              type="button"
              className={`chip-btn globe-region-btn ${activeRegion === 'storms' ? 'active' : ''}`}
              onClick={focusStorms}
              disabled={loading}
            >
              Active storms
            </button>
          )}
        </div>
      </div>

      <div className="globe-legend" aria-hidden={loading}>
        <div className="globe-legend-title">Legend</div>
        <div className="globe-legend-item">
          <span className="globe-legend-swatch globe-legend-radar" />
          Global precip radar
        </div>
        {showIR && (
          <div className="globe-legend-item">
            <span className="globe-legend-swatch globe-legend-ir" />
            Cloud IR
          </div>
        )}
        {showDayNight && (
          <div className="globe-legend-item">
            <span className="globe-legend-swatch globe-legend-night" />
            Night side
          </div>
        )}
        <div className="globe-legend-item">
          <span className="globe-legend-swatch globe-legend-past" />
          Past track
        </div>
        <div className="globe-legend-item">
          <span className="globe-legend-swatch globe-legend-fcst" />
          Forecast track
        </div>
        <div className="globe-legend-item">
          <span className="globe-legend-swatch globe-legend-cone" />
          Forecast cone
        </div>
      </div>

      {storms.length > 0 && (
        <div className="globe-storm-panel" role="region" aria-label="Active tropical cyclones">
          <div className="globe-storm-panel-head">
            <strong>🌀 Active storms · {storms.length}</strong>
            <button
              type="button"
              className={`chip-btn ${showTropical ? 'active' : ''}`}
              onClick={() => setShowTropical((v) => !v)}
              aria-pressed={showTropical}
            >
              {showTropical ? 'Hide' : 'Show'}
            </button>
          </div>
          <ul className="globe-storm-list">
            {storms.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="globe-storm-card"
                  onClick={() => {
                    setSpinning(false)
                    setActiveRegion('storms')
                    mapRef.current?.easeTo({
                      center: [s.lon, s.lat],
                      zoom: 3.4,
                      bearing: 0,
                      pitch: 0,
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
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loading && storms.length === 0 && (
        <div className="globe-quiet-badge">No active NHC tropical cyclones</div>
      )}

      <div className="globe-controls" role="toolbar" aria-label="Radar playback">
        <div className="globe-timeline-wrap">
          <input
            type="range"
            className="globe-timeline"
            min={0}
            max={Math.max(0, frames.length - 1)}
            step={1}
            value={frameIdx}
            disabled={!frames.length || loading}
            onChange={(e) => scrub(Number(e.target.value))}
            aria-label="Radar frame timeline"
            style={{ ['--globe-progress' as string]: `${progress * 100}%` } as Record<string, string>}
          />
          <div className="globe-timeline-marks">
            <span>Past</span>
            <span className={isNow ? 'is-active' : ''}>Now</span>
            {frames.length > nowIndex + 1 ? (
              <span className={isForecast ? 'is-active' : ''}>Forecast</span>
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
            disabled={!frames.length || loading}
            aria-pressed={playing}
          >
            {playing ? '❚❚ Pause' : '▶ Play'}
          </button>
          <button type="button" className="chip-btn" onClick={() => step(-1)} disabled={!frames.length || loading}>
            ‹
          </button>
          <button type="button" className="chip-btn" onClick={() => step(1)} disabled={!frames.length || loading}>
            ›
          </button>
          <button
            type="button"
            className={`chip-btn ${isNow ? 'active' : ''}`}
            onClick={goNow}
            disabled={!frames.length || loading}
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
          <span className="globe-frame-count">
            {frames.length ? `${frameIdx + 1}/${frames.length}` : '—'}
          </span>
        </div>
        <div className="globe-controls-meta">
          <span className="globe-time">
            {frame ? formatRadarTime(frame.time) : '—'}
            {isNow && <em> · now</em>}
            {isForecast && <em> · forecast</em>}
          </span>
          <label className="globe-opacity">
            Radar
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
        <p className="globe-hint">
          Drag to turn the globe · Spin = rotate around the poles (equator slides past) · white past ·
          pink forecast
          {storms.length ? ` · ${storms.length} storm${storms.length > 1 ? 's' : ''}` : ''}
        </p>
      </div>
    </div>
  )
}
