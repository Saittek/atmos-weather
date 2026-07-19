/**
 * Solara multi-source radar
 * - US NEXRAD (Iowa Environmental Mesonet) — high-quality CONUS reflectivity
 * - US precipitation Q2 (IEM)
 * - GOES East/West IR & VIS (IEM)
 * - Global precip loop (RainViewer)
 * - Mapbox map + global radar (RainViewer tiles on Mapbox basemap)
 * - Global IR (NASA GIBS)
 */

export type RadarSourceId =
  | 'us_nexrad_live'
  | 'us_nexrad_loop'
  | 'us_precip'
  | 'global_loop'
  | 'mapbox_radar'
  | 'goes_east_ir'
  | 'goes_west_ir'
  | 'goes_east_vis'
  | 'nasa_ir'
  | 'us_combo'

export interface RadarFrame {
  /** Unix seconds (UTC) when known */
  time: number
  /** Source-specific frame id / path segment */
  key: string
  label?: string
}

export interface RadarSourceMeta {
  id: RadarSourceId
  name: string
  desc: string
  /** Rough coverage hint for the UI */
  coverage: 'US' | 'Global' | 'GOES-E' | 'GOES-W'
  animated: boolean
  maxNativeZoom: number
  attribution: string
}

export const RADAR_SOURCES: RadarSourceMeta[] = [
  {
    id: 'us_nexrad_live',
    name: 'US NEXRAD (live)',
    desc: 'CONUS base reflectivity — Iowa State IEM',
    coverage: 'US',
    animated: false,
    maxNativeZoom: 8,
    attribution: 'Radar © Iowa Environmental Mesonet / NWS NEXRAD',
  },
  {
    id: 'us_nexrad_loop',
    name: 'US NEXRAD (loop)',
    desc: 'Animated national mosaic (~5 min steps)',
    coverage: 'US',
    animated: true,
    maxNativeZoom: 8,
    attribution: 'Radar © Iowa Environmental Mesonet / NWS NEXRAD',
  },
  {
    id: 'us_precip',
    name: 'US precip rate',
    desc: 'MRMS/Q2 1-hour precip estimate',
    coverage: 'US',
    animated: false,
    maxNativeZoom: 8,
    attribution: 'Precip © Iowa Environmental Mesonet / NSSL MRMS',
  },
  {
    id: 'global_loop',
    name: 'Global radar (loop)',
    desc: 'Worldwide precip mosaic with forecast frames',
    coverage: 'Global',
    animated: true,
    maxNativeZoom: 7,
    attribution: 'Radar © RainViewer',
  },
  {
    id: 'mapbox_radar',
    name: 'Mapbox + radar',
    desc: 'Global precip loop on a Mapbox basemap (set VITE_MAPBOX_TOKEN)',
    coverage: 'Global',
    animated: true,
    maxNativeZoom: 7,
    attribution: 'Basemap © Mapbox · Radar © RainViewer',
  },
  {
    id: 'goes_east_ir',
    name: 'GOES-East IR',
    desc: 'Infrared cloud tops (Americas east)',
    coverage: 'GOES-E',
    animated: false,
    maxNativeZoom: 7,
    attribution: 'Satellite © NOAA GOES / IEM',
  },
  {
    id: 'goes_west_ir',
    name: 'GOES-West IR',
    desc: 'Infrared cloud tops (Pacific / west)',
    coverage: 'GOES-W',
    animated: false,
    maxNativeZoom: 7,
    attribution: 'Satellite © NOAA GOES / IEM',
  },
  {
    id: 'goes_east_vis',
    name: 'GOES-East visible',
    desc: 'Daytime cloud detail (east)',
    coverage: 'GOES-E',
    animated: false,
    maxNativeZoom: 8,
    attribution: 'Satellite © NOAA GOES / IEM',
  },
  {
    id: 'nasa_ir',
    name: 'Global IR (NASA)',
    desc: 'MODIS brightness temperature worldwide',
    coverage: 'Global',
    animated: false,
    maxNativeZoom: 7,
    attribution: 'Imagery © NASA GIBS / MODIS Aqua',
  },
  {
    id: 'us_combo',
    name: 'US radar + IR',
    desc: 'NEXRAD over GOES-East infrared',
    coverage: 'US',
    animated: false,
    maxNativeZoom: 8,
    attribution: 'NEXRAD + GOES © IEM / NOAA',
  },
]

export function getSourceMeta(id: RadarSourceId): RadarSourceMeta {
  return RADAR_SOURCES.find((s) => s.id === id) ?? RADAR_SOURCES[0]
}

/** Default map source — global loop for everyone */
export function defaultSourceForLocation(_lat?: number, _lon?: number): RadarSourceId {
  return 'global_loop'
}

const IEM_TILE = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0'

function floorToStep(ms: number, stepMin: number): number {
  const step = stepMin * 60_000
  return Math.floor(ms / step) * step
}

function utcStamp(ms: number): string {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const h = String(d.getUTCHours()).padStart(2, '0')
  const mi = String(d.getUTCMinutes()).padStart(2, '0')
  return `${y}${m}${day}${h}${mi}`
}

/** Build IEM ridge archive frames for national N0Q mosaic */
export function buildIemNexradFrames(hoursBack = 1.5, stepMin = 5): RadarFrame[] {
  const end = floorToStep(Date.now() - 10 * 60_000, stepMin) // avoid incomplete latest
  const start = end - hoursBack * 3600_000
  const frames: RadarFrame[] = []
  for (let t = start; t <= end; t += stepMin * 60_000) {
    const stamp = utcStamp(t)
    frames.push({
      time: Math.floor(t / 1000),
      key: `ridge::USCOMP-N0Q-${stamp}`,
      label: stamp,
    })
  }
  return frames
}

