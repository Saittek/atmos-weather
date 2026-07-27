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
  getMapboxToken,
  mapboxStyleTileUrl,
  defaultSourceForLocation,
  prefersMapboxBasemap,
  usesChaserColors,
  isNexradMosaicRegion,
  isCanadaRadarRegion,
  frameUsesWms,
  ecccWmsOptions,
  ECCC_GEOMET_WMS,
  RADAR_SOURCES,
  type RadarFrame,
  type RadarSourceId,
} from '../api/radar'
import { formatRadarTime } from '../utils/format'
import type { Units } from '../utils/format'
import type { LocationResult } from '../api/types'
import type { StormWarning } from '../api/severeLayers'
import { MapOverlays, OVERLAY_OPTIONS, type OverlayMode } from './MapOverlays'
import { FireSmokeLayers } from './FireSmokeLayers'
import { HomeMapMarker } from './HomeMapMarker'
import {
  SevereMapLayers,
  type MapFocusRequest,
  type SevereLayerStats,
  type SevereLayerToggles,
} from './SevereMapLayers'
import { isConstrainedDevice as detectConstrained } from '../utils/device'

interface Props {
  lat: number
  lon: number
  placeName: string
  units: Units
  severeMode?: boolean
  mapId?: string
  pageMode?: boolean
  /** Default-on severe overlays (Storm Chasers desk) */
  chaserOverlays?: boolean
  /** Fly map to threat */
  focusRequest?: MapFocusRequest | null
  /** Optional preloaded warning polygons */
  threatPolygons?: StormWarning[] | null
  /** Exact home pin on the map */
  homeLocation?: LocationResult | null
}

type Basemap = 'dark' | 'street' | 'sat' | 'mapbox_dark' | 'mapbox_streets' | 'mapbox_sat'

