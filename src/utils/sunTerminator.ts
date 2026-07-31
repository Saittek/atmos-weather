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

/** Julian Day (UT) from JS Date */
function julianDay(date: Date): number {
  return date.getTime() / 86_400_000 + 2_440_587.5
}

/**
 * Sublunar point: lat/lon on Earth where the Moon is overhead right now.
 * Low-order lunar theory (Meeus-style) — good enough for a globe marker (~1°).
 */
/**
 * Project a lon/lat direction out into "space" for screen placement around a globe.
 * `spaceRadius` is multiples of Earth radius (1 = surface, ~1.7–2.4 = near-Earth space).
 * Returns CSS pixel coords relative to the map canvas and a depth cue for scale/z-order.
 */
export function projectSpaceBody(
  project: (lngLat: [number, number]) => { x: number; y: number },
  lookLng: number,
  lookLat: number,
  bodyLon: number,
  bodyLat: number,
  spaceRadius = 1.85,
): { x: number; y: number; depth: number; inFront: boolean; scale: number } | null {
  // cosγ: body direction · camera look-at (same as front-of-globe test)
  const toRad = Math.PI / 180
  const φ1 = lookLat * toRad
  const λ1 = lookLng * toRad
  const φ2 = bodyLat * toRad
  const λ2 = bodyLon * toRad
  const cosC =
    Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1)

  // Behind Earth (from camera) — occluded by the planet
  if (cosC < -0.08) return null

  const origin = project([lookLng, lookLat])
  const surface = project([bodyLon, bodyLat])
  let dx = surface.x - origin.x
  let dy = surface.y - origin.y
  let len = Math.hypot(dx, dy)

  // When body is nearly toward camera, surface projects near center — estimate
  // limb radius from a 90° offset sample so we still push the body into space.
  if (len < 6) {
    // Sample a point ~25° from look-at toward the body for a direction
    const midLon = lookLng + (bodyLon - lookLng) * 0.35
    const midLat = lookLat + (bodyLat - lookLat) * 0.35
    const mid = project([midLon, midLat])
    dx = mid.x - origin.x
    dy = mid.y - origin.y
    len = Math.hypot(dx, dy)
  }
  if (len < 2) {
    // Fall back: place slightly above center
    return {
      x: origin.x,
      y: origin.y - 40 * spaceRadius,
      depth: cosC,
      inFront: cosC > 0.15,
      scale: 0.85 + 0.45 * Math.max(0, cosC),
    }
  }

  // Screen radius of Earth disk ≈ len / sin(γ); push body to spaceRadius × R
  const sinG = Math.sqrt(Math.max(1e-6, 1 - cosC * cosC))
  const earthRpx = len / sinG
  const target = earthRpx * spaceRadius * sinG
  const ux = dx / len
  const uy = dy / len
  const x = origin.x + ux * target
  const y = origin.y + uy * target
  // Closer to camera → larger; also when near limb slightly smaller
  const scale = 0.55 + 0.7 * Math.max(0, cosC) + 0.15 * (1 - Math.abs(cosC))
  return {
    x,
    y,
    depth: cosC,
    inFront: cosC > 0.12,
    scale: Math.max(0.45, Math.min(1.35, scale)),
  }
}

