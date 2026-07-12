import type { RadarFrame, RadarMaps } from './types'

const MAPS_URL = 'https://api.rainviewer.com/public/weather-maps.json'

export type ColorScheme = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

/** High-level radar / imagery products shown in the map UI */
export type RadarProduct =
  | 'precip'
  | 'rain'
  | 'snow'
  | 'classic'
  | 'nexrad'
  | 'storm'
  | 'satellite'
  | 'combo'

export const RADAR_PRODUCTS: {
  id: RadarProduct
  name: string
  desc: string
}[] = [
  { id: 'precip', name: 'Precip radar', desc: 'Rain + snow, smoothed' },
  { id: 'rain', name: 'Rain only', desc: 'Precipitation without snow tint' },
  { id: 'snow', name: 'Snow mode', desc: 'Snow differentiation on' },
  { id: 'classic', name: 'Classic radar', desc: 'Raw tiles, no smooth' },
  { id: 'nexrad', name: 'NEXRAD colors', desc: 'US Level-III palette' },
  { id: 'storm', name: 'Storm track', desc: 'High-contrast TITAN colors' },
  { id: 'satellite', name: 'Satellite IR', desc: 'Cloud tops (RainViewer or NASA GIBS)' },
  { id: 'combo', name: 'Radar + sat', desc: 'Precip over infrared clouds' },
]

export const COLOR_SCHEMES: { id: ColorScheme; name: string; desc: string }[] = [
  { id: 2, name: 'Universal Blue', desc: 'Clear blues — great contrast' },
  { id: 4, name: 'Weather Channel', desc: 'Classic TV radar look' },
  { id: 6, name: 'NEXRAD III', desc: 'US NEXRAD Level-III colors' },
  { id: 3, name: 'TITAN', desc: 'High-contrast storm tracking' },
  { id: 7, name: 'Rainbow', desc: 'Full spectrum intensity' },
  { id: 5, name: 'Meteored', desc: 'European style' },
  { id: 8, name: 'Dark Sky', desc: 'Muted modern palette' },
  { id: 1, name: 'Original', desc: 'RainViewer original' },
  { id: 0, name: 'B&W', desc: 'Black & white' },
]

export function productSettings(product: RadarProduct): {
  color: ColorScheme
  smooth: boolean
  snow: boolean
  showRadar: boolean
  showSatellite: boolean
} {
  switch (product) {
    case 'rain':
      return { color: 2, smooth: true, snow: false, showRadar: true, showSatellite: false }
    case 'snow':
      return { color: 6, smooth: true, snow: true, showRadar: true, showSatellite: false }
    case 'classic':
      return { color: 4, smooth: false, snow: true, showRadar: true, showSatellite: false }
    case 'nexrad':
      return { color: 6, smooth: true, snow: true, showRadar: true, showSatellite: false }
    case 'storm':
      return { color: 3, smooth: true, snow: true, showRadar: true, showSatellite: false }
    case 'satellite':
      return { color: 2, smooth: true, snow: true, showRadar: false, showSatellite: true }
    case 'combo':
      return { color: 2, smooth: true, snow: true, showRadar: true, showSatellite: true }
    case 'precip':
    default:
      return { color: 6, smooth: true, snow: true, showRadar: true, showSatellite: false }
  }
}

export async function fetchRadarMaps(): Promise<RadarMaps> {
  const res = await fetch(MAPS_URL)
  if (!res.ok) throw new Error('Radar data failed to load')
  return res.json()
}

export function getAllFrames(maps: RadarMaps): RadarFrame[] {
  const past = maps.radar?.past ?? []
  const nowcast = maps.radar?.nowcast ?? []
  return [...past, ...nowcast]
}

export function getSatelliteFrames(maps: RadarMaps): RadarFrame[] {
  return maps.satellite?.infrared ?? []
}

/** High-quality 512px tiles */
export function tileUrl(
  host: string,
  path: string,
  color: ColorScheme = 2,
  smooth = true,
  snow = true,
): string {
  const options = `${smooth ? 1 : 0}_${snow ? 1 : 0}`
  return `${host}${path}/512/{z}/{x}/{y}/${color}/${options}.png`
}

/** Infrared satellite (RainViewer) */
export function satelliteTileUrl(host: string, path: string): string {
  return `${host}${path}/512/{z}/{x}/{y}/0/0_0.png`
}

export function coverageTileUrl(host: string): string {
  return `${host}/v2/coverage/0/256/{z}/{x}/{y}/0/0_0.png`
}

/**
 * NASA GIBS IR brightness-temp tiles — used when RainViewer satellite frames
 * are empty (common). Date is YYYY-MM-DD UTC.
 * Layer verified: MODIS Aqua Band 31 Night.
 */
export function gibsInfraredTileUrl(date = new Date()): string {
  const d = new Date(date)
  // GIBS often lags ~1 day for some products; use yesterday for reliability
  d.setUTCDate(d.getUTCDate() - 1)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const time = `${y}-${m}-${day}`
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Aqua_Brightness_Temp_Band31_Night/default/${time}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png`
}

export function gibsInfraredAttribution(): string {
  return 'Imagery &copy; NASA GIBS / MODIS Aqua'
}
