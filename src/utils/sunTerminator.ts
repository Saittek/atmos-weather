/**
 * Solar terminator + night-side geometry for the Earth globe.
 * Uses spherical solar elevation (subsolar point) — not a flat-map hack.
 */

function toRad(d: number) {
  return (d * Math.PI) / 180
}
function toDeg(r: number) {
  return (r * 180) / Math.PI
}

function normalizeLon(lon: number): number {
  let x = lon
  while (x > 180) x -= 360
  while (x < -180) x += 360
  return x
}

/** Solar declination (degrees) ≈ subsolar latitude. */
export function solarDeclination(date: Date): number {
  // More accurate day-of-year with leap-year-aware UTC
  const y = date.getUTCFullYear()
  const start = Date.UTC(y, 0, 0)
  const day = (date.getTime() - start) / 86_400_000
  // Approximate equation of the center / mean anomaly path
  const g = toRad(357.529 + 0.98560028 * day)
  const q = 280.459 + 0.98564736 * day
  const L = toRad(q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g))
  const e = toRad(23.439 - 0.00000036 * day)
  return toDeg(Math.asin(Math.sin(e) * Math.sin(L)))
}

/**
 * Subsolar longitude (degrees, −180…180).
 * Sun is overhead near 12:00 local solar time; equation of time is small for our needs.
 */
export function subsolarLongitude(date: Date): number {
  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  // 15° per hour; +180 so 0h UTC ≈ antimeridian day-side
  // At 12:00 UTC sun is near lon 0.
  return normalizeLon(15 * (12 - utcHours))
}

export function subsolarPoint(date: Date = new Date()): { lon: number; lat: number } {
  return { lon: subsolarLongitude(date), lat: solarDeclination(date) }
}

/**
 * sin(solar elevation). Positive = day, negative = night, ~0 at the terminator.
 * Used for soft day/night blending (not a hard cut).
 */
export function solarElevationSin(
  lon: number,
  lat: number,
  date: Date = new Date(),
): number {
  const { lon: sunLon, lat: sunLat } = subsolarPoint(date)
  const φ = toRad(lat)
  const δ = toRad(sunLat)
  const Δλ = toRad(lon - sunLon)
  return Math.sin(φ) * Math.sin(δ) + Math.cos(φ) * Math.cos(δ) * Math.cos(Δλ)
}

/** True when the sun is below the geometric horizon (civil-ish limb, no refraction). */
export function isNight(lon: number, lat: number, date: Date = new Date()): boolean {
  return solarElevationSin(lon, lat, date) < 0
}

/**
 * Great-circle destination: from (lon,lat), travel `distDeg` along `bearingDeg`.
 */
export function destinationPoint(
  lon: number,
  lat: number,
  distDeg: number,
  bearingDeg: number,
): [number, number] {
  const δ = toRad(distDeg)
  const θ = toRad(bearingDeg)
  const φ1 = toRad(lat)
  const λ1 = toRad(lon)
  const sinφ1 = Math.sin(φ1)
  const cosφ1 = Math.cos(φ1)
  const sinδ = Math.sin(δ)
  const cosδ = Math.cos(δ)
  const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ)
  const φ2 = Math.asin(Math.max(-1, Math.min(1, sinφ2)))
  const y = Math.sin(θ) * sinδ * cosφ1
  const x = cosδ - sinφ1 * sinφ2
  const λ2 = λ1 + Math.atan2(y, x)
  return [normalizeLon(toDeg(λ2)), toDeg(φ2)]
}

/**
 * Terminator as a closed ring of lon/lat points (great circle 90° from the sun).
 * Suitable for a MapLibre line layer or SVG stroke.
 */
export function terminatorLine(
  date: Date = new Date(),
  samples = 128,
): [number, number][] {
  const { lon, lat } = subsolarPoint(date)
  const line: [number, number][] = []
  for (let i = 0; i <= samples; i++) {
    const bearing = (360 * i) / samples
    line.push(destinationPoint(lon, lat, 90, bearing))
  }
  return line
}

/**
 * Night-side multipolygon (GeoJSON coordinates) as longitude strips.
 * MapLibre projects these correctly on the globe — far more reliable than a single
 * “terminator + dark pole” ring (which breaks near equinox and on the limb).
 */
export function nightMultiPolygon(
  date: Date = new Date(),
  lonStep = 5,
  latStep = 3,
): [number, number][][][] {
  const polys: [number, number][][][] = []
  const half = lonStep / 2

  for (let lon0 = -180; lon0 < 180 - 1e-6; lon0 += lonStep) {
    const lonC = lon0 + half
    const lon1 = Math.min(180, lon0 + lonStep)
    let runStart: number | null = null

    const flush = (latEnd: number) => {
      if (runStart == null) return
      const a = Math.max(-90, runStart - latStep / 2)
      const b = Math.min(90, latEnd + latStep / 2)
      if (b - a < 0.2) {
        runStart = null
        return
      }
      // Outer ring, CCW
      const ring: [number, number][] = [
        [lon0, a],
        [lon1, a],
        [lon1, b],
        [lon0, b],
        [lon0, a],
      ]
      polys.push([ring])
      runStart = null
    }

    for (let lat = -90; lat <= 90 + 1e-6; lat += latStep) {
      const night = isNight(lonC, Math.min(90, lat), date)
      if (night) {
        if (runStart == null) runStart = lat
      } else if (runStart != null) {
        flush(lat - latStep)
      }
    }
    if (runStart != null) flush(90)
  }

  return polys
}

/** GeoJSON features for MapLibre night fill + terminator line. */
export function dayNightGeoJSON(date: Date = new Date()) {
  const sun = subsolarPoint(date)
  const multipoly = nightMultiPolygon(date, 6, 4)
  const term = terminatorLine(date, 144)

  return {
    sun,
    night: {
      type: 'Feature' as const,
      properties: { kind: 'night' },
      geometry: {
        type: 'MultiPolygon' as const,
        coordinates: multipoly,
      },
    },
    terminator: {
      type: 'Feature' as const,
      properties: { kind: 'terminator' },
      geometry: {
        type: 'LineString' as const,
        coordinates: term,
      },
    },
  }
}

/** @deprecated Prefer dayNightGeoJSON — kept for any leftover SVG paths. */
export function nightPolygonRing(date: Date = new Date(), samples = 72): [number, number][] {
  return terminatorLine(date, samples)
}
