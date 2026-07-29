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
const RADAR_MAXZOOM = 7

type BasemapId = 'satellite' | 'voyager' | 'light' | 'dark'

type BasemapDef = {
  id: BasemapId
  label: string
  tiles: string[]
  labels?: string[]
  maxzoom: number
  attribution: string
  /** Atmosphere tint for globe sky */
  sky: {
    sky: string
    horizon: string
    fog: string
  }
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
    maxzoom: 12,
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
    maxzoom: 10,
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
    maxzoom: 10,
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
    maxzoom: 10,
    attribution: '© OpenStreetMap · © CARTO',
    sky: { sky: '#020617', horizon: '#0f172a', fog: '#020617' },
  },
}

const REGIONS: { id: string; label: string; center: [number, number]; zoom: number }[] = [
  { id: 'world', label: 'World', center: [0, 12], zoom: 1.2 },
  { id: 'atl', label: 'Atlantic', center: [-55, 22], zoom: 2.4 },
  { id: 'epac', label: 'E. Pacific', center: [-120, 18], zoom: 2.5 },
  { id: 'cpac', label: 'C. Pacific', center: [-160, 20], zoom: 2.5 },
  { id: 'wpac', label: 'W. Pacific', center: [140, 18], zoom: 2.3 },
  { id: 'nio', label: 'N. Indian', center: [75, 15], zoom: 2.6 },
]

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
      paint: {
        'raster-opacity': 1,
        'raster-fade-duration': 0,
      },
    },
  ]
  if (basemap.labels?.length) {
    sources.labels = {
      type: 'raster',
      tiles: basemap.labels,
      tileSize: 256,
      attribution: '© CARTO',
      maxzoom: Math.min(basemap.maxzoom, 10),
    }
    layers.push({
      id: 'labels',
      type: 'raster',
      source: 'labels',
      paint: {
        'raster-opacity': 0.85,
        'raster-fade-duration': 0,
      },
    })
  }
  return {
    version: 8 as const,
    name: 'Solara Globe',
    sources,
    layers,
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
    map.once('idle', onIdle)
    try {
      map.triggerRepaint()
    } catch {
      /* ignore */
    }
  })
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

