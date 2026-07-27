/**
 * Severe-weather map layers (free public sources)
 * - IEM storm-based warning polygons (NWS TOR/SVR/FF…)
 * - SPC local storm reports (tornado / hail / wind)
 * - SPC Day 1 tornado (and categorical) outlook GeoJSON
 * - Nearest NEXRAD site for optional storm-relative velocity tiles (IEM RIDGE)
 * - NEXRAD storm attribute cells + motion vectors (IEM STI-like tracks)
 */

// ── types ────────────────────────────────────────────────────────────

export type WarningPhenomena = 'TO' | 'SV' | 'FF' | 'FA' | 'MA' | 'EW' | 'SQ' | 'OTHER'
export type WarningSignificance = 'W' | 'A' | 'Y' | 'S' | 'O' | string

export interface StormWarning {
  id: string
  phenomena: WarningPhenomena
  significance: WarningSignificance
  label: string
  wfo: string
  issue: string | null
  expire: string | null
  isEmergency: boolean
  isPds: boolean
  tornadoTag: string | null
  hailTag: string | null
  windTag: string | null
  /** GeoJSON geometry (Polygon | MultiPolygon) */
  geometry: GeoJsonGeometry
  href: string | null
}

export type StormReportKind = 'tornado' | 'hail' | 'wind'

export interface StormReport {
  id: string
  kind: StormReportKind
  lat: number
  lon: number
  timeUtc: string
  location: string
  county: string
  state: string
  /** EF scale / hail size (in) / wind speed (mph) as free text */
  magnitude: string
  comments: string
}

export interface SpcOutlookFeature {
  id: string
  /** DN risk code or LABEL from SPC */
  label: string
  dn: number | null
  fill: string
  stroke: string
  geometry: GeoJsonGeometry
}

export interface GeoJsonGeometry {
  type: string
  coordinates?: unknown
  geometries?: GeoJsonGeometry[]
}

export interface NexradSite {
  id: string
  name: string
  lat: number
  lon: number
}

// ── styling helpers ──────────────────────────────────────────────────

export function warningStyle(w: StormWarning): {
  color: string
  fillColor: string
  weight: number
  fillOpacity: number
  dashArray?: string
} {
  const isWatch = w.significance === 'A'
  const isAdvisory = w.significance === 'Y'
  if (w.phenomena === 'TO') {
    return {
      color: w.isEmergency || w.isPds ? '#ff00ff' : '#ef4444',
      fillColor: w.isEmergency || w.isPds ? '#c026d3' : '#dc2626',
      weight: isWatch ? 2 : 3,
      fillOpacity: isWatch ? 0.08 : 0.18,
      dashArray: isWatch ? '6 4' : undefined,
    }
  }
  if (w.phenomena === 'SV') {
    return {
      color: '#fbbf24',
      fillColor: '#f59e0b',
      weight: isWatch ? 2 : 2.5,
      fillOpacity: isWatch ? 0.06 : 0.14,
      dashArray: isWatch ? '6 4' : undefined,
    }
  }
  if (w.phenomena === 'FF' || w.phenomena === 'FA') {
    return {
      color: '#22c55e',
      fillColor: '#16a34a',
      weight: 2,
      fillOpacity: isAdvisory ? 0.06 : 0.12,
      dashArray: isWatch || isAdvisory ? '4 3' : undefined,
    }
  }
  return {
    color: '#94a3b8',
    fillColor: '#64748b',
    weight: 1.5,
    fillOpacity: 0.08,
  }
}

export function reportColor(kind: StormReportKind): string {
  if (kind === 'tornado') return '#f472b6'
  if (kind === 'hail') return '#67e8f9'
  return '#fbbf24'
}

/** SPC Day 1 tornado probability DN → fill */
export function outlookFill(dn: number | null, label: string): string {
  if (dn === 60 || /60|sig/i.test(label)) return 'rgba(255, 0, 255, 0.28)'
  if (dn === 45) return 'rgba(255, 0, 0, 0.26)'
  if (dn === 30) return 'rgba(255, 140, 0, 0.24)'
  if (dn === 15) return 'rgba(255, 255, 0, 0.22)'
  if (dn === 10) return 'rgba(255, 192, 203, 0.2)'
  if (dn === 5 || dn === 2) return 'rgba(96, 165, 250, 0.16)'
  // categorical fallback
  if (/high/i.test(label)) return 'rgba(255, 0, 255, 0.22)'
  if (/moderate|mdt/i.test(label)) return 'rgba(255, 0, 0, 0.2)'
  if (/enhanced|enh/i.test(label)) return 'rgba(255, 140, 0, 0.18)'
  if (/slight|slgt/i.test(label)) return 'rgba(255, 255, 0, 0.16)'
  if (/marginal|mrgl/i.test(label)) return 'rgba(0, 200, 0, 0.12)'
  return 'rgba(148, 163, 184, 0.12)'
}

// ── geometry utils ───────────────────────────────────────────────────

