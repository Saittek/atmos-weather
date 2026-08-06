/**
 * Rough altitude/azimuth for a few catalog objects (mean RA/Dec).
 * Planning aid only.
 */

export interface TargetAlt {
  id: string
  name: string
  emoji: string
  raHours: number
  decDeg: number
  altNow: number
  altPeakTonight: number
  visible: boolean
  note: string
}

/** Fixed J2000-ish positions */
const CATALOG: { id: string; name: string; emoji: string; ra: number; dec: number }[] = [
  { id: 'm31', name: 'Andromeda (M31)', emoji: '🌌', ra: 0.712, dec: 41.27 },
  { id: 'm42', name: 'Orion Nebula (M42)', emoji: '✨', ra: 5.588, dec: -5.39 },
  { id: 'm45', name: 'Pleiades (M45)', emoji: '💎', ra: 3.783, dec: 24.12 },
  { id: 'm13', name: 'Hercules Cluster (M13)', emoji: '🔮', ra: 16.695, dec: 36.46 },
  { id: 'm51', name: 'Whirlpool (M51)', emoji: '🌀', ra: 13.498, dec: 47.2 },
  { id: 'm8', name: 'Lagoon (M8)', emoji: '🎯', ra: 18.06, dec: -24.38 },
  { id: 'polaris', name: 'Polaris', emoji: '⭐', ra: 2.53, dec: 89.26 },
]

function lstHours(lon: number, ms: number): number {
  const jd = ms / 86400000 + 2440587.5
  const t = (jd - 2451545.0) / 36525
  let gmst =
    280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * t * t
  gmst = ((gmst % 360) + 360) % 360
  const lst = ((gmst + lon) % 360) / 15
  return (lst + 24) % 24
}

function altitude(lat: number, lon: number, raH: number, decD: number, ms: number): number {
  const lst = lstHours(lon, ms)
  const ha = ((lst - raH) * 15 * Math.PI) / 180
  const latR = (lat * Math.PI) / 180
  const dec = (decD * Math.PI) / 180
  const alt = Math.asin(
    Math.sin(latR) * Math.sin(dec) + Math.cos(latR) * Math.cos(dec) * Math.cos(ha),
  )
  return (alt * 180) / Math.PI
}

export function targetAltitudes(
  lat: number,
  lon: number,
  atMs = Date.now(),
): TargetAlt[] {
  const out: TargetAlt[] = []
  for (const c of CATALOG) {
    const altNow = altitude(lat, lon, c.ra, c.dec, atMs)
    // Sample next 14 hours for peak
    let peak = altNow
    for (let h = 1; h <= 14; h++) {
      const a = altitude(lat, lon, c.ra, c.dec, atMs + h * 3600_000)
      if (a > peak) peak = a
    }
    const visible = peak > 15
    let note = visible
      ? `Now ${Math.round(altNow)}° · peak ~${Math.round(peak)}° tonight`
      : 'Stays low from this latitude'
    if (c.id === 'polaris') note = `Always ~${Math.round(lat)}° altitude (north)`
    out.push({
      id: c.id,
      name: c.name,
      emoji: c.emoji,
      raHours: c.ra,
      decDeg: c.dec,
      altNow: Math.round(altNow),
      altPeakTonight: Math.round(peak),
      visible,
      note,
    })
  }
  return out.sort((a, b) => b.altPeakTonight - a.altPeakTonight)
}
