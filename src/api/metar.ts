/**
 * Nearest METAR surface observation (aviationweather.gov).
 * Prefer Worker proxy (CORS + caching); fall back to direct AWC when allowed.
 */
import { getApiBase } from '../lib/native'

export interface MetarObs {
  icao: string
  name: string
  lat: number
  lon: number
  tempC: number | null
  dewpC: number | null
  windDir: number | null
  /** Wind speed in knots (as reported) */
  windKt: number | null
  visSm: string | null
  altimHpa: number | null
  cover: string | null
  raw: string
  /** Observation time (unix seconds) */
  obsTime: number
  distanceKm: number
}

const cache = new Map<string, { at: number; data: MetarObs | null }>()
const TTL_MS = 4 * 60_000

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toR = (d: number) => (d * Math.PI) / 180
  const dLat = toR(lat2 - lat1)
  const dLon = toR(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

function parseVisib(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v === 'string' && v.trim()) return v.trim()
  return null
}

function pickNearest(rows: unknown[], lat: number, lon: number): MetarObs | null {
  if (!Array.isArray(rows) || !rows.length) return null

  type Row = {
    icaoId?: string
    name?: string
    lat?: number
    lon?: number
    temp?: number
    dewp?: number
    wdir?: number
    wspd?: number
    visib?: string | number
    altim?: number
    cover?: string
    rawOb?: string
    obsTime?: number
    reportTime?: string
  }

  let best: MetarObs | null = null
  for (const raw of rows) {
    const r = raw as Row
    if (typeof r.lat !== 'number' || typeof r.lon !== 'number') continue
    if (typeof r.temp !== 'number' || !Number.isFinite(r.temp)) continue
    const icao = typeof r.icaoId === 'string' ? r.icaoId : ''
    if (!icao) continue
    const dist = haversineKm(lat, lon, r.lat, r.lon)
    // Ignore stations farther than ~120 km — not representative
    if (dist > 120) continue
    const obsTime =
      typeof r.obsTime === 'number' && r.obsTime > 1e9
        ? r.obsTime > 1e12
          ? Math.floor(r.obsTime / 1000)
          : r.obsTime
        : r.reportTime
          ? Math.floor(new Date(r.reportTime).getTime() / 1000)
          : 0
    // Drop very stale (> 3 h)
    if (obsTime && Date.now() / 1000 - obsTime > 3 * 3600) continue

    const cand: MetarObs = {
      icao,
      name: typeof r.name === 'string' ? r.name : icao,
      lat: r.lat,
      lon: r.lon,
      tempC: r.temp,
      dewpC: typeof r.dewp === 'number' ? r.dewp : null,
      windDir: typeof r.wdir === 'number' ? r.wdir : null,
      windKt: typeof r.wspd === 'number' ? r.wspd : null,
      visSm: parseVisib(r.visib),
      altimHpa: typeof r.altim === 'number' ? r.altim : null,
      cover: typeof r.cover === 'string' ? r.cover : null,
      raw: typeof r.rawOb === 'string' ? r.rawOb : '',
      obsTime,
      distanceKm: dist,
    }
    if (!best || cand.distanceKm < best.distanceKm) best = cand
  }
  return best
}

async function fetchAwcDirect(lat: number, lon: number): Promise<MetarObs | null> {
  // Expand box until we find something (rural areas)
  for (const d of [0.6, 1.2, 2.0]) {
    const bbox = `${lat - d},${lon - d},${lat + d},${lon + d}`
    const url = `https://aviationweather.gov/api/data/metar?bbox=${encodeURIComponent(bbox)}&format=json&hours=2`
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) continue
      const data = await res.json()
      const list = Array.isArray(data) ? data : data?.data
      const hit = pickNearest(list ?? [], lat, lon)
      if (hit) return hit
    } catch {
      /* CORS or network — try next / proxy */
    }
  }
  return null
}

async function fetchViaWorker(lat: number, lon: number): Promise<MetarObs | null> {
  const base = getApiBase()
  const url = `${base}/api/metar?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = await res.json()
    if (data?.metar && typeof data.metar.icao === 'string') {
      return data.metar as MetarObs
    }
    return null
  } catch {
    return null
  }
}

/** Nearest usable METAR within ~120 km (cached ~4 min). */
export async function fetchNearestMetar(lat: number, lon: number): Promise<MetarObs | null> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data

  // Worker first (reliable CORS), then direct AWC
  let data = await fetchViaWorker(lat, lon)
  if (!data) data = await fetchAwcDirect(lat, lon)

  cache.set(key, { at: Date.now(), data })
  if (cache.size > 40) {
    const first = cache.keys().next().value
    if (first != null) cache.delete(first)
  }
  return data
}

/** Compact UI line, e.g. "METAR KMKC · 8 km · 32° · 12 min ago" */
export function formatMetarLine(
  m: MetarObs,
  units: 'metric' | 'imperial',
  nowMs = Date.now(),
): string {
  const temp =
    m.tempC == null
      ? '—'
      : units === 'imperial'
        ? `${Math.round((m.tempC * 9) / 5 + 32)}°F`
        : `${Math.round(m.tempC)}°C`
  const dist =
    units === 'imperial'
      ? `${Math.max(1, Math.round(m.distanceKm * 0.621371))} mi`
      : `${Math.max(1, Math.round(m.distanceKm))} km`
  let age = ''
  if (m.obsTime > 0) {
    const mins = Math.max(0, Math.round((nowMs / 1000 - m.obsTime) / 60))
    if (mins < 60) age = ` · ${mins} min ago`
    else age = ` · ${Math.round(mins / 60)} h ago`
  }
  const wind =
    m.windKt != null && m.windKt > 0
      ? units === 'imperial'
        ? ` · wind ${Math.round(m.windKt)} kt`
        : ` · wind ${Math.round(m.windKt * 1.852)} km/h`
      : ''
  return `METAR ${m.icao} · ${dist} · ${temp}${wind}${age}`
}
