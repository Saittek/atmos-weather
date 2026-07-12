/**
 * NASA FIRMS active-fire hotspots (public 24h CSV).
 * Cached in memory to avoid hammering NASA.
 */
const SOURCES = [
  // Prefer regional then global as fallback
  'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_24h.csv',
  'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv',
]

let cache = {
  at: 0,
  points: /** @type {Array<{lat:number,lon:number,brightness:number,frp:number,sat:string,acq:string}>} */ ([]),
}

const CACHE_MS = 15 * 60 * 1000

function parseCsv(text, satLabel) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const latI = header.indexOf('latitude')
  const lonI = header.indexOf('longitude')
  const brightI = header.findIndex((h) => h.includes('bright'))
  const frpI = header.indexOf('frp')
  const dateI = header.indexOf('acq_date')
  const timeI = header.indexOf('acq_time')
  if (latI < 0 || lonI < 0) return []

  const out = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    const lat = parseFloat(cols[latI])
    const lon = parseFloat(cols[lonI])
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue
    const brightness = brightI >= 0 ? parseFloat(cols[brightI]) || 0 : 0
    const frp = frpI >= 0 ? parseFloat(cols[frpI]) || 0 : 0
    const acq =
      dateI >= 0
        ? `${cols[dateI]}${timeI >= 0 ? ` ${cols[timeI]}` : ''}`
        : ''
    out.push({ lat, lon, brightness, frp, sat: satLabel, acq })
  }
  return out
}

async function loadAll() {
  if (Date.now() - cache.at < CACHE_MS && cache.points.length) {
    return cache.points
  }
  const points = []
  const seen = new Set()
  // Pull both MODIS + VIIRS for better coverage
  await Promise.all(
    SOURCES.map(async (url) => {
      try {
        const res = await fetch(url, {
          headers: { Accept: 'text/csv,*/*' },
          signal: AbortSignal.timeout(45000),
        })
        if (!res.ok) return
        const text = await res.text()
        const label = /viirs/i.test(url) ? 'VIIRS' : 'MODIS'
        const batch = parseCsv(text, label)
        for (const p of batch) {
          const k = `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`
          if (seen.has(k)) continue
          seen.add(k)
          points.push(p)
        }
      } catch {
        /* try other source */
      }
    }),
  )
  cache = { at: Date.now(), points }
  return points
}

/**
 * @param {number} lat
 * @param {number} lon
 * @param {number} radiusDeg ~ degrees half-span (0.5 ≈ 55km)
 * @param {number} limit
 */
export async function firesNear(lat, lon, radiusDeg = 2.5, limit = 120) {
  const all = await loadAll()
  const r = Math.max(0.3, Math.min(8, radiusDeg))
  const hits = []
  for (const p of all) {
    if (Math.abs(p.lat - lat) > r) continue
    if (Math.abs(p.lon - lon) > r) continue
    // rough distance score
    const d =
      (p.lat - lat) * (p.lat - lat) +
      (p.lon - lon) * (p.lon - lon) * Math.cos((lat * Math.PI) / 180) ** 2
    hits.push({ ...p, d })
  }
  hits.sort((a, b) => a.d - b.d || b.frp - a.frp)
  return hits.slice(0, limit).map(({ d: _d, ...rest }) => rest)
}
