/**
 * Approximate moon rise / set / transit for a lat/lon/date (no external API).
 * Accuracy ~10–20 min — fine for planning, not navigation.
 */

function toJulian(ms: number): number {
  return ms / 86400000 + 2440587.5
}

function moonEcliptic(jd: number): { lon: number; lat: number; dist: number } {
  const T = (jd - 2451545.0) / 36525
  const L0 = 218.3164477 + 481267.88123421 * T
  const D = 297.8501921 + 445267.1114034 * T
  const Mp = 134.9633964 + 477198.8675055 * T
  const F = 93.272095 + 483202.0175233 * T
  const rad = Math.PI / 180
  const lon =
    L0 +
    6.289 * Math.sin(Mp * rad) +
    1.274 * Math.sin((2 * D - Mp) * rad) +
    0.658 * Math.sin(2 * D * rad) +
    0.214 * Math.sin(2 * Mp * rad)
  const lat =
    5.128 * Math.sin(F * rad) +
    0.281 * Math.sin((Mp + F) * rad) +
    0.278 * Math.sin((Mp - F) * rad)
  const dist = 385001 - 20905 * Math.cos(Mp * rad)
  return { lon: ((lon % 360) + 360) % 360, lat, dist }
}

function moonAltAz(
  lat: number,
  lon: number,
  ms: number,
): { alt: number; az: number } {
  const jd = toJulian(ms)
  const m = moonEcliptic(jd)
  const rad = Math.PI / 180
  // Obliquity
  const eps = 23.439291 - 0.0130042 * ((jd - 2451545) / 36525)
  const b = m.lat * rad
  const l = m.lon * rad
  const e = eps * rad
  const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l))
  const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l))
  // GMST
  const t = (jd - 2451545.0) / 36525
  let gmst =
    280.46061837 +
    360.98564736629 * (jd - 2451545) +
    0.000387933 * t * t
  gmst = ((gmst % 360) + 360) % 360
  const lst = ((gmst + lon) % 360) * rad
  const ha = lst - ra
  const latR = lat * rad
  const alt = Math.asin(
    Math.sin(latR) * Math.sin(dec) + Math.cos(latR) * Math.cos(dec) * Math.cos(ha),
  )
  const az = Math.atan2(
    Math.sin(ha),
    Math.cos(ha) * Math.sin(latR) - Math.tan(dec) * Math.cos(latR),
  )
  return { alt: (alt * 180) / Math.PI, az: (((az * 180) / Math.PI) + 360) % 360 }
}

export interface MoonGeometry {
  riseMs: number | null
  setMs: number | null
  transitMs: number | null
  transitAlt: number | null
  upNow: boolean
}

/** Scan ±24h around `atMs` for rise/set/transit. */
export function moonGeometry(lat: number, lon: number, atMs = Date.now()): MoonGeometry {
  const start = atMs - 12 * 3600_000
  const end = atMs + 36 * 3600_000
  const step = 10 * 60_000
  let prev = moonAltAz(lat, lon, start)
  let riseMs: number | null = null
  let setMs: number | null = null
  let transitMs: number | null = null
  let transitAlt = -999
  for (let t = start + step; t <= end; t += step) {
    const cur = moonAltAz(lat, lon, t)
    if (prev.alt < 0 && cur.alt >= 0 && riseMs == null) riseMs = t
    if (prev.alt >= 0 && cur.alt < 0 && setMs == null && t > (riseMs ?? start)) setMs = t
    if (cur.alt > transitAlt) {
      transitAlt = cur.alt
      transitMs = t
    }
    prev = cur
  }
  const now = moonAltAz(lat, lon, atMs)
  return {
    riseMs,
    setMs,
    transitMs,
    transitAlt: transitAlt > -90 ? Math.round(transitAlt) : null,
    upNow: now.alt >= 0,
  }
}