// ── RainViewer (global animated) ─────────────────────────────────────

interface RvMaps {
  host: string
  radar?: { past?: { time: number; path: string }[]; nowcast?: { time: number; path: string }[] }
}

let rvCache: { at: number; data: RvMaps } | null = null

export async function fetchRainViewerMaps(): Promise<RvMaps> {
  if (rvCache && Date.now() - rvCache.at < 60_000) return rvCache.data
  const res = await fetch('https://api.rainviewer.com/public/weather-maps.json')
  if (!res.ok) throw new Error('Global radar index failed')
  const data = (await res.json()) as RvMaps
  rvCache = { at: Date.now(), data }
  return data
}

export function rainViewerFrames(maps: RvMaps, maxPast = 16): RadarFrame[] {
  const past = maps.radar?.past ?? []
  const nowcast = maps.radar?.nowcast ?? []
  // Keep enough past frames for a smooth continuous loop
  const slice = past.length > maxPast ? past.slice(past.length - maxPast) : past
  return [...slice, ...nowcast].map((f) => ({
    time: f.time,
    key: f.path,
    label: String(f.time),
  }))
}

// ── Frame loaders ────────────────────────────────────────────────────

export async function loadFrames(
  sourceId: RadarSourceId,
  opts?: { lite?: boolean },
): Promise<RadarFrame[]> {
  const lite = Boolean(opts?.lite)
  switch (sourceId) {
    case 'us_nexrad_loop':
      return buildIemNexradFrames(lite ? 1 : 1.5, 5)
    case 'global_loop':
    case 'mapbox_radar': {
      const maps = await fetchRainViewerMaps()
      // Fewer frames on constrained devices = less tile RAM / GPU
      return rainViewerFrames(maps, lite ? 8 : 14)
    }
    case 'us_nexrad_live':
    case 'us_precip':
    case 'goes_east_ir':
    case 'goes_west_ir':
    case 'goes_east_vis':
    case 'nasa_ir':
    case 'us_combo':
      return [{ time: Math.floor(Date.now() / 1000), key: 'live' }]
    default:
      return []
  }
}

/**
 * Leaflet tile URL template for the primary animated/live layer.
 * Uses {z}/{x}/{y} placeholders.
 */
export function primaryTileUrl(
  sourceId: RadarSourceId,
  frame: RadarFrame | null,
  rvHost?: string,
): string | null {
  if (!frame) return null
  switch (sourceId) {
    case 'us_nexrad_live':
      return `${IEM_TILE}/nexrad-n0q-900913/{z}/{x}/{y}.png`
    case 'us_nexrad_loop':
      return `${IEM_TILE}/${frame.key}/{z}/{x}/{y}.png`
    case 'us_precip':
      return `${IEM_TILE}/q2-n1p-900913/{z}/{x}/{y}.png`
    case 'global_loop':
    case 'mapbox_radar': {
      const host = (rvHost ?? 'https://tilecache.rainviewer.com').replace(/\/$/, '')
      // color 6 NEXRAD-ish, smooth+snow
      return `${host}${frame.key}/256/{z}/{x}/{y}/6/1_1.png`
    }
    case 'goes_east_ir':
      return `${IEM_TILE}/goes-east-ir-4km-900913/{z}/{x}/{y}.png`
    case 'goes_west_ir':
      return `${IEM_TILE}/goes-west-ir-4km-900913/{z}/{x}/{y}.png`
    case 'goes_east_vis':
      return `${IEM_TILE}/goes-east-vis-1km-900913/{z}/{x}/{y}.png`
    case 'nasa_ir':
      return gibsInfraredTileUrl()
    case 'us_combo':
      // Primary is NEXRAD; IR is secondary layer
      return `${IEM_TILE}/nexrad-n0q-900913/{z}/{x}/{y}.png`
    default:
      return null
  }
}

/** Optional secondary layer (e.g. IR under radar for combo) */
export function secondaryTileUrl(sourceId: RadarSourceId): string | null {
  if (sourceId === 'us_combo') {
    return `${IEM_TILE}/goes-east-ir-4km-900913/{z}/{x}/{y}.png`
  }
  return null
}

export function gibsInfraredTileUrl(date = new Date()): string {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() - 1)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Aqua_Brightness_Temp_Band31_Night/default/${y}-${m}-${day}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png`
}

/** Mapbox access token from build env (public pk. token is OK for client tiles) */
export function getMapboxToken(): string | null {
  const t = import.meta.env.VITE_MAPBOX_TOKEN
  const s = typeof t === 'string' ? t.trim() : ''
  return s || null
}

/** Raster style tiles for Leaflet (Mapbox Styles API) */
export function mapboxStyleTileUrl(
  styleId: 'dark-v11' | 'streets-v12' | 'outdoors-v12' | 'satellite-streets-v12',
  token: string,
): string {
  return `https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/256/{z}/{x}/{y}@2x?access_token=${encodeURIComponent(token)}`
}

/** @deprecated kept for any leftover imports */
export type RadarProduct = RadarSourceId
export const RADAR_PRODUCTS = RADAR_SOURCES.map((s) => ({
  id: s.id as string,
  name: s.name,
  desc: s.desc,
}))
