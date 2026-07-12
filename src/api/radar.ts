import type { RadarFrame, RadarMaps } from './types'

const MAPS_URL = 'https://api.rainviewer.com/public/weather-maps.json'

export type ColorScheme = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

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

/** High-quality 512px smoothed tiles with snow differentiation */
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
