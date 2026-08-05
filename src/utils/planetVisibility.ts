/**
 * Rough bright-planet altitude for planning (circular orbit approximations).
 * Labels only — not for precise ephemerides.
 */

export interface PlanetStatus {
  id: string
  name: string
  emoji: string
  alt: number
  visible: boolean
  note: string
}

function julian(ms: number): number {
  return ms / 86400000 + 2440587.5
}

/** Mean ecliptic longitude of a planet (very rough). */
function planetLon(id: string, jd: number): number {
  const T = (jd - 2451545.0) / 36525
  // Simplified mean longitudes (deg)
  switch (id) {
    case 'mercury':
      return (252.25 + 149472.67 * T) % 360
    case 'venus':
      return (181.98 + 58517.82 * T) % 360
    case 'mars':
      return (355.43 + 19140.3 * T) % 360
    case 'jupiter':
      return (34.35 + 3034.91 * T) % 360
    case 'saturn':
      return (50.08 + 1222.11 * T) % 360
    default:
      return 0
  }
}

function sunLon(jd: number): number {
  const T = (jd - 2451545.0) / 36525
  return (280.466 + 36000.77 * T) % 360
}

function eclipticToAlt(lat: number, lon: number, eclLon: number, ms: number): number {
  const jd = julian(ms)
  const rad = Math.PI / 180
  const eps = 23.439 * rad
  const l = eclLon * rad
  const ra = Math.atan2(Math.sin(l) * Math.cos(eps), Math.cos(l))
  const dec = Math.asin(Math.sin(l) * Math.sin(eps))
  const t = (jd - 2451545.0) / 36525
  let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * t * t
  gmst = ((gmst % 360) + 360) % 360
  const lst = ((gmst + lon) % 360) * rad
  const ha = lst - ra
  const latR = lat * rad
  const alt = Math.asin(
    Math.sin(latR) * Math.sin(dec) + Math.cos(latR) * Math.cos(dec) * Math.cos(ha),
  )
  return (alt * 180) / Math.PI
}

const PLANETS: { id: string; name: string; emoji: string }[] = [
  { id: 'venus', name: 'Venus', emoji: '♀️' },
  { id: 'mars', name: 'Mars', emoji: '♂️' },
  { id: 'jupiter', name: 'Jupiter', emoji: '♃' },
  { id: 'saturn', name: 'Saturn', emoji: '♄' },
  { id: 'mercury', name: 'Mercury', emoji: '☿️' },
]

export function brightPlanetsTonight(
  lat: number,
  lon: number,
  atMs = Date.now(),
): PlanetStatus[] {
  const jd = julian(atMs)
  // Sample mid-evening (~3h after local sunset proxy: 22:00 local-ish via UTC offset skip)
  const evening = atMs + 4 * 3600_000
  const out: PlanetStatus[] = []
  for (const p of PLANETS) {
    const L = planetLon(p.id, jd)
    const S = sunLon(jd)
    let elong = Math.abs(((L - S + 540) % 360) - 180)
    // elongation 0–180
    elong = Math.min(elong, 360 - elong)
    const alt = eclipticToAlt(lat, lon, L, evening)
    const visible = alt > 8 && elong > 15
    let note = visible ? `~${Math.round(alt)}° evening altitude` : 'Low or near sun'
    if (p.id === 'mercury' && elong < 18) note = 'Too close to sun'
    if (elong > 40 && alt > 20) note = `Well placed (~${Math.round(alt)}°)`
    out.push({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      alt: Math.round(alt),
      visible,
      note,
    })
  }
  return out.sort((a, b) => Number(b.visible) - Number(a.visible) || b.alt - a.alt)
}