function hasUsableGeometry(g: GeoJsonGeometry | null | undefined): boolean {
  if (!g?.type) return false
  if (g.type === 'GeometryCollection') {
    return Array.isArray(g.geometries) && g.geometries.some((x) => hasUsableGeometry(x))
  }
  if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
    return Array.isArray(g.coordinates) && (g.coordinates as unknown[]).length > 0
  }
  return false
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toR = (d: number) => (d * Math.PI) / 180
  const dLat = toR(lat2 - lat1)
  const dLon = toR(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// ── fetch: storm-based warnings (IEM) ────────────────────────────────

const IEM_SBW = 'https://mesonet.agron.iastate.edu/geojson/sbw.geojson'
const NWS_ACTIVE = 'https://api.weather.gov/alerts/active?status=actual&message_type=alert'

function mapPhenomena(code: string): WarningPhenomena {
  const c = code.toUpperCase()
  if (c === 'TO' || c === 'SV' || c === 'FF' || c === 'FA' || c === 'MA' || c === 'EW' || c === 'SQ') {
    return c
  }
  return 'OTHER'
}

function parseIemSbw(data: {
  features?: {
    id?: string
    properties?: Record<string, unknown>
    geometry?: GeoJsonGeometry | null
  }[]
}): StormWarning[] {
  const out: StormWarning[] = []
  for (const f of data.features ?? []) {
    const p = f.properties ?? {}
    const geom = f.geometry
    if (!hasUsableGeometry(geom)) continue
    const phen = mapPhenomena(String(p.phenomena ?? ''))
    // Focus on convective / flood products
    if (!['TO', 'SV', 'FF', 'FA', 'EW', 'SQ'].includes(phen)) continue
    const sig = String(p.significance ?? 'W') as WarningSignificance
    out.push({
      id: String(f.id ?? `${p.wfo}-${p.phenomena}-${p.eventid}-${p.issue}`),
      phenomena: phen,
      significance: sig,
      label: String(p.ps ?? `${phen}.${sig}`),
      wfo: String(p.wfo ?? ''),
      issue: p.issue != null ? String(p.issue) : null,
      expire: p.expire != null ? String(p.expire) : p.expire_utc != null ? String(p.expire_utc) : null,
      isEmergency: Boolean(p.is_emergency),
      isPds: Boolean(p.is_pds),
      tornadoTag: p.tornadotag != null ? String(p.tornadotag) : null,
      hailTag: p.hailtag != null ? String(p.hailtag) : null,
      windTag: p.windtag != null ? String(p.windtag) : null,
      geometry: geom!,
      href: p.href != null ? String(p.href) : null,
    })
  }
  return out
}

/** Fallback: NWS active alerts that have polygon geometry */
function parseNwsPolygons(data: {
  features?: {
    id?: string
    properties?: Record<string, unknown>
    geometry?: GeoJsonGeometry | null
  }[]
}): StormWarning[] {
  const out: StormWarning[] = []
  const re =
    /tornado|severe thunderstorm|flash flood|flood warning|extreme wind|snow squall/i
  for (const f of data.features ?? []) {
    const p = f.properties ?? {}
    const event = String(p.event ?? '')
    if (!re.test(event)) continue
    if (!hasUsableGeometry(f.geometry)) continue
    let phen: WarningPhenomena = 'OTHER'
    const el = event.toLowerCase()
    if (el.includes('tornado')) phen = 'TO'
    else if (el.includes('thunderstorm')) phen = 'SV'
    else if (el.includes('flash flood')) phen = 'FF'
    else if (el.includes('flood')) phen = 'FA'
    else if (el.includes('extreme wind')) phen = 'EW'
    else if (el.includes('snow squall')) phen = 'SQ'
    const sig: WarningSignificance = /watch/i.test(event)
      ? 'A'
      : /advisory/i.test(event)
        ? 'Y'
        : 'W'
    out.push({
      id: String(f.id ?? p.id ?? event),
      phenomena: phen,
      significance: sig,
      label: event,
      wfo: String(p.senderName ?? p.sender ?? ''),
      issue: p.onset != null ? String(p.onset) : p.sent != null ? String(p.sent) : null,
      expire: p.ends != null ? String(p.ends) : p.expires != null ? String(p.expires) : null,
      isEmergency: /emergency/i.test(event) || /emergency/i.test(String(p.headline ?? '')),
      isPds: /particularly dangerous/i.test(String(p.headline ?? '')),
      tornadoTag: null,
      hailTag: null,
      windTag: null,
      geometry: f.geometry!,
      href: p['@id'] != null ? String(p['@id']) : null,
    })
  }
  return out
}

let sbwCache: { at: number; data: StormWarning[] } | null = null

export async function fetchStormWarnings(): Promise<StormWarning[]> {
  if (sbwCache && Date.now() - sbwCache.at < 90_000) return sbwCache.data
  try {
    const res = await fetch(IEM_SBW, { headers: { Accept: 'application/geo+json, application/json' } })
    if (res.ok) {
      const data = (await res.json()) as Parameters<typeof parseIemSbw>[0]
      const list = parseIemSbw(data)
      if (list.length || res.ok) {
        sbwCache = { at: Date.now(), data: list }
        return list
      }
    }
  } catch {
    /* fall through */
  }
  try {
    const res = await fetch(NWS_ACTIVE, {
      headers: {
        Accept: 'application/geo+json',
        'User-Agent': 'SolaraWeather/1.0 (https://solaraweather.com)',
      },
    })
    if (!res.ok) return sbwCache?.data ?? []
    const data = (await res.json()) as Parameters<typeof parseNwsPolygons>[0]
    const list = parseNwsPolygons(data)
    sbwCache = { at: Date.now(), data: list }
    return list
  } catch {
    return sbwCache?.data ?? []
  }
}

// ── fetch: SPC local storm reports ───────────────────────────────────

const SPC_TODAY = 'https://www.spc.noaa.gov/climo/reports/today.csv'

function spcConvectiveDate(): string {
  // SPC convective day: roughly after 12Z still "today"; file is always today.csv
  const d = new Date()
  // before 12Z UTC, also pull yesterday for continuity
  return d.toISOString().slice(2, 10).replace(/-/g, '') // yyMMdd — unused for today.csv
}

function parseSpcCsv(text: string, dayHint: string): StormReport[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  let kind: StormReportKind | null = null
  const out: StormReport[] = []
  let n = 0

  for (const line of lines) {
    if (line.startsWith('Time,F_Scale')) {
      kind = 'tornado'
      continue
    }
    if (line.startsWith('Time,Speed')) {
      kind = 'wind'
      continue
    }
    if (line.startsWith('Time,Size')) {
      kind = 'hail'
      continue
    }
    if (!kind || line.startsWith('Time,')) continue

    // CSV: Time,mag,Location,County,State,Lat,Lon,Comments
    const parts = splitCsv(line)
    if (parts.length < 7) continue
    const [time, mag, loc, county, state, latS, lonS, ...rest] = parts
    const lat = parseFloat(latS)
    const lon = parseFloat(lonS)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue
    const comments = rest.join(',').replace(/^"|"$/g, '')
    n += 1
    out.push({
      id: `${dayHint}-${kind}-${time}-${lat.toFixed(2)}-${lon.toFixed(2)}-${n}`,
      kind,
      lat,
      lon,
      timeUtc: time,
      location: loc || '',
      county: county || '',
      state: state || '',
      magnitude: mag || '',
      comments,
    })
  }
  return out
}

function splitCsv(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQ = !inQ
      continue
    }
    if (ch === ',' && !inQ) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur.trim())
  return out
}

