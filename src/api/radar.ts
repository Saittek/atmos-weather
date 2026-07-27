/**
 * Solara multi-source radar
 * - Storm chaser (region-aware): ECCC Canada · NWS NEXRAD US · RainViewer elsewhere
 * - Official ECCC MSC GeoMet WMS (Canadian / North American composite)
 * - US NEXRAD (Iowa Environmental Mesonet)
 * - US precipitation Q2 (IEM)
 * - GOES East/West IR & VIS (IEM)
 * - Global precip loop (RainViewer)
 * - Mapbox map + global radar (RainViewer tiles on Mapbox basemap)
 * - Global IR (NASA GIBS)
 */

export type RadarSourceId =
  | 'storm_chaser'
  | 'eccc_radar'
  | 'eccc_snow'
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

/** RainViewer color schemes — 6 ≈ NEXRAD Level III (chaser / WeatherWise-like) */
export const RV_COLOR_NEXRAD = 6
/** Slightly punchier “pro” palette often used in storm apps */
export const RV_COLOR_UNIVERSAL = 2

export const ECCC_GEOMET_WMS = 'https://geo.weather.gc.ca/geomet'
export const ECCC_LAYER_RAIN = 'RADAR_1KM_RRAI'
export const ECCC_LAYER_SNOW = 'RADAR_1KM_RSNO'
/** Documented linear precip style for clear chaser colors */
export const ECCC_STYLE_RAIN = 'RADARURPPRECIPR14-LINEAR'

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
  coverage: 'US' | 'Canada' | 'NA' | 'Global' | 'GOES-E' | 'GOES-W'
  animated: boolean
  maxNativeZoom: number
  attribution: string
  /** Render via MSC GeoMet WMS (not XYZ tiles) */
  wms?: boolean
}

