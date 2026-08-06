/** Deep link into lightpollutionmap.info (VIIRS sky-brightness, correct geolocation). */

export function buildLightPollutionMapUrl(
  lat: number,
  lon: number,
  zoom = 8,
): string {
  const z = Math.max(2, Math.min(14, Math.round(zoom)))
  const params = new URLSearchParams({
    zoom: String(z),
    lat: lat.toFixed(5),
    lon: lon.toFixed(5),
    // B1 = satellite basemap, T = sky brightness overlay (site default stack)
    layers: 'B1TFFFFFFFFFFFFFFFFFF',
  })
  return `https://www.lightpollutionmap.info/#${params.toString()}`
}

export const LIGHT_POLLUTION_MAP_ATTRIBUTION =
  'Sky brightness © Jurij Stare · lightpollutionmap.info · NASA VIIRS / Black Marble'