let reportsCache: { at: number; data: StormReport[] } | null = null

export async function fetchSpcStormReports(): Promise<StormReport[]> {
  if (reportsCache && Date.now() - reportsCache.at < 120_000) return reportsCache.data
  const all: StormReport[] = []
  try {
    const res = await fetch(SPC_TODAY)
    if (res.ok) {
      const text = await res.text()
      all.push(...parseSpcCsv(text, 'today'))
    }
  } catch {
    /* ignore */
  }
  // Before ~15Z, include yesterday so overnight reports still show
  const hour = new Date().getUTCHours()
  if (hour < 15 || all.length < 3) {
    try {
      const d = new Date()
      d.setUTCDate(d.getUTCDate() - 1)
      const yy = String(d.getUTCFullYear()).slice(2)
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
      const dd = String(d.getUTCDate()).padStart(2, '0')
      const url = `https://www.spc.noaa.gov/climo/reports/${yy}${mm}${dd}_rpts.csv`
      const res = await fetch(url)
      if (res.ok) {
        const text = await res.text()
        all.push(...parseSpcCsv(text, `${yy}${mm}${dd}`))
      }
    } catch {
      /* ignore */
    }
  }
  // de-dupe by lat/lon/kind/time
  const seen = new Set<string>()
  const unique = all.filter((r) => {
    const k = `${r.kind}|${r.timeUtc}|${r.lat.toFixed(2)}|${r.lon.toFixed(2)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  reportsCache = { at: Date.now(), data: unique }
  void spcConvectiveDate
  return unique
}

// ── fetch: SPC Day 1 outlooks ────────────────────────────────────────

const SPC_TORN = 'https://www.spc.noaa.gov/products/outlook/day1otlk_torn.nolyr.geojson'
const SPC_CAT = 'https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson'

function parseOutlook(
  data: {
    features?: {
      properties?: Record<string, unknown>
      geometry?: GeoJsonGeometry | null
    }[]
  },
  prefix: string,
): SpcOutlookFeature[] {
  const out: SpcOutlookFeature[] = []
  let i = 0
  for (const f of data.features ?? []) {
    if (!hasUsableGeometry(f.geometry)) continue
    const p = f.properties ?? {}
    const dn = p.DN != null ? Number(p.DN) : null
    const label = String(p.LABEL2 || p.LABEL || (dn != null ? `${dn}%` : 'Risk'))
    const fill =
      p.fill && String(p.fill).startsWith('#')
        ? hexToRgba(String(p.fill), 0.22)
        : outlookFill(Number.isFinite(dn as number) ? dn : null, label)
    const stroke =
      p.stroke && String(p.stroke).startsWith('#')
        ? String(p.stroke)
        : 'rgba(255,255,255,0.35)'
    i += 1
    out.push({
      id: `${prefix}-${i}-${label}`,
      label,
      dn: Number.isFinite(dn as number) ? (dn as number) : null,
      fill,
      stroke,
      geometry: f.geometry!,
    })
  }
  return out
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return `rgba(148,163,184,${a})`
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}

let outlookCache: { at: number; torn: SpcOutlookFeature[]; cat: SpcOutlookFeature[] } | null =
  null

export async function fetchSpcOutlooks(): Promise<{
  tornado: SpcOutlookFeature[]
  categorical: SpcOutlookFeature[]
}> {
  if (outlookCache && Date.now() - outlookCache.at < 300_000) {
    return { tornado: outlookCache.torn, categorical: outlookCache.cat }
  }
  const [tornRes, catRes] = await Promise.all([
    fetch(SPC_TORN).catch(() => null),
    fetch(SPC_CAT).catch(() => null),
  ])
  let torn: SpcOutlookFeature[] = []
  let cat: SpcOutlookFeature[] = []
  if (tornRes?.ok) {
    try {
      torn = parseOutlook((await tornRes.json()) as Parameters<typeof parseOutlook>[0], 'torn')
    } catch {
      torn = []
    }
  }
  if (catRes?.ok) {
    try {
      cat = parseOutlook((await catRes.json()) as Parameters<typeof parseOutlook>[0], 'cat')
    } catch {
      cat = []
    }
  }
  outlookCache = { at: Date.now(), torn, cat }
  return { tornado: torn, categorical: cat }
}

// ── nearest NEXRAD for velocity tiles ────────────────────────────────

/** Subset of CONUS + Alaska/Hawaii WSR-88D sites for nearest-site velocity */
export const NEXRAD_SITES: NexradSite[] = [
  { id: 'KABR', name: 'Aberdeen', lat: 45.456, lon: -98.413 },
  { id: 'KABX', name: 'Albuquerque', lat: 35.15, lon: -106.824 },
  { id: 'KAMA', name: 'Amarillo', lat: 35.233, lon: -101.709 },
  { id: 'KBBX', name: 'Beale AFB', lat: 39.496, lon: -121.632 },
  { id: 'KBGM', name: 'Binghamton', lat: 42.2, lon: -75.985 },
  { id: 'KBIS', name: 'Bismarck', lat: 46.771, lon: -100.76 },
  { id: 'KBMX', name: 'Birmingham', lat: 33.172, lon: -86.77 },
  { id: 'KBOX', name: 'Boston', lat: 41.956, lon: -71.137 },
  { id: 'KBRO', name: 'Brownsville', lat: 25.916, lon: -97.419 },
  { id: 'KBUF', name: 'Buffalo', lat: 42.949, lon: -78.737 },
  { id: 'KBYX', name: 'Key West', lat: 24.598, lon: -81.703 },
  { id: 'KCAE', name: 'Columbia', lat: 33.949, lon: -81.118 },
  { id: 'KCBW', name: 'Caribou', lat: 46.039, lon: -67.806 },
  { id: 'KCBX', name: 'Boise', lat: 43.491, lon: -116.236 },
  { id: 'KCCX', name: 'State College', lat: 40.923, lon: -78.004 },
  { id: 'KCLE', name: 'Cleveland', lat: 41.413, lon: -81.86 },
  { id: 'KCLX', name: 'Charleston SC', lat: 32.655, lon: -81.042 },
  { id: 'KCRP', name: 'Corpus Christi', lat: 27.784, lon: -97.511 },
  { id: 'KCXX', name: 'Burlington', lat: 44.511, lon: -73.166 },
  { id: 'KCYS', name: 'Cheyenne', lat: 41.152, lon: -104.806 },
  { id: 'KDAX', name: 'Sacramento', lat: 38.501, lon: -121.678 },
  { id: 'KDDC', name: 'Dodge City', lat: 37.761, lon: -99.969 },
  { id: 'KDFX', name: 'Laughlin AFB', lat: 29.273, lon: -100.28 },
  { id: 'KDGX', name: 'Brandon MS', lat: 32.28, lon: -89.984 },
  { id: 'KDIX', name: 'Philadelphia', lat: 39.947, lon: -74.411 },
  { id: 'KDLH', name: 'Duluth', lat: 46.837, lon: -92.21 },
  { id: 'KDMX', name: 'Des Moines', lat: 41.731, lon: -93.723 },
  { id: 'KDOX', name: 'Dover', lat: 38.826, lon: -75.44 },
  { id: 'KDTX', name: 'Detroit', lat: 42.7, lon: -83.472 },
  { id: 'KDVN', name: 'Davenport', lat: 41.612, lon: -90.581 },
  { id: 'KDYX', name: 'Dyess AFB', lat: 32.538, lon: -99.254 },
  { id: 'KEAX', name: 'Kansas City', lat: 38.81, lon: -94.264 },
  { id: 'KEMX', name: 'Tucson', lat: 31.894, lon: -110.63 },
  { id: 'KENX', name: 'Albany', lat: 42.586, lon: -74.064 },
  { id: 'KEOX', name: 'Fort Rucker', lat: 31.46, lon: -85.459 },
  { id: 'KEPZ', name: 'El Paso', lat: 31.873, lon: -106.698 },
  { id: 'KESX', name: 'Las Vegas', lat: 35.701, lon: -114.891 },
  { id: 'KEVX', name: 'Eglin AFB', lat: 30.565, lon: -85.922 },
  { id: 'KEWX', name: 'Austin/San Antonio', lat: 29.704, lon: -98.028 },
  { id: 'KEYX', name: 'Edwards AFB', lat: 35.098, lon: -117.561 },
  { id: 'KFCX', name: 'Roanoke', lat: 37.024, lon: -80.274 },
  { id: 'KFDR', name: 'Frederick OK', lat: 34.362, lon: -98.976 },
  { id: 'KFDX', name: 'Cannon AFB', lat: 34.634, lon: -103.619 },
  { id: 'KFFC', name: 'Atlanta', lat: 33.363, lon: -84.566 },
  { id: 'KFSD', name: 'Sioux Falls', lat: 43.588, lon: -96.729 },
  { id: 'KFSX', name: 'Flagstaff', lat: 34.574, lon: -111.198 },
  { id: 'KFTG', name: 'Denver', lat: 39.786, lon: -104.546 },
  { id: 'KFWS', name: 'Dallas/Fort Worth', lat: 32.573, lon: -97.303 },
  { id: 'KGGW', name: 'Glasgow', lat: 48.206, lon: -106.625 },
  { id: 'KGJX', name: 'Grand Junction', lat: 39.062, lon: -108.214 },
  { id: 'KGLD', name: 'Goodland', lat: 39.367, lon: -101.7 },
  { id: 'KGRB', name: 'Green Bay', lat: 44.498, lon: -88.111 },
  { id: 'KGRK', name: 'Fort Hood', lat: 30.722, lon: -97.383 },
  { id: 'KGRR', name: 'Grand Rapids', lat: 42.894, lon: -85.545 },
  { id: 'KGSP', name: 'Greer', lat: 34.883, lon: -82.22 },
  { id: 'KGWX', name: 'Columbus AFB', lat: 33.897, lon: -88.329 },
  { id: 'KGYX', name: 'Portland ME', lat: 43.891, lon: -70.256 },
  { id: 'KHDX', name: 'Holloman AFB', lat: 33.077, lon: -106.12 },
  { id: 'KHGX', name: 'Houston', lat: 29.472, lon: -95.079 },
  { id: 'KHNX', name: 'San Joaquin', lat: 36.314, lon: -119.632 },
  { id: 'KHTX', name: 'Huntsville', lat: 34.931, lon: -86.084 },
  { id: 'KICT', name: 'Wichita', lat: 37.654, lon: -97.443 },
  { id: 'KICX', name: 'Cedar City', lat: 37.591, lon: -112.862 },
  { id: 'KILN', name: 'Wilmington OH', lat: 39.42, lon: -83.822 },
  { id: 'KILX', name: 'Lincoln IL', lat: 40.15, lon: -89.337 },
  { id: 'KIND', name: 'Indianapolis', lat: 39.708, lon: -86.28 },
  { id: 'KINX', name: 'Tulsa', lat: 36.175, lon: -95.564 },
  { id: 'KIWA', name: 'Phoenix', lat: 33.289, lon: -111.67 },
  { id: 'KIWX', name: 'North Webster', lat: 41.359, lon: -85.7 },
  { id: 'KJAX', name: 'Jacksonville', lat: 30.485, lon: -81.702 },
  { id: 'KJGX', name: 'Robins AFB', lat: 32.675, lon: -83.351 },
  { id: 'KJKL', name: 'Jackson KY', lat: 37.591, lon: -83.313 },
  { id: 'KLBB', name: 'Lubbock', lat: 33.654, lon: -101.814 },
  { id: 'KLCH', name: 'Lake Charles', lat: 30.125, lon: -93.216 },
  { id: 'KLIX', name: 'New Orleans', lat: 30.337, lon: -89.825 },
  { id: 'KLNX', name: 'North Platte', lat: 41.958, lon: -100.576 },
  { id: 'KLOT', name: 'Chicago', lat: 41.604, lon: -88.085 },
  { id: 'KLRX', name: 'Elko', lat: 40.74, lon: -116.803 },
  { id: 'KLSX', name: 'St. Louis', lat: 38.699, lon: -90.683 },
  { id: 'KLTX', name: 'Wilmington NC', lat: 33.989, lon: -78.429 },
  { id: 'KLVX', name: 'Louisville', lat: 37.975, lon: -85.944 },
  { id: 'KLWX', name: 'Sterling VA', lat: 38.975, lon: -77.478 },
  { id: 'KLZK', name: 'Little Rock', lat: 34.836, lon: -92.262 },
  { id: 'KMAF', name: 'Midland', lat: 31.943, lon: -102.189 },
  { id: 'KMAX', name: 'Medford', lat: 42.081, lon: -122.717 },
  { id: 'KMBX', name: 'Minot AFB', lat: 48.393, lon: -100.864 },
  { id: 'KMHX', name: 'Morehead City', lat: 34.776, lon: -76.876 },
  { id: 'KMKX', name: 'Milwaukee', lat: 42.968, lon: -88.551 },
  { id: 'KMLB', name: 'Melbourne', lat: 28.113, lon: -80.654 },
  { id: 'KMOB', name: 'Mobile', lat: 30.679, lon: -88.24 },
  { id: 'KMPX', name: 'Minneapolis', lat: 44.849, lon: -93.565 },
  { id: 'KMQT', name: 'Marquette', lat: 46.531, lon: -87.548 },
  { id: 'KMRX', name: 'Knoxville', lat: 36.168, lon: -83.402 },
  { id: 'KMSX', name: 'Missoula', lat: 47.041, lon: -113.986 },
  { id: 'KMTX', name: 'Salt Lake City', lat: 41.263, lon: -112.448 },
  { id: 'KMUX', name: 'San Francisco', lat: 37.155, lon: -121.898 },
  { id: 'KMVX', name: 'Grand Forks', lat: 47.528, lon: -97.325 },
  { id: 'KMXX', name: 'Maxwell AFB', lat: 32.537, lon: -85.79 },
  { id: 'KNKX', name: 'San Diego', lat: 32.919, lon: -117.042 },
  { id: 'KNQA', name: 'Memphis', lat: 35.345, lon: -89.873 },
  { id: 'KOAX', name: 'Omaha', lat: 41.32, lon: -96.367 },
  { id: 'KOHX', name: 'Nashville', lat: 36.247, lon: -86.563 },
  { id: 'KOKX', name: 'New York City', lat: 40.866, lon: -72.864 },
  { id: 'KOTX', name: 'Spokane', lat: 47.681, lon: -117.627 },
  { id: 'KPAH', name: 'Paducah', lat: 37.068, lon: -88.772 },
  { id: 'KPBZ', name: 'Pittsburgh', lat: 40.532, lon: -80.218 },
  { id: 'KPDT', name: 'Pendleton', lat: 45.691, lon: -118.853 },
  { id: 'KPOE', name: 'Fort Polk', lat: 31.156, lon: -92.976 },
  { id: 'KPUX', name: 'Pueblo', lat: 38.46, lon: -104.181 },
  { id: 'KRAX', name: 'Raleigh', lat: 35.666, lon: -78.49 },
  { id: 'KRGX', name: 'Reno', lat: 39.754, lon: -119.462 },
  { id: 'KRIW', name: 'Riverton', lat: 43.066, lon: -108.477 },
  { id: 'KRLX', name: 'Charleston WV', lat: 38.311, lon: -81.723 },
  { id: 'KRTX', name: 'Portland OR', lat: 45.715, lon: -122.965 },
  { id: 'KSFX', name: 'Pocatello', lat: 43.106, lon: -112.686 },
  { id: 'KSGF', name: 'Springfield MO', lat: 37.235, lon: -93.4 },
  { id: 'KSHV', name: 'Shreveport', lat: 32.451, lon: -93.841 },
  { id: 'KSJT', name: 'San Angelo', lat: 31.371, lon: -100.492 },
  { id: 'KSOX', name: 'Santa Ana Mtns', lat: 33.818, lon: -117.636 },
  { id: 'KSRX', name: 'Fort Smith', lat: 35.29, lon: -94.362 },
  { id: 'KTBW', name: 'Tampa Bay', lat: 27.706, lon: -82.402 },
  { id: 'KTFX', name: 'Great Falls', lat: 47.46, lon: -111.386 },
  { id: 'KTLH', name: 'Tallahassee', lat: 30.398, lon: -84.329 },
  { id: 'KTLX', name: 'Oklahoma City', lat: 35.333, lon: -97.278 },
  { id: 'KTWX', name: 'Topeka', lat: 38.997, lon: -96.232 },
  { id: 'KTYX', name: 'Montague', lat: 43.756, lon: -75.68 },
  { id: 'KUDX', name: 'Rapid City', lat: 44.125, lon: -102.83 },
  { id: 'KUEX', name: 'Hastings', lat: 40.321, lon: -98.442 },
  { id: 'KVAX', name: 'Moody AFB', lat: 30.89, lon: -83.002 },
  { id: 'KVBX', name: 'Vandenberg', lat: 34.838, lon: -120.398 },
  { id: 'KVNX', name: 'Vance AFB', lat: 36.741, lon: -98.128 },
  { id: 'KVTX', name: 'Los Angeles', lat: 34.412, lon: -119.179 },
  { id: 'KVWX', name: 'Evansville', lat: 38.26, lon: -87.724 },
  { id: 'KYUX', name: 'Yuma', lat: 32.495, lon: -114.657 },
]

// Fix typo if any
const CLEAN_SITES = NEXRAD_SITES.map((s) => ({
  ...s,
  id: s.id.replace('//', ''),
})).filter((s) => /^K[A-Z0-9]{3}$/.test(s.id))

export function nearestNexrad(
  lat: number,
  lon: number,
  maxKm = 450,
): { site: NexradSite; km: number } | null {
  let best: NexradSite | null = null
  let bestKm = Infinity
  for (const s of CLEAN_SITES) {
    const km = haversineKm(lat, lon, s.lat, s.lon)
    if (km < bestKm) {
      bestKm = km
      best = s
    }
  }
  if (!best || bestKm > maxKm) return null
  return { site: best, km: bestKm }
}

export type VelocityProduct = 'n0s' | 'n0u'

/**
 * IEM RIDGE single-site velocity tiles.
 * N0S = storm-relative velocity (best for rotation couplets)
 * N0U = base velocity
 */
export function velocityTileUrl(siteId: string, product: VelocityProduct = 'n0s'): string {
  const id = siteId.toUpperCase().startsWith('K') ? siteId.toUpperCase() : `K${siteId}`
  const code = product === 'n0u' ? 'N0U' : 'N0S'
  // "0" = latest scan in IEM ridge archive
  return `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::${id}-${code}-0/{z}/{x}/{y}.png`
}

export function baseVelocityTileUrl(siteId: string): string {
  return velocityTileUrl(siteId, 'n0u')
}

// ── NEXRAD storm attributes / tracks (IEM) ────────────────────────────

export interface StormCellTrack {
  id: string
  nexrad: string
  stormId: string
  lat: number
  lon: number
  /** Motion direction degrees (meteorological from, 0=N) */
  drct: number | null
  /** Speed knots */
  sknt: number | null
  maxDbz: number | null
  vil: number | null
  topKft: number | null
  tvs: string | null
  meso: string | null
  posh: number | null
  poh: number | null
  valid: string | null
}

const NEXRAD_ATTR_URL = 'https://mesonet.agron.iastate.edu/geojson/nexrad_attr.geojson'

let stormAttrCache: { at: number; data: StormCellTrack[] } | null = null

/**
 * Live NEXRAD storm-attribute cells (position + motion) from IEM.
 * Used as open-data “storm tracks” for chaser maps.
 */
export async function fetchNexradStormTracks(): Promise<StormCellTrack[]> {
  if (stormAttrCache && Date.now() - stormAttrCache.at < 90_000) {
    return stormAttrCache.data
  }
  try {
    const res = await fetch(NEXRAD_ATTR_URL, {
      headers: { Accept: 'application/geo+json, application/json' },
    })
    if (!res.ok) return stormAttrCache?.data ?? []
    const data = (await res.json()) as {
      features?: {
        id?: string | number
        properties?: Record<string, unknown>
        geometry?: { type?: string; coordinates?: number[] } | null
      }[]
    }
    const out: StormCellTrack[] = []
    for (const f of data.features ?? []) {
      const p = f.properties ?? {}
      const coords = f.geometry?.coordinates
      if (!coords || coords.length < 2) continue
      const lon = Number(coords[0])
      const lat = Number(coords[1])
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
      const nexrad = String(p.nexrad ?? '').toUpperCase()
      const stormId = String(p.storm_id ?? p.stormid ?? '')
      const maxDbz = p.max_dbz != null ? Number(p.max_dbz) : null
      // Skip very weak clear-air clutter when possible
      if (maxDbz != null && Number.isFinite(maxDbz) && maxDbz < 25) continue
      out.push({
        id: `${nexrad}-${stormId}-${lat.toFixed(3)}-${lon.toFixed(3)}-${f.id ?? out.length}`,
        nexrad,
        stormId,
        lat,
        lon,
        drct: p.drct != null && Number.isFinite(Number(p.drct)) ? Number(p.drct) : null,
        sknt: p.sknt != null && Number.isFinite(Number(p.sknt)) ? Number(p.sknt) : null,
        maxDbz: maxDbz != null && Number.isFinite(maxDbz) ? maxDbz : null,
        vil: p.vil != null && Number.isFinite(Number(p.vil)) ? Number(p.vil) : null,
        topKft: p.top != null && Number.isFinite(Number(p.top)) ? Number(p.top) : null,
        tvs: p.tvs != null ? String(p.tvs) : null,
        meso: p.meso != null ? String(p.meso) : null,
        posh: p.posh != null && Number.isFinite(Number(p.posh)) ? Number(p.posh) : null,
        poh: p.poh != null && Number.isFinite(Number(p.poh)) ? Number(p.poh) : null,
        valid: p.valid != null ? String(p.valid) : null,
      })
    }
    stormAttrCache = { at: Date.now(), data: out }
    return out
  } catch {
    return stormAttrCache?.data ?? []
  }
}

/** Project a motion vector tip (km ahead along storm motion). */
export function stormMotionTip(
  lat: number,
  lon: number,
  drctDeg: number,
  sknt: number,
  minutes = 30,
): [number, number] {
  // drct = direction FROM which storm is coming? NEXRAD attributes are usually
  // direction of motion (toward). IEM field `drct` is storm motion direction (degrees).
  const speedKmh = sknt * 1.852
  const distKm = (speedKmh * minutes) / 60
  const rad = (drctDeg * Math.PI) / 180
  const dLat = (distKm / 111.32) * Math.cos(rad)
  const dLon =
    (distKm / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)))) * Math.sin(rad)
  return [lat + dLat, lon + dLon]
}

export function stormCellColor(cell: StormCellTrack): string {
  if (cell.tvs && cell.tvs !== 'NONE') return '#ff00ff'
  if (cell.meso && cell.meso !== 'NONE') return '#f472b6'
  if ((cell.posh ?? 0) >= 50) return '#ef4444'
  if ((cell.maxDbz ?? 0) >= 55) return '#f97316'
  if ((cell.maxDbz ?? 0) >= 45) return '#fbbf24'
  return '#38bdf8'
}

// ── geometry: point-in / distance ────────────────────────────────────

function ringContains(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-15) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function pointInPolygon(lon: number, lat: number, coords: number[][][]): boolean {
  if (!coords?.length || !coords[0]?.length) return false
  if (!ringContains(lon, lat, coords[0])) return false
  for (let h = 1; h < coords.length; h++) {
    if (ringContains(lon, lat, coords[h])) return false
  }
  return true
}

export function pointInGeometry(
  lon: number,
  lat: number,
  geometry: GeoJsonGeometry | null | undefined,
): boolean {
  if (!geometry?.type) return false
  if (geometry.type === 'Polygon') {
    return pointInPolygon(lon, lat, geometry.coordinates as number[][][])
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as number[][][][]).some((p) => pointInPolygon(lon, lat, p))
  }
  if (geometry.type === 'GeometryCollection' && geometry.geometries) {
    return geometry.geometries.some((g) => pointInGeometry(lon, lat, g))
  }
  return false
}

function distPointToSegmentKm(
  lat: number,
  lon: number,
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  // Approximate planar projection near the segment for edge distance
  const midLat = ((lat1 + lat2) / 2) * (Math.PI / 180)
  const kx = Math.cos(midLat) * 111.32
  const ky = 110.57
  const x = lon * kx
  const y = lat * ky
  const x1 = lon1 * kx
  const y1 = lat1 * ky
  const x2 = lon2 * kx
  const y2 = lat2 * ky
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) return haversineKm(lat, lon, lat1, lon1)
  let t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)
  t = Math.max(0, Math.min(1, t))
  const px = x1 + t * dx
  const py = y1 + t * dy
  return Math.hypot(x - px, y - py)
}

function distToRingKm(lat: number, lon: number, ring: number[][]): number {
  let min = Infinity
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]
    const b = ring[i + 1]
    min = Math.min(min, distPointToSegmentKm(lat, lon, a[1], a[0], b[1], b[0]))
  }
  return min
}

/** Distance in km to polygon boundary (0 if inside). */
export function distanceToGeometryKm(
  lat: number,
  lon: number,
  geometry: GeoJsonGeometry | null | undefined,
): number {
  if (!geometry) return Infinity
  if (pointInGeometry(lon, lat, geometry)) return 0

  const polygons: number[][][][] = []
  if (geometry.type === 'Polygon') polygons.push(geometry.coordinates as number[][][])
  else if (geometry.type === 'MultiPolygon') {
    polygons.push(...(geometry.coordinates as number[][][][]))
  } else if (geometry.type === 'GeometryCollection' && geometry.geometries) {
    return Math.min(
      ...geometry.geometries.map((g) => distanceToGeometryKm(lat, lon, g)),
      Infinity,
    )
  } else return Infinity

  let min = Infinity
  for (const poly of polygons) {
    if (!poly?.[0]) continue
    min = Math.min(min, distToRingKm(lat, lon, poly[0]))
  }
  return min
}

export function geometryCentroid(geometry: GeoJsonGeometry): { lat: number; lon: number } | null {
  const pts: number[][] = []
  const walk = (g: GeoJsonGeometry) => {
    if (g.type === 'Polygon') {
      const ring = (g.coordinates as number[][][])[0]
      if (ring) for (const p of ring) pts.push(p)
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates as number[][][][]) {
        const ring = poly[0]
        if (ring) for (const p of ring) pts.push(p)
      }
    } else if (g.type === 'GeometryCollection' && g.geometries) {
      g.geometries.forEach(walk)
    }
  }
  walk(geometry)
  if (!pts.length) return null
  let sx = 0
  let sy = 0
  for (const p of pts) {
    sx += p[0]
    sy += p[1]
  }
  return { lon: sx / pts.length, lat: sy / pts.length }
}

export interface NearbyThreat {
  warning: StormWarning
  /** 0 = inside polygon */
  distanceKm: number
  inside: boolean
  rank: number
  centroid: { lat: number; lon: number } | null
}

function threatRank(w: StormWarning, inside: boolean, distKm: number): number {
  let r = 0
  if (w.phenomena === 'TO') r += 50
  else if (w.phenomena === 'SV') r += 35
  else if (w.phenomena === 'FF') r += 30
  else if (w.phenomena === 'EW') r += 28
  else r += 10
  if (w.significance === 'W') r += 15
  else if (w.significance === 'A') r += 8
  if (w.isEmergency || w.isPds) r += 20
  if (inside) r += 25
  else r += Math.max(0, 15 - distKm)
  return r
}

/** Find TOR/SVR/FF threats near a point (inside or within maxKm). */
export function findNearbyThreats(
  lat: number,
  lon: number,
  warnings: StormWarning[],
  maxKm = 80,
): NearbyThreat[] {
  const out: NearbyThreat[] = []
  for (const w of warnings) {
    if (!['TO', 'SV', 'FF', 'EW', 'SQ'].includes(w.phenomena)) continue
    // Watches: only if inside or very close
    const cap = w.significance === 'A' ? Math.min(maxKm, 40) : maxKm
    const dist = distanceToGeometryKm(lat, lon, w.geometry)
    if (dist > cap) continue
    const inside = dist === 0
    out.push({
      warning: w,
      distanceKm: dist,
      inside,
      rank: threatRank(w, inside, dist),
      centroid: geometryCentroid(w.geometry),
    })
  }
  out.sort((a, b) => b.rank - a.rank || a.distanceKm - b.distanceKm)
  return out
}

// ── SPC watch boxes (IEM) ────────────────────────────────────────────

const IEM_SPC_WATCH = 'https://mesonet.agron.iastate.edu/json/spcwatch.py?geojson'

let watchCache: { at: number; data: StormWarning[] } | null = null

export async function fetchSpcWatches(): Promise<StormWarning[]> {
  if (watchCache && Date.now() - watchCache.at < 120_000) return watchCache.data
  try {
    const res = await fetch(IEM_SPC_WATCH, {
      headers: { Accept: 'application/geo+json, application/json' },
    })
    if (!res.ok) return watchCache?.data ?? []
    const data = (await res.json()) as {
      features?: {
        id?: string | number
        properties?: Record<string, unknown>
        geometry?: GeoJsonGeometry | null
      }[]
    }
    const out: StormWarning[] = []
    for (const f of data.features ?? []) {
      if (!hasUsableGeometry(f.geometry)) continue
      const p = f.properties ?? {}
      const t = String(p.type ?? '').toUpperCase()
      const phen: WarningPhenomena = t.includes('TOR') ? 'TO' : t.includes('SVR') ? 'SV' : 'OTHER'
      if (phen === 'OTHER') continue
      const num = p.number != null ? String(p.number) : String(f.id ?? '')
      out.push({
        id: `spc-watch-${p.year ?? ''}-${num}`,
        phenomena: phen,
        significance: 'A',
        label:
          phen === 'TO'
            ? `Tornado Watch ${num}`
            : `Severe Thunderstorm Watch ${num}`,
        wfo: 'SPC',
        issue: p.issue != null ? String(p.issue) : null,
        expire: p.expire != null ? String(p.expire) : null,
        isEmergency: false,
        isPds: Boolean(p.is_pds),
        tornadoTag: null,
        hailTag: p.max_hail_size != null ? `${p.max_hail_size}"` : null,
        windTag:
          p.max_wind_gust_knots != null
            ? `${Math.round(Number(p.max_wind_gust_knots))} kt`
            : null,
        geometry: f.geometry!,
        href: p.spcurl != null ? String(p.spcurl) : null,
      })
    }
    watchCache = { at: Date.now(), data: out }
    return out
  } catch {
    return watchCache?.data ?? []
  }
}