export function sublunarPoint(date: Date = new Date()): { lon: number; lat: number } {
  const JD = julianDay(date)
  const T = (JD - 2_451_545.0) / 36_525

  // Moon mean elements (degrees)
  let Lp = 218.316_447_7 + 481_267.881_234_21 * T // mean longitude
  let D = 297.850_192_1 + 445_267.111_403_4 * T // mean elongation
  let M = 357.529_109_2 + 35_999.050_290_9 * T // Sun mean anomaly
  let Mp = 134.963_396_4 + 477_198.867_505_5 * T // Moon mean anomaly
  let F = 93.272_095 + 483_202.017_523_3 * T // arg of latitude

  const norm360 = (x: number) => {
    let v = x % 360
    if (v < 0) v += 360
    return v
  }
  Lp = norm360(Lp)
  D = toRad(norm360(D))
  M = toRad(norm360(M))
  Mp = toRad(norm360(Mp))
  F = toRad(norm360(F))

  // Ecliptic longitude / latitude (main terms)
  const lonEcl =
    Lp +
    6.289 * Math.sin(Mp) +
    1.274 * Math.sin(2 * D - Mp) +
    0.658 * Math.sin(2 * D) +
    0.214 * Math.sin(2 * Mp) -
    0.186 * Math.sin(M) -
    0.114 * Math.sin(2 * F)
  const latEcl =
    5.128 * Math.sin(F) +
    0.281 * Math.sin(Mp + F) +
    0.278 * Math.sin(Mp - F) +
    0.173 * Math.sin(2 * D - F)

  const λ = toRad(norm360(lonEcl))
  const β = toRad(latEcl)
  // True obliquity of ecliptic
  const ε = toRad(23.439_291 - 0.013_004_2 * T)

  // Ecliptic → equatorial
  const sinδ = Math.sin(β) * Math.cos(ε) + Math.cos(β) * Math.sin(ε) * Math.sin(λ)
  const δ = Math.asin(Math.max(-1, Math.min(1, sinδ)))
  const y = Math.sin(λ) * Math.cos(ε) - Math.tan(β) * Math.sin(ε)
  const x = Math.cos(λ)
  let α = Math.atan2(y, x) // RA radians
  if (α < 0) α += 2 * Math.PI

  // Greenwich mean sidereal time (degrees)
  const D_j2000 = JD - 2_451_545.0
  let GMST = 280.460_618_37 + 360.985_647_366_29 * D_j2000
  GMST = norm360(GMST)

  const raDeg = toDeg(α)
  const lat = toDeg(δ)
  const lon = normalizeLon(raDeg - GMST)
  return { lon, lat }
}

/**
 * sin(solar elevation). Positive = day, negative = night, ~0 at the terminator.
 * Hot path: pass sunLon/sunLat when looping many pixels (avoids recompute).
 */
export function solarElevationSin(
  lon: number,
  lat: number,
  dateOrSun: Date | { lon: number; lat: number } = new Date(),
): number {
  const sun =
    dateOrSun instanceof Date ? subsolarPoint(dateOrSun) : dateOrSun
  const φ = toRad(lat)
  const δ = toRad(sun.lat)
  const Δλ = toRad(lon - sun.lon)
  return Math.sin(φ) * Math.sin(δ) + Math.cos(φ) * Math.cos(δ) * Math.cos(Δλ)
}

/** True when the sun is below the geometric horizon (civil-ish limb, no refraction). */
export function isNight(lon: number, lat: number, date: Date = new Date()): boolean {
  return solarElevationSin(lon, lat, date) < 0
}

/**
 * Fast orthographic globe day/night: screen disk → lat/lon without map.unproject.
 * Accurate when the whole Earth disk is on screen (world zoom).
 */
export function screenToLatLonOrtho(
  cssX: number,
  cssY: number,
  centerX: number,
  centerY: number,
  radiusPx: number,
  lookLng: number,
  lookLat: number,
): { lon: number; lat: number; limb: number } | null {
  if (radiusPx < 1) return null
  const nx = (cssX - centerX) / radiusPx
  // Screen Y down → geographic north is up
  const ny = (centerY - cssY) / radiusPx
  const r2 = nx * nx + ny * ny
  if (r2 > 1.0005) return null
  const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, r2)))
  // Soft limb factor from radial distance
  const limb = r2 > 0.92 ? smoothstepOut(Math.sqrt(r2), 0.92, 1) : 1

  const lat0 = toRad(lookLat)
  const lon0 = toRad(lookLng)
  const cosLat0 = Math.cos(lat0)
  const sinLat0 = Math.sin(lat0)
  const cosLon0 = Math.cos(lon0)
  const sinLon0 = Math.sin(lon0)
  // Camera basis: east, north, up (radial at look-at)
  // p = nx*east + ny*north + nz*up
  const ex = -sinLon0
  const ey = cosLon0
  const ez = 0
  const nx_ = -sinLat0 * cosLon0
  const ny_ = -sinLat0 * sinLon0
  const nz_ = cosLat0
  const ux = cosLat0 * cosLon0
  const uy = cosLat0 * sinLon0
  const uz = sinLat0

  const x = nx * ex + ny * nx_ + nz * ux
  const y = nx * ey + ny * ny_ + nz * uy
  const z = nx * ez + ny * nz_ + nz * uz

  const lat = toDeg(Math.asin(Math.max(-1, Math.min(1, z))))
  const lon = toDeg(Math.atan2(y, x))
  return { lon, lat, limb }
}

function smoothstepOut(r: number, a: number, b: number): number {
  if (r <= a) return 1
  if (r >= b) return 0
  const t = (r - a) / (b - a)
  const s = t * t * (3 - 2 * t)
  return 1 - s
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