function buildBasemaps(mapboxToken: string | null): Record<Basemap, { url: string; attr: string; name: string }> {
  const free: Record<'dark' | 'street' | 'sat', { url: string; attr: string; name: string }> = {
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
  if (!mapboxToken) {
    return {
      ...free,
      mapbox_dark: { ...free.dark, name: 'Mapbox Dark (add token)' },
      mapbox_streets: { ...free.street, name: 'Mapbox Streets (add token)' },
      mapbox_sat: { ...free.sat, name: 'Mapbox Satellite (add token)' },
    }
  }
  const attr = '© Mapbox © OpenStreetMap'
  return {
    ...free,
    mapbox_dark: {
      name: 'Mapbox Dark',
      url: mapboxStyleTileUrl('dark-v11', mapboxToken),
      attr,
    },
    mapbox_streets: {
      name: 'Mapbox Streets',
      url: mapboxStyleTileUrl('streets-v12', mapboxToken),
      attr,
    },
    mapbox_sat: {
      name: 'Mapbox Satellite',
      url: mapboxStyleTileUrl('satellite-streets-v12', mapboxToken),
      attr,
    },
  }
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
 * Smooth ECCC MSC GeoMet WMS loop — dual L.tileLayer.wms with TIME + crossfade.
 */
function SmoothWmsRadarLoop({
  frames,
  frameIdx,
  opacity,
  attribution,
  fadeMs,
}: {
  frames: RadarFrame[]
  frameIdx: number
  opacity: number
  attribution: string
  fadeMs: number
}) {
  const map = useMap()
  const aRef = useRef<L.TileLayer.WMS | null>(null)
  const bRef = useRef<L.TileLayer.WMS | null>(null)
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

  const makeWms = (zIndex: number) =>
    L.tileLayer.wms(ECCC_GEOMET_WMS, {
      layers: 'RADAR_1KM_RRAI',
      styles: 'RADARURPPRECIPR14-LINEAR',
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      opacity: 0,
      zIndex,
      maxZoom: 12,
      maxNativeZoom: 9,
      className: 'radar-tiles radar-chaser-colors',
      attribution,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 1,
      errorTileUrl: EMPTY_TILE,
    } as L.WMSOptions)

  useEffect(() => {
    const a = makeWms(200)
    const b = makeWms(201)
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
  }, [map, attribution])

  useEffect(() => {
    const a = aRef.current
    const b = bRef.current
    if (!a || !b || !frames.length) return
    const frame = frames[frameIdx]
    if (!frame) return
    const opts = ecccWmsOptions(frame)
    if (!opts) return
    const targetOp = opacityRef.current

    const apply = (layer: L.TileLayer.WMS) => {
      layer.setParams({
        layers: opts.layers,
        styles: opts.styles,
        time: opts.time,
      } as L.WMSParams)
    }

    if (lastIdx.current < 0) {
      cancelRaf()
      apply(a)
      a.setOpacity(targetOp)
      a.setZIndex(210)
      b.setOpacity(0)
      b.setZIndex(200)
      activeIsA.current = true
      lastIdx.current = frameIdx
      return
    }
    if (lastIdx.current === frameIdx) return

    cancelRaf()
    const incoming = activeIsA.current ? b : a
    const outgoing = activeIsA.current ? a : b
    apply(incoming)
    incoming.setOpacity(0)
    incoming.setZIndex(211)
    outgoing.setZIndex(210)

    const start = performance.now()
    const duration = Math.max(80, fadeMs)

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const e = easeInOut(t)
      incoming.setOpacity(targetOp * e)
      outgoing.setOpacity(targetOp * (1 - e))
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        outgoing.setOpacity(0)
        incoming.setOpacity(targetOp)
        activeIsA.current = !activeIsA.current
        lastIdx.current = frameIdx
        rafRef.current = null
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [frameIdx, frames, fadeMs])

  useEffect(() => {
    const a = aRef.current
    const b = bRef.current
    if (!a || !b) return
    const active = activeIsA.current ? a : b
    const idle = activeIsA.current ? b : a
    active.setOpacity(opacity)
    if (lastIdx.current >= 0) idle.setOpacity(0)
  }, [opacity])

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
      className: 'radar-tiles radar-fade-a radar-chaser-colors',
    })
    const b = makeTileLayer(EMPTY_TILE, {
      opacity: 0,
      maxNativeZoom,
      zIndex: 201,
      attribution,
      className: 'radar-tiles radar-fade-b radar-chaser-colors',
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
  chaserOverlays = false,
  focusRequest = null,
  threatPolygons = null,
  homeLocation = null,
}: Props) {
  void _units
  const lite = useMemo(() => isConstrainedDevice(), [])
  const mapboxToken = useMemo(() => getMapboxToken(), [])
  const BASEMAPS = useMemo(() => buildBasemaps(mapboxToken), [mapboxToken])
  const [sourceId, setSourceId] = useState<RadarSourceId>(() =>
    defaultSourceForLocation(lat, lon),
  )
  const [frames, setFrames] = useState<RadarFrame[]>([])
  /** Start on latest (current) frame — set after load */
  const [frameIdx, setFrameIdx] = useState(0)
  // Always start paused — user hits play to animate the loop
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<SpeedKey>(() =>
    isConstrainedDevice() ? 'slow' : 'normal',
  )
  const [opacity, setOpacity] = useState(0.82)
  const [basemap, setBasemap] = useState<Basemap>(() =>
    getMapboxToken() ? 'mapbox_dark' : 'dark',
  )
  const chaserStyle = usesChaserColors(sourceId)
  const [showFires, setShowFires] = useState(false)
  const [overlay, setOverlay] = useState<OverlayMode>('none')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rvHost, setRvHost] = useState('https://tilecache.rainviewer.com')
  const [fullscreen, setFullscreen] = useState(false)
  /** Pause tile loop when map is scrolled off-screen (big mobile battery win) */
  const [inView, setInView] = useState(true)
  const wrapRef = useRef<HTMLElement>(null)
  /** Remember play intent across tab hide / off-screen (false until user hits ▶) */
  const wantPlayRef = useRef(false)

  const usRegion = isNexradMosaicRegion(lat, lon)
  const caRegion = isCanadaRadarRegion(lat, lon)
  const [severeToggles, setSevereToggles] = useState<SevereLayerToggles>(() => ({
    warnings: chaserOverlays || Boolean(severeMode),
    reports: chaserOverlays || Boolean(severeMode),
    outlook: chaserOverlays,
    // Aggressive chaser defaults: SRM + storm tracks on for US NEXRAD coverage
    velocity: chaserOverlays && isNexradMosaicRegion(lat, lon),
    tracks: chaserOverlays && isNexradMosaicRegion(lat, lon),
  }))
  const [severeStats, setSevereStats] = useState<SevereLayerStats | null>(null)
  const onSevereStats = useCallback((s: SevereLayerStats) => setSevereStats(s), [])

  const meta = getSourceMeta(sourceId)
  const base = BASEMAPS[basemap] ?? BASEMAPS.dark
  const frame = frames[frameIdx] ?? null
  const useWms = frameUsesWms(sourceId, frame)
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

  // Chaser / Mapbox sources: dark Mapbox basemap when token available
  useEffect(() => {
    if (prefersMapboxBasemap(sourceId) && mapboxToken) {
      setBasemap('mapbox_dark')
    }
  }, [sourceId, mapboxToken])

  // Region-aware auto source: keep storm_chaser (picks ECCC / NEXRAD / global)
  useEffect(() => {
    setSourceId((prev) => {
      if (
        prev === 'storm_chaser' ||
        prev === 'global_loop' ||
        prev === 'mapbox_radar' ||
        prev === 'eccc_radar' ||
        prev === 'us_nexrad_loop'
      ) {
        return defaultSourceForLocation(lat, lon)
      }
      return prev
    })
  }, [lat, lon])

  // When chaser desk moves into / out of US coverage, refresh velocity/tracks defaults
  useEffect(() => {
    if (!chaserOverlays) return
    setSevereToggles((t) => ({
      ...t,
      velocity: usRegion ? true : false,
      tracks: usRegion ? true : false,
    }))
  }, [chaserOverlays, usRegion])

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const needsRv =
        sourceId === 'global_loop' ||
        sourceId === 'mapbox_radar' ||
        (sourceId === 'storm_chaser' &&
          !isCanadaRadarRegion(lat, lon) &&
          !isNexradMosaicRegion(lat, lon))
      if (needsRv) {
        try {
          const maps = await fetchRainViewerMaps()
          setRvHost(maps.host || 'https://tilecache.rainviewer.com')
        } catch {
          /* ECCC/NEXRAD path may still work */
        }
      }
      if (prefersMapboxBasemap(sourceId) && !mapboxToken) {
        console.info(
          'Solara: set VITE_MAPBOX_TOKEN for Mapbox basemap (radar still works)',
        )
      }
      const next = await loadFrames(sourceId, {
        lite:
          lite &&
          sourceId !== 'global_loop' &&
          sourceId !== 'mapbox_radar' &&
          sourceId !== 'storm_chaser' &&
          sourceId !== 'eccc_radar' &&
          sourceId !== 'us_nexrad_loop',
        lat,
        lon,
      })
      if (!next.length) throw new Error('No frames available for this source')
      setFrames(next)
      // Show the most recent frame (current time) while paused
      setFrameIdx(next.length - 1)
    } catch (e) {
      setFrames([])
      setError(e instanceof Error ? e.message : 'Radar failed to load')
    } finally {
      setLoading(false)
    }
  }, [sourceId, lite, mapboxToken, lat, lon])

  useEffect(() => {
    void reload()
    // Paused radar: rare refresh (latest frame only). Playing: fresher loop.
    const mins = playing ? (lite ? 5 : 4) : lite ? 12 : 8
    const id = window.setInterval(() => {
      if (document.hidden) return
      if (!inView && !playing) return
      void reload()
    }, mins * 60 * 1000)
    return () => window.clearInterval(id)
  }, [reload, lite, playing, inView])

  useEffect(() => {
    // Severe / chaser: clearer radar — still start paused on the latest frame
    if (severeMode || chaserOverlays) {
      setOpacity((o) => Math.max(o, 0.82))
    }
  }, [severeMode, chaserOverlays])

  // Track whether the map is actually on screen
  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting)
        setInView(visible)
      },
      { root: null, rootMargin: '80px 0px', threshold: 0.05 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        // Pause without clearing user intent
        setPlaying(false)
      } else if (wantPlayRef.current && inView && overlay === 'none') {
        setPlaying(true)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [inView, overlay])

  // Resume/pause when scrolling map into / out of view
  useEffect(() => {
    if (document.hidden || overlay !== 'none') return
    if (inView && wantPlayRef.current) setPlaying(true)
    else if (!inView) setPlaying(false)
  }, [inView, overlay])

  // Pause tile radar while Ventusky model map is open (saves bandwidth)
  useEffect(() => {
    if (overlay !== 'none') setPlaying(false)
  }, [overlay])

  // Playback: hold + crossfade timing (advance after fade+hold)
  useEffect(() => {
    if (overlay !== 'none') return
    if (!playing || !inView || document.hidden || !meta.animated || frames.length < 2)
      return
    const hold = frameIdx >= frames.length - 1 ? holdMs + 650 : holdMs
    const t = window.setTimeout(() => {
      setFrameIdx((i) => (i + 1) % frames.length)
    }, hold + fadeMs)
    return () => window.clearTimeout(t)
  }, [playing, holdMs, fadeMs, frameIdx, frames.length, meta.animated, overlay, inView])

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
      className={`panel radar-panel ${fullscreen ? 'is-fullscreen' : ''} ${pageMode ? 'radar-page-mode' : ''} ${severeMode ? 'severe-radar' : ''} ${ventuskyOn ? 'has-ventusky' : ''} ${compact ? 'radar-compact' : ''} ${chaserStyle ? 'radar-chaser-style' : ''}`}
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
              key={`${mapId}-${lat.toFixed(2)}-${lon.toFixed(2)}-${basemap}`}
              center={[lat, lon]}
              zoom={pageMode ? 6 : 7}
              minZoom={3}
              maxZoom={12}
              className="radar-map"
              zoomControl
              attributionControl
              style={{ width: '100%', height: '100%' }}
            >
              <TileLayer
                url={base.url}
                attribution={base.attr}
                maxZoom={19}
                tileSize={256}
                zoomOffset={0}
              />

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

              {meta.animated && frames.length > 0 && useWms ? (
                <SmoothWmsRadarLoop
                  frames={frames}
                  frameIdx={frameIdx}
                  opacity={opacity}
                  attribution={meta.attribution}
                  fadeMs={fadeMs}
                />
              ) : meta.animated && frames.length > 0 ? (
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
                  className={
                    chaserStyle
                      ? 'radar-tiles radar-chaser-colors'
                      : 'radar-tiles'
                  }
                />
              )}

              <FireSmokeLayers
                lat={lat}
                lon={lon}
                showFires={showFires}
                showSmoke={false}
              />

              {(severeToggles.warnings ||
                severeToggles.reports ||
                severeToggles.outlook ||
                severeToggles.velocity ||
                severeToggles.tracks ||
                focusRequest) && (
                <SevereMapLayers
                  lat={lat}
                  lon={lon}
                  toggles={severeToggles}
                  wide={pageMode || chaserOverlays}
                  onStats={onSevereStats}
                  focus={focusRequest}
                  externalWarnings={threatPolygons}
                />
              )}

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
              <HomeMapMarker home={homeLocation} />
              <MapRecenter lat={lat} lon={lon} />
              <MapSizeFix />
            </MapContainer>

            <div className="radar-legend">
              <span>Light</span>
              <div
                className={`legend-gradient ${chaserStyle ? 'legend-chaser' : ''}`}
                style={{
                  background:
                    sourceId.includes('goes') || sourceId === 'nasa_ir'
                      ? 'linear-gradient(90deg,#0b1220,#4b5563,#e5e7eb,#fef3c7,#f97316)'
                      : // NEXRAD / WeatherWise-like reflectivity ramp
                        'linear-gradient(90deg,#04e9e7,#019ff4,#02fd02,#f5f805,#fd9a04,#fd0000,#d400d4,#ad90f0)',
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
              onClick={() => {
                setPlaying((p) => {
                  const next = !p
                  wantPlayRef.current = next
                  // Starting play from the latest frame → begin loop at the first frame
                  if (next && frames.length > 1 && frameIdx >= frames.length - 1) {
                    setFrameIdx(0)
                  }
                  return next
                })
              }}
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
                wantPlayRef.current = false
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
              {(Object.keys(BASEMAPS) as Basemap[])
                .filter((k) => {
                  // Hide Mapbox basemap choices when no token (except labels already mark add token)
                  if (!mapboxToken && k.startsWith('mapbox_')) return false
                  return true
                })
                .map((k) => (
                  <option key={k} value={k}>
                    {BASEMAPS[k].name}
                  </option>
                ))}
            </select>
          </label>
          {prefersMapboxBasemap(sourceId) && !mapboxToken && (
            <p className="radar-mapbox-hint muted-center">
              For Mapbox dark map set <code>VITE_MAPBOX_TOKEN</code> — storm radar still runs.
            </p>
          )}

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

          <label className="toggle" title="NWS storm-based warning polygons (IEM)">
            <input
              type="checkbox"
              checked={severeToggles.warnings}
              onChange={(e) =>
                setSevereToggles((t) => ({ ...t, warnings: e.target.checked }))
              }
            />
            ⚠ Warn/Watch
          </label>
          <label className="toggle" title="SPC tornado / hail / wind reports">
            <input
              type="checkbox"
              checked={severeToggles.reports}
              onChange={(e) =>
                setSevereToggles((t) => ({ ...t, reports: e.target.checked }))
              }
            />
            📍 Reports
          </label>
          <label className="toggle" title="SPC Day 1 tornado risk (or categorical)">
            <input
              type="checkbox"
              checked={severeToggles.outlook}
              onChange={(e) =>
                setSevereToggles((t) => ({ ...t, outlook: e.target.checked }))
              }
            />
            🗺 SPC risk
          </label>
          <label
            className="toggle"
            title="Nearest NEXRAD storm-relative velocity (rotation couplets, US)"
          >
            <input
              type="checkbox"
              checked={severeToggles.velocity}
              onChange={(e) =>
                setSevereToggles((t) => ({ ...t, velocity: e.target.checked }))
              }
              disabled={!usRegion}
            />
            🌀 Velocity
          </label>
          <label
            className="toggle"
            title="NEXRAD storm cells + 30-min motion vectors (IEM storm attributes)"
          >
            <input
              type="checkbox"
              checked={severeToggles.tracks}
              onChange={(e) =>
                setSevereToggles((t) => ({ ...t, tracks: e.target.checked }))
              }
              disabled={!usRegion}
            />
            ↗ Tracks
          </label>
        </div>

        <p className="radar-product-hint">
          {overlay !== 'none'
            ? 'Interactive model fields from Ventusky — pan, zoom, and scrub time inside the map.'
            : meta.desc}
          {caRegion && (sourceId === 'storm_chaser' || sourceId === 'eccc_radar')
            ? ' · Official ECCC MSC GeoMet composite'
            : ''}
          {usRegion && sourceId === 'storm_chaser'
            ? ' · IEM national NEXRAD loop'
            : ''}
          {showFires ? ' · NASA FIRMS 24h fires' : ''}
          {severeToggles.warnings ||
          severeToggles.reports ||
          severeToggles.outlook ||
          severeToggles.velocity ||
          severeToggles.tracks
            ? ` · Layers: ${[
                severeToggles.warnings
                  ? `${severeStats?.warnings ?? '…'} warn`
                  : null,
                severeToggles.reports
                  ? `${severeStats?.reports ?? '…'} rpts`
                  : null,
                severeToggles.outlook
                  ? severeStats?.outlook
                    ? 'SPC outlook'
                    : 'SPC quiet'
                  : null,
                severeToggles.tracks
                  ? `${severeStats?.tracks ?? '…'} cells`
                  : null,
                severeToggles.velocity
                  ? severeStats?.velocitySite
                    ? `SRM ${severeStats.velocitySite}`
                    : 'velocity'
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}`
            : ''}
          {severeToggles.velocity
            ? ' · Velocity shows storm-relative motion from nearest NEXRAD — red/green couplets can indicate rotation; not a tornado detector.'
            : ''}
          {severeToggles.tracks
            ? ' · Tracks: NEXRAD storm attributes (motion, max dBZ, TVS/MESO flags).'
            : ''}
        </p>
      </div>
    </section>
  )
}