// ── ECCC warning polygons (Canada) ───────────────────────────────────

const EC_ALERTS =
  'https://api.weather.gc.ca/collections/weather-alerts/items'

export function isCanadaRegion(lat: number, lon: number): boolean {
  return lat >= 41 && lat <= 84 && lon >= -141 && lon <= -52
}

let ecccCache: { at: number; key: string; data: StormWarning[] } | null = null

export async function fetchEcccWarningPolygons(
  lat?: number,
  lon?: number,
): Promise<StormWarning[]> {
  const key =
    lat != null && lon != null
      ? `${lat.toFixed(1)},${lon.toFixed(1)}`
      : 'national'
  if (ecccCache && ecccCache.key === key && Date.now() - ecccCache.at < 120_000) {
    return ecccCache.data
  }
  try {
    let url: string
    if (lat != null && lon != null) {
      const d = 4
      const bbox = [lon - d, lat - d, lon + d, lat + d].map((n) => n.toFixed(3)).join(',')
      url = `${EC_ALERTS}?f=json&limit=100&bbox=${bbox}`
    } else {
      url = `${EC_ALERTS}?f=json&limit=100`
    }
    const res = await fetch(url, { headers: { Accept: 'application/geo+json' } })
    if (!res.ok) return ecccCache?.data ?? []
    const data = (await res.json()) as {
      features?: {
        id?: string
        properties?: Record<string, unknown>
        geometry?: GeoJsonGeometry | null
      }[]
    }
    const out: StormWarning[] = []
    for (const f of data.features ?? []) {
      if (!hasUsableGeometry(f.geometry)) continue
      const p = f.properties ?? {}
      const status = String(p.status_en ?? '').toLowerCase()
      if (status === 'ended' || status === 'cancelled' || status === 'canceled' || status === 'expired')
        continue
      const name = String(p.alert_name_en ?? p.alert_short_name_en ?? 'Alert')
      const type = String(p.alert_type ?? '').toLowerCase()
      const text = `${name} ${type} ${p.alert_text_en ?? ''}`.toLowerCase()
      if (
        !/tornado|thunderstorm|severe|flash flood|squall|wind warning|hurricane|tropical/.test(
          text,
        )
      ) {
        continue
      }
      let phen: WarningPhenomena = 'OTHER'
      if (text.includes('tornado')) phen = 'TO'
      else if (text.includes('thunderstorm') || text.includes('severe')) phen = 'SV'
      else if (text.includes('flash flood') || text.includes('flood')) phen = 'FF'
      else if (text.includes('squall')) phen = 'SQ'
      else if (text.includes('wind')) phen = 'EW'
      else phen = 'SV'

      const sig: WarningSignificance =
        type === 'warning' || /warning/i.test(name)
          ? 'W'
          : type === 'watch' || /watch/i.test(name)
            ? 'A'
            : type === 'advisory' || /advisory/i.test(name)
              ? 'Y'
              : 'W'

      out.push({
        id: `eccc-${String(f.id ?? p.id ?? name)}`,
        phenomena: phen,
        significance: sig,
        label: name,
        wfo: String(p.province ?? 'ECCC'),
        issue: p.publication_datetime != null ? String(p.publication_datetime) : null,
        expire:
          p.event_end_datetime != null
            ? String(p.event_end_datetime)
            : p.expiration_datetime != null
              ? String(p.expiration_datetime)
              : null,
        isEmergency: /emergency/i.test(name),
        isPds: false,
        tornadoTag: null,
        hailTag: null,
        windTag: null,
        geometry: f.geometry!,
        href: 'https://www.weather.gc.ca/',
      })
    }
    ecccCache = { at: Date.now(), key, data: out }
    return out
  } catch {
    return ecccCache?.data ?? []
  }
}