export function GlobalRadarGlobe() {
  const containerRef = useRef<HTMLDivElement>(null)
  const trackSvgRef = useRef<SVGSVGElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const playingRef = useRef(false)
  const frameIdxRef = useRef(0)
  const framesRef = useRef<RadarFrame[]>([])
  const hostRef = useRef('https://tilecache.rainviewer.com')
  const opacityRef = useRef(0.78)
  const showRadarRef = useRef(true)
  const timerRef = useRef<number | null>(null)
  const spinRef = useRef<number | null>(null)
  const bufRef = useRef<0 | 1>(0)
  const readyRef = useRef(false)
  const tropicalDataRef = useRef<TropicalGlobeData | null>(null)
  const showTropicalRef = useRef(true)
  const basemapRef = useRef<BasemapId>('satellite')
  const markersRef = useRef<maplibregl.Marker[]>([])
  const userMovedRef = useRef(false)

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
  const [spinning, setSpinning] = useState(false)
  const [basemapId, setBasemapId] = useState<BasemapId>('satellite')
  const [activeRegion, setActiveRegion] = useState('world')

  opacityRef.current = opacity
  showRadarRef.current = showRadar
  showTropicalRef.current = showTropical
  basemapRef.current = basemapId

  const clearStormMarkers = useCallback(() => {
    for (const m of markersRef.current) m.remove()
    markersRef.current = []
  }, [])

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

      if (s.track && s.track.length >= 2) {
        const d = projectLine(s.track)
        if (d.includes('L')) {
          nodes.push(`<path class="globe-svg-fcst-glow" d="${d}" fill="none" />`)
          nodes.push(`<path class="globe-svg-fcst" d="${d}" fill="none" />`)
        }
      }

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
        ]
          .filter(Boolean)
          .join(' · ')
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          userMovedRef.current = true
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

  /** Radar sits above basemap, under labels so place names stay readable. */
  const placeRadarLayer = useCallback((map: MapLibreMap, layerId: string) => {
    if (!map.getLayer(layerId)) return
    try {
      if (map.getLayer('labels')) {
        map.moveLayer(layerId, 'labels')
      } else {
        map.moveLayer(layerId)
      }
    } catch {
      /* ignore */
    }
  }, [])

  const applyFrame = useCallback(
    (idx: number, op?: number) => {
      const map = mapRef.current
      const list = framesRef.current
      if (!map || !readyRef.current || !list.length) return
      if (!map.isStyleLoaded()) return

      const frame = list[Math.max(0, Math.min(idx, list.length - 1))]
      if (!frame) return

      const opacityVal = showRadarRef.current ? (op ?? opacityRef.current) : 0
      const url = rainViewerTileUrl(hostRef.current, frame.key)
      if (!url.includes('{z}')) return

      const nextBuf: 0 | 1 = bufRef.current === 0 ? 1 : 0
      const nextId = nextBuf === 0 ? RADAR_A : RADAR_B
      const prevId = bufRef.current === 0 ? RADAR_A : RADAR_B

      try {
        if (map.getLayer(nextId)) map.removeLayer(nextId)
        if (map.getSource(nextId)) map.removeSource(nextId)

        map.addSource(nextId, {
          type: 'raster',
          tiles: [url],
          tileSize: 256,
          maxzoom: RADAR_MAXZOOM,
          attribution: 'Radar © RainViewer',
        })

        const beforeId = map.getLayer('labels') ? 'labels' : undefined
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
          beforeId,
        )

        if (map.getLayer(prevId)) {
          map.setPaintProperty(prevId, 'raster-opacity', 0)
        }

        bufRef.current = nextBuf
        placeRadarLayer(map, nextId)
        map.triggerRepaint()
      } catch (e) {
        console.warn('[globe] applyFrame failed', e)
      }
    },
    [placeRadarLayer],
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

  const stopSpin = useCallback(() => {
    if (spinRef.current != null) {
      window.clearInterval(spinRef.current)
      spinRef.current = null
    }
  }, [])

  const startSpin = useCallback(() => {
    stopSpin()
    spinRef.current = window.setInterval(() => {
      const map = mapRef.current
      if (!map) return
      const b = map.getBearing()
      map.setBearing(b - 0.12)
    }, 50)
  }, [stopSpin])

  const flyRegion = useCallback((regionId: string) => {
    const map = mapRef.current
    const r = REGIONS.find((x) => x.id === regionId)
    if (!map || !r) return
    userMovedRef.current = true
    setActiveRegion(regionId)
    map.easeTo({ center: r.center, zoom: r.zoom, duration: 1200, bearing: 0, pitch: 0 })
  }, [])

  const focusStorms = useCallback(() => {
    const map = mapRef.current
    const list = storms
    if (!map || !list.length) return
    userMovedRef.current = true
    setActiveRegion('storms')
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
    const minLon = Math.min(...lons)
    const maxLon = Math.max(...lons)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const span = Math.max(maxLon - minLon, maxLat - minLat, 8)
    const z = span > 50 ? 1.5 : span > 25 ? 2.1 : span > 12 ? 2.6 : 3.2
    map.easeTo({
      center: [(minLon + maxLon) / 2, (minLat + maxLat) / 2],
      zoom: z,
      duration: 1400,
    })
  }, [storms])

  // Init map
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let cancelled = false
    const initial = BASEMAPS.satellite

    const map = new maplibregl.Map({
      container: el,
      style: buildStyle(initial),
      center: [0, 12],
      zoom: 1.2,
      minZoom: 0.6,
      maxZoom: 6,
      pitch: 0,
      bearing: 0,
      maxTileCacheSize: 700,
      fadeDuration: 0,
      refreshExpiredTiles: false,
      attributionControl: { compact: true },
      dragRotate: true,
      touchPitch: false,
      renderWorldCopies: false,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right')

    const onUserMove = () => {
      userMovedRef.current = true
    }
    map.on('dragstart', onUserMove)
    map.on('zoomstart', onUserMove)

    const ro = new ResizeObserver(() => {
      try {
        map.resize()
        redrawTrackOverlay()
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
          /* flat fallback */
        }
        applySky(map, initial)

        map.jumpTo({ center: [0, 12], zoom: 1.2, bearing: 0, pitch: 0 })
        setLoadHint('Loading world map…')
        await waitForIdle(map, 12000)
        if (cancelled) return

        setLoadHint('Loading global radar…')
        const { host, frames: fr, nowIndex: ni } = await loadGlobalRadarLoop({ maxPast: 14 })
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

        setLoadHint('Painting radar…')
        await waitForIdle(map, 8000)
        if (cancelled) return
        applyFrame(ni, opacityRef.current)

        setLoadHint('Loading tropical cyclones…')
        try {
          const tropical = await fetchTropicalGlobeData()
          if (!cancelled && tropical && mapRef.current) {
            setStorms(tropical.storms)
            applyTropicalLayers(mapRef.current, tropical, true)
            applyFrame(frameIdxRef.current, opacityRef.current)
          }
        } catch {
          /* tropical optional */
        }
        if (cancelled) return

        setLoading(false)
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
      stopSpin()
      clearStormMarkers()
      ro.disconnect()
      try {
        map.off('move', redrawTrackOverlay)
        map.off('zoom', redrawTrackOverlay)
        map.off('rotate', redrawTrackOverlay)
        map.off('pitch', redrawTrackOverlay)
        map.off('resize', redrawTrackOverlay)
        map.off('dragstart', onUserMove)
        map.off('zoomstart', onUserMove)
      } catch {
        /* ignore */
      }
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, [])

  // Opacity / radar visibility
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const visibleId = bufRef.current === 0 ? RADAR_A : RADAR_B
    if (map.getLayer(visibleId)) {
      map.setPaintProperty(visibleId, 'raster-opacity', showRadar ? opacity : 0)
    }
  }, [opacity, showRadar])

  // Labels toggle
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('labels')) return
    try {
      map.setLayoutProperty('labels', 'visibility', showLabels ? 'visible' : 'none')
    } catch {
      /* ignore */
    }
  }, [showLabels])

  // Tropical toggle
  useEffect(() => {
    showTropicalRef.current = showTropical
    for (const m of markersRef.current) {
      const el = m.getElement()
      if (el) el.style.display = showTropical ? '' : 'none'
    }
    redrawTrackOverlay()
  }, [showTropical, redrawTrackOverlay])

  // Spin
  useEffect(() => {
    if (spinning) startSpin()
    else stopSpin()
    return () => stopSpin()
  }, [spinning, startSpin, stopSpin])

  // Play / pause
  useEffect(() => {
    playingRef.current = playing
    if (playing) {
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

  useEffect(() => {
    if (playing) startLoop()
  }, [speed, playing, startLoop])

  // Basemap switch — rebuild basemap + labels sources, keep radar
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const def = BASEMAPS[basemapId]

    const swap = async () => {
      try {
        // Tear down radar buffers (re-added after basemap swap)
        for (const id of [RADAR_A, RADAR_B]) {
          if (map.getLayer(id)) map.removeLayer(id)
          if (map.getSource(id)) map.removeSource(id)
        }
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
            maxzoom: Math.min(def.maxzoom, 10),
            attribution: '© CARTO',
          })
          map.addLayer({
            id: 'labels',
            type: 'raster',
            source: 'labels',
            paint: {
              'raster-opacity': 0.85,
              'raster-fade-duration': 0,
            },
            layout: {
              visibility: showLabels ? 'visible' : 'none',
            },
          })
        }

        applySky(map, def)
        bufRef.current = 0
        applyFrame(frameIdxRef.current, opacityRef.current)
        redrawTrackOverlay()
      } catch (e) {
        console.warn('[globe] basemap swap failed', e)
      }
    }

    void swap()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showLabels read at swap time
  }, [basemapId, applyFrame, redrawTrackOverlay])

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

      {/* Top-right tools under nav control */}
      <div className="globe-side-tools" aria-label="Globe tools">
        <div className="globe-basemap-row" role="group" aria-label="Map style">
          {(Object.keys(BASEMAPS) as BasemapId[]).map((id) => (
            <button
              key={id}
              type="button"
              className={`chip-btn globe-basemap-btn ${basemapId === id ? 'active' : ''}`}
              onClick={() => setBasemapId(id)}
              disabled={loading}
              title={`${BASEMAPS[id].label} basemap`}
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
            disabled={loading}
            title="Slow auto-rotate"
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

      {/* Legend */}
      <div className="globe-legend" aria-hidden={loading}>
        <div className="globe-legend-title">Legend</div>
        <div className="globe-legend-item">
          <span className="globe-legend-swatch globe-legend-radar" />
          Global precip radar
        </div>
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
                    userMovedRef.current = true
                    setActiveRegion('storms')
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
                        s.track && s.track.length > 1 ? 'Forecast' : null,
                      ]
                        .filter(Boolean)
                        .join(' + ')}
                    </span>
                  ) : null}
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
            style={
              {
                ['--globe-progress' as string]: `${progress * 100}%`,
              } as Record<string, string>
            }
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
          Drag to rotate · scroll to zoom · satellite / color maps · white = past · pink = forecast
          {storms.length ? ` · ${storms.length} active storm${storms.length > 1 ? 's' : ''}` : ''}
        </p>
      </div>
    </div>
  )
}