export const RADAR_SOURCES: RadarSourceMeta[] = [
  {
    id: 'storm_chaser',
    name: 'Storm chaser',
    desc: 'Region-aware: ECCC Canada · NEXRAD US loop · global composite elsewhere — high-contrast chaser palette',
    coverage: 'Global',
    animated: true,
    maxNativeZoom: 8,
    attribution: 'Radar © ECCC GeoMet / IEM NEXRAD / RainViewer · Map © Mapbox or OSM',
  },
  {
    id: 'eccc_radar',
    name: 'Canada ECCC (rain)',
    desc: 'Official MSC GeoMet 1 km rain-rate composite — last ~3 h, 6 min steps',
    coverage: 'NA',
    animated: true,
    maxNativeZoom: 9,
    attribution: 'Radar © Environment and Climate Change Canada (MSC GeoMet)',
    wms: true,
  },
  {
    id: 'eccc_snow',
    name: 'Canada ECCC (snow)',
    desc: 'Official MSC GeoMet 1 km snow-rate composite',
    coverage: 'NA',
    animated: true,
    maxNativeZoom: 9,
    attribution: 'Radar © Environment and Climate Change Canada (MSC GeoMet)',
    wms: true,
  },
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
    desc: 'Animated national mosaic (~5 min steps) — best for US storm chase',
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

/** CONUS-ish where IEM national NEXRAD mosaic is strong */
export function isNexradMosaicRegion(lat?: number, lon?: number): boolean {
  if (lat == null || lon == null) return false
  return lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66
}

/**
 * Canada where official ECCC GeoMet composite is preferred over US NEXRAD.
 * Keeps US Midwest / Plains on NEXRAD for velocity + storm tracks.
 */
export function isCanadaRadarRegion(lat?: number, lon?: number): boolean {
  if (lat == null || lon == null) return false
  // Mainland Canada north of ~49°
  if (lat >= 49 && lat <= 72 && lon >= -141 && lon <= -52) return true
  // Southern Ontario / Quebec / Maritimes (south of 49°)
  if (lat >= 41.6 && lat < 49 && lon >= -85 && lon <= -52) return true
  // Southern BC / Prairies just below 49°
  if (lat >= 48.2 && lat < 49 && lon >= -141 && lon < -85) return true
  return false
}

/** Default: worldwide animated mosaic (user can switch to Storm chaser / regional layers) */
export function defaultSourceForLocation(_lat?: number, _lon?: number): RadarSourceId {
  return 'global_loop'
}

/** Prefer Mapbox dark basemap for chaser-style sources when token exists */
export function prefersMapboxBasemap(sourceId: RadarSourceId): boolean {
  return (
    sourceId === 'storm_chaser' ||
    sourceId === 'mapbox_radar' ||
    sourceId === 'eccc_radar' ||
    sourceId === 'eccc_snow'
  )
}

/** High-contrast radar tile styling (NEXRAD / WeatherWise-like) */
export function usesChaserColors(sourceId: RadarSourceId): boolean {
  return (
    sourceId === 'storm_chaser' ||
    sourceId === 'us_nexrad_live' ||
    sourceId === 'us_nexrad_loop' ||
    sourceId === 'us_combo' ||
    sourceId === 'mapbox_radar' ||
    sourceId === 'eccc_radar' ||
    sourceId === 'eccc_snow'
  )
}

export function isWmsSource(sourceId: RadarSourceId): boolean {
  return Boolean(getSourceMeta(sourceId).wms)
}

/** Frame key encodes MSC layer + ISO time: eccc:RADAR_1KM_RRAI:2026-07-26T05:24:00Z */
export function parseEcccFrame(
  frame: RadarFrame | null | undefined,
): { layer: string; time: string } | null {
  if (!frame?.key.startsWith('eccc:')) return null
  const rest = frame.key.slice(5)
  const colon = rest.indexOf(':')
  if (colon < 0) return null
  const layer = rest.slice(0, colon)
  const time = rest.slice(colon + 1)
  if (!layer || !time) return null
  return { layer, time }
}

export function frameUsesWms(
  sourceId: RadarSourceId,
  frame: RadarFrame | null | undefined,
): boolean {
  if (isWmsSource(sourceId)) return true
  if (sourceId === 'storm_chaser' && frame?.key.startsWith('eccc:')) return true
  return false
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

// ── ECCC MSC GeoMet (official Canadian / NA composite) ───────────────

function isoUtcZ(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** Generate PT6M frames for last N hours (GeoMet keeps ~3 h) */
export function buildEcccFramesSynthetic(
  layer: string,
  hoursBack = 2.5,
  stepMin = 6,
): RadarFrame[] {
  const end = floorToStep(Date.now() - 6 * 60_000, stepMin)
  const start = end - hoursBack * 3600_000
  const frames: RadarFrame[] = []
  for (let t = start; t <= end; t += stepMin * 60_000) {
    const iso = isoUtcZ(t)
    frames.push({
      time: Math.floor(t / 1000),
      key: `eccc:${layer}:${iso}`,
      label: iso,
    })
  }
  return frames
}

let ecccTimeCache: { at: number; layer: string; frames: RadarFrame[] } | null = null

/**
 * Prefer live TIME dimension from GetCapabilities; fall back to synthetic 6-min steps.
 */
export async function loadEcccFrames(
  layer: string = ECCC_LAYER_RAIN,
  opts?: { lite?: boolean },
): Promise<RadarFrame[]> {
  const lite = Boolean(opts?.lite)
  if (
    ecccTimeCache &&
    ecccTimeCache.layer === layer &&
    Date.now() - ecccTimeCache.at < 90_000
  ) {
    const all = ecccTimeCache.frames
    return lite && all.length > 16 ? all.slice(all.length - 16) : all
  }

  try {
    const url =
      `${ECCC_GEOMET_WMS}?service=WMS&version=1.3.0&request=GetCapabilities` +
      `&layer=${encodeURIComponent(layer)}`
    const res = await fetch(url)
    if (res.ok) {
      const xml = await res.text()
      // Dimension name="time" ...>start/end/PT6M</Dimension>
      const m = xml.match(
        /<Dimension[^>]*name="time"[^>]*>([^<]+)<\/Dimension>/i,
      )
      if (m?.[1]) {
        const [range] = m[1].trim().split(/\s+/)
        const parts = range.split('/')
        if (parts.length >= 2) {
          const startMs = Date.parse(parts[0])
          const endMs = Date.parse(parts[1])
          const stepMatch = (parts[2] ?? '').match(/PT(\d+)M/i)
          const stepMin = stepMatch ? Number(stepMatch[1]) : 6
          if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
            const frames: RadarFrame[] = []
            const step = Math.max(1, stepMin) * 60_000
            for (let t = startMs; t <= endMs; t += step) {
              const iso = isoUtcZ(t)
              frames.push({
                time: Math.floor(t / 1000),
                key: `eccc:${layer}:${iso}`,
                label: iso,
              })
            }
            if (frames.length) {
              ecccTimeCache = { at: Date.now(), layer, frames }
              return lite && frames.length > 16
                ? frames.slice(frames.length - 16)
                : frames
            }
          }
        }
      }
    }
  } catch {
    /* fall through */
  }

  const frames = buildEcccFramesSynthetic(layer, lite ? 1.5 : 2.5, 6)
  ecccTimeCache = { at: Date.now(), layer, frames }
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
  opts?: { lite?: boolean; lat?: number; lon?: number },
): Promise<RadarFrame[]> {
  const lite = Boolean(opts?.lite)
  switch (sourceId) {
    case 'storm_chaser': {
      // Canada → official ECCC GeoMet; CONUS → longer NEXRAD loop; else global
      if (isCanadaRadarRegion(opts?.lat, opts?.lon)) {
        return loadEcccFrames(ECCC_LAYER_RAIN, { lite })
      }
      if (isNexradMosaicRegion(opts?.lat, opts?.lon)) {
        // Aggressive chaser lookback for storm motion
        return buildIemNexradFrames(lite ? 1.5 : 2.5, 5).map((f) => ({
          ...f,
          key: `iem:${f.key}`,
        }))
      }
      const maps = await fetchRainViewerMaps()
      return rainViewerFrames(maps, lite ? 10 : 18).map((f) => ({
        ...f,
        key: `rv:${f.key}`,
      }))
    }
    case 'eccc_radar':
      return loadEcccFrames(ECCC_LAYER_RAIN, { lite })
    case 'eccc_snow':
      return loadEcccFrames(ECCC_LAYER_SNOW, { lite })
    case 'us_nexrad_loop':
      // Longer default loop for dedicated NEXRAD product
      return buildIemNexradFrames(lite ? 1.5 : 2.5, 5)
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
 * Uses {z}/{x}/{y} placeholders. Returns null for WMS frames (use WMS layer).
 */
export function primaryTileUrl(
  sourceId: RadarSourceId,
  frame: RadarFrame | null,
  rvHost?: string,
): string | null {
  if (!frame) return null
  if (frameUsesWms(sourceId, frame)) return null
  switch (sourceId) {
    case 'storm_chaser': {
      const host = (rvHost ?? 'https://tilecache.rainviewer.com').replace(/\/$/, '')
      if (frame.key.startsWith('iem:')) {
        const path = frame.key.slice(4)
        return `${IEM_TILE}/${path}/{z}/{x}/{y}.png`
      }
      const path = frame.key.startsWith('rv:') ? frame.key.slice(3) : frame.key
      // NEXRAD Level III palette (chaser / WeatherWise-like greens→yellow→red→magenta)
      return `${host}${path}/256/{z}/{x}/{y}/${RV_COLOR_NEXRAD}/1_1.png`
    }
    case 'us_nexrad_live':
      return `${IEM_TILE}/nexrad-n0q-900913/{z}/{x}/{y}.png`
    case 'us_nexrad_loop':
      return `${IEM_TILE}/${frame.key}/{z}/{x}/{y}.png`
    case 'us_precip':
      return `${IEM_TILE}/q2-n1p-900913/{z}/{x}/{y}.png`
    case 'global_loop':
    case 'mapbox_radar': {
      const host = (rvHost ?? 'https://tilecache.rainviewer.com').replace(/\/$/, '')
      // color 6 NEXRAD Level III (same family as chaser style)
      return `${host}${frame.key}/256/{z}/{x}/{y}/${RV_COLOR_NEXRAD}/1_1.png`
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

/** WMS options for Leaflet tileLayer.wms — ECCC GeoMet */
export function ecccWmsOptions(frame: RadarFrame | null): {
  layers: string
  time: string
  styles: string
} | null {
  const parsed = parseEcccFrame(frame)
  if (!parsed) return null
  const styles =
    parsed.layer === ECCC_LAYER_RAIN || parsed.layer === ECCC_LAYER_SNOW
      ? ECCC_STYLE_RAIN
      : ''
  return {
    layers: parsed.layer,
    time: parsed.time,
    styles,
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