/** Combined US SBW + SPC watches + ECCC polygons for proximity + map. */
export async function fetchAllThreatPolygons(
  lat?: number,
  lon?: number,
): Promise<StormWarning[]> {
  const [sbw, watches, eccc] = await Promise.all([
    fetchStormWarnings(),
    fetchSpcWatches(),
    lat != null && lon != null && isCanadaRegion(lat, lon)
      ? fetchEcccWarningPolygons(lat, lon)
      : lat != null && lon != null
        ? Promise.resolve([])
        : fetchEcccWarningPolygons(),
  ])
  const seen = new Set<string>()
  const out: StormWarning[] = []
  for (const w of [...sbw, ...watches, ...eccc]) {
    if (seen.has(w.id)) continue
    seen.add(w.id)
    out.push(w)
  }
  return out
}

// ── SPC Mesoscale Discussions (RSS) ──────────────────────────────────

export interface SpcMdItem {
  id: string
  title: string
  link: string
  summary: string
  pubDate: string | null
}

let mdCache: { at: number; data: SpcMdItem[] } | null = null

export async function fetchSpcMesoscaleDiscussions(): Promise<SpcMdItem[]> {
  if (mdCache && Date.now() - mdCache.at < 180_000) return mdCache.data
  try {
    const res = await fetch('https://www.spc.noaa.gov/products/spcmdrss.xml')
    if (!res.ok) return mdCache?.data ?? []
    const xml = await res.text()
    const items: SpcMdItem[] = []
    const itemRe = /<item>([\s\S]*?)<\/item>/gi
    let m: RegExpExecArray | null
    while ((m = itemRe.exec(xml)) && items.length < 12) {
      const block = m[1]
      const title = (block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '')
        .replace(/<!\[CDATA\[|\]\]>/g, '')
        .trim()
      const link = (block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? '').trim()
      const desc = (block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? '')
        .replace(/<!\[CDATA\[|\]\]>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      const pub = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() ?? null
      if (!title) continue
      items.push({
        id: link || title,
        title,
        link: link || 'https://www.spc.noaa.gov/products/md/',
        summary: desc.slice(0, 220),
        pubDate: pub,
      })
    }
    mdCache = { at: Date.now(), data: items }
    return items
  } catch {
    return mdCache?.data ?? []
  }
}

export { haversineKm }
