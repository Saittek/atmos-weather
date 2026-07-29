/**
 * Approximate solar terminator for day/night globe shading.
 * Returns a closed polygon ring [lon, lat][] covering the night side.
 */

function toRad(d: number) {
  return (d * Math.PI) / 180
}
function toDeg(r: number) {
  return (r * 180) / Math.PI
}

/** Solar declination (degrees) for a JS Date (UTC). */
export function solarDeclination(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  const day = Math.floor((date.getTime() - start) / 86_400_000)
  // Approximate day of year formula
  const n = day
  return 23.44 * Math.sin(toRad((360 / 365) * (n - 81)))
}

/** Subsolar longitude (degrees, -180..180) — where sun is overhead in lon. */
export function subsolarLongitude(date: Date): number {
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  // Sun at lon 0 around 12 UTC; west is negative
  let lon = 15 * (12 - utcHours)
  while (lon > 180) lon -= 360
  while (lon < -180) lon += 360
  return lon
}

/**
 * Night-side polygon (Multi-step ring). Suitable for SVG fill on the globe overlay.
 * Uses terminator latitudes for each longitude sample.
 */
export function nightPolygonRing(
  date: Date = new Date(),
  samples = 72,
): [number, number][] {
  const dec = toRad(solarDeclination(date))
  const sunLon = subsolarLongitude(date)
  const ring: [number, number][] = []

  // Walk longitudes and compute terminator latitude
  // Night is the side opposite the sun
  for (let i = 0; i <= samples; i++) {
    const lon = -180 + (360 * i) / samples
    const lonRel = toRad(lon - sunLon)
    // cos(c) = sin(lat)*sin(dec) + cos(lat)*cos(dec)*cos(lonRel)
    // Terminator: c = 90° → lat = atan(-cos(lonRel)/tan(dec)) when dec≠0
    let lat: number
    if (Math.abs(dec) < 1e-6) {
      // Equinox: terminator is meridians sunLon±90
      lat = 0
    } else {
      lat = toDeg(Math.atan(-Math.cos(lonRel) / Math.tan(dec)))
    }
    // Clamp
    lat = Math.max(-89.5, Math.min(89.5, lat))
    ring.push([lon, lat])
  }

  // Close night region: from terminator, go to winter pole of darkness, around, back
  const darkPole: number = dec >= 0 ? -90 : 90
  // Night is south of terminator when sun is in northern hemisphere (dec>0)?
  // Actually: sun illuminates hemisphere toward declination.
  // Points with solar elevation < 0 are night.
  // For SVG we build: terminator path + arc via dark pole
  const poly: [number, number][] = [...ring]
  // Append path via dark pole for a closed night cap
  poly.push([180, darkPole])
  poly.push([-180, darkPole])
  poly.push(ring[0])
  return poly
}

/** Sample points along terminator for a stroke-only line (cleaner on globe). */
export function terminatorLine(
  date: Date = new Date(),
  samples = 96,
): [number, number][] {
  const dec = toRad(solarDeclination(date))
  const sunLon = subsolarLongitude(date)
  const line: [number, number][] = []
  for (let i = 0; i <= samples; i++) {
    const lon = -180 + (360 * i) / samples
    const lonRel = toRad(lon - sunLon)
    let lat: number
    if (Math.abs(dec) < 1e-6) lat = 0
    else lat = toDeg(Math.atan(-Math.cos(lonRel) / Math.tan(dec)))
    lat = Math.max(-89.5, Math.min(89.5, lat))
    line.push([lon, lat])
  }
  return line
}
