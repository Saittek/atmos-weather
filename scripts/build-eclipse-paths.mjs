/**
 * Parse NASA GSFC solar eclipse path tables → src/data/solarEclipses.ts
 * Run: node scripts/build-eclipse-paths.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

function parseDms(latStr, lonStr) {
  const pl = (s) => {
    s = String(s || '').trim()
    if (!s || s === '-') return null
    const m = s.match(/^(\d+)\s+(\d+(?:\.\d+)?)([NSEW])$/i)
    if (!m) return null
    let v = Number(m[1]) + Number(m[2]) / 60
    const hemi = m[3].toUpperCase()
    if (hemi === 'S' || hemi === 'W') v = -v
    return v
  }
  return { lat: pl(latStr), lon: pl(lonStr) }
}

function dest(lon, lat, bearingDeg, distKm) {
  const R = 6371
  const br = (bearingDeg * Math.PI) / 180
  const φ1 = (lat * Math.PI) / 180
  const λ1 = (lon * Math.PI) / 180
  const δ = distKm / R
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(br),
  )
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(br) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    )
  return [((((λ2 * 180) / Math.PI + 540) % 360) - 180), (φ2 * 180) / Math.PI]
}

function partialBand(central, halfWidthKm = 4200) {
  if (!central || central.length < 2) return null
  const left = []
  const right = []
  for (let i = 0; i < central.length; i++) {
    const [lon, lat] = central[i]
    const [lon2, lat2] = central[Math.min(i + 1, central.length - 1)]
    const [lon0, lat0] = central[Math.max(i - 1, 0)]
    const y =
      Math.sin(((lon2 - lon0) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180)
    const x =
      Math.cos((lat0 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
      Math.sin((lat0 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.cos(((lon2 - lon0) * Math.PI) / 180)
    const br = (Math.atan2(y, x) * 180) / Math.PI
    left.push(dest(lon, lat, br - 90, halfWidthKm))
    right.push(dest(lon, lat, br + 90, halfWidthKm))
  }
  const ring = [...left, ...right.reverse()]
  ring.push([...ring[0]])
  return [ring]
}

function parsePathTable(html, meta) {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, '\n')
  const allN = []
  const allS = []
  const allC = []
  let limCount = 0

  for (const raw of text.split(/\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim()
    let m = line.match(
      /^Limits\s+(\d+\s+\d+(?:\.\d+)?[NS])\s+(\d+\s+\d+(?:\.\d+)?[EW])\s+(\d+\s+\d+(?:\.\d+)?[NS])\s+(\d+\s+\d+(?:\.\d+)?[EW])\s+(\d+\s+\d+(?:\.\d+)?[NS])\s+(\d+\s+\d+(?:\.\d+)?[EW])/,
    )
    if (m) {
      const n = parseDms(m[1], m[2])
      const s = parseDms(m[3], m[4])
      const c = parseDms(m[5], m[6])
      const push = limCount === 0 ? 'unshift' : 'push'
      if (n.lat != null && n.lon != null) allN[push]([n.lon, n.lat])
      if (s.lat != null && s.lon != null) allS[push]([s.lon, s.lat])
      if (c.lat != null && c.lon != null) allC[push]([c.lon, c.lat])
      limCount++
      continue
    }
    m = line.match(
      /^(\d{1,2}:\d{2})\s+(\d+\s+\d+(?:\.\d+)?[NS])\s+(\d+\s+\d+(?:\.\d+)?[EW])\s+(\d+\s+\d+(?:\.\d+)?[NS]|-)\s+(\d+\s+\d+(?:\.\d+)?[EW]|-)\s+(\d+\s+\d+(?:\.\d+)?[NS]|-)\s+(\d+\s+\d+(?:\.\d+)?[EW]|-)/,
    )
    if (!m) continue
    const n = parseDms(m[2], m[3])
    const s = parseDms(m[4], m[5])
    const c = parseDms(m[6], m[7])
    if (n.lat != null && n.lon != null) allN.push([n.lon, n.lat])
    if (s.lat != null && s.lon != null) allS.push([s.lon, s.lat])
    if (c.lat != null && c.lon != null) allC.push([c.lon, c.lat])
  }

  const ring = [...allN, ...allS.slice().reverse()]
  if (ring.length >= 3) {
    const first = ring[0]
    const last = ring[ring.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first])
  }

  return {
    ...meta,
    centralLine: allC,
    pathPolygon: ring.length >= 4 ? [ring] : null,
    partialPolygon: partialBand(allC),
    _counts: { n: allN.length, s: allS.length, c: allC.length, poly: ring.length },
  }
}

const sources = [
  {
    file: 'se2026.html',
    meta: {
      id: '2026-08-12',
      date: '2026-08-12',
      type: 'total',
      title: 'Total Solar Eclipse — Aug 12, 2026',
      titleFr: 'Éclipse totale de Soleil — 12 août 2026',
      regions: 'Arctic, Greenland, Iceland, Spain',
      regionsFr: 'Arctique, Groenland, Islande, Espagne',
      maxDuration: '2m 18s',
      nasaUrl:
        'https://eclipse.gsfc.nasa.gov/SEgoogle/SEgoogle2001/SE2026Aug12Tgoogle.html',
      focus: [-25, 55],
      zoom: 2.4,
    },
  },
  {
    file: 'se2027.html',
    meta: {
      id: '2027-08-02',
      date: '2027-08-02',
      type: 'total',
      title: 'Total Solar Eclipse — Aug 2, 2027',
      titleFr: 'Éclipse totale de Soleil — 2 août 2027',
      regions: 'Spain, N. Africa, Egypt, Saudi Arabia',
      regionsFr: 'Espagne, Afrique du Nord, Égypte, Arabie saoudite',
      maxDuration: '6m 23s',
      nasaUrl:
        'https://eclipse.gsfc.nasa.gov/SEgoogle/SEgoogle2001/SE2027Aug02Tgoogle.html',
      focus: [30, 25],
      zoom: 2.5,
    },
  },
  {
    file: 'se2028.html',
    meta: {
      id: '2028-07-22',
      date: '2028-07-22',
      type: 'total',
      title: 'Total Solar Eclipse — Jul 22, 2028',
      titleFr: 'Éclipse totale de Soleil — 22 juillet 2028',
      regions: 'Australia, New Zealand',
      regionsFr: 'Australie, Nouvelle-Zélande',
      maxDuration: '5m 10s',
      nasaUrl:
        'https://eclipse.gsfc.nasa.gov/SEgoogle/SEgoogle2001/SE2028Jul22Tgoogle.html',
      focus: [145, -25],
      zoom: 2.6,
    },
  },
]

const eclipses = []
for (const src of sources) {
  const htmlPath = path.join(root, src.file)
  if (!fs.existsSync(htmlPath)) {
    console.error('Missing', src.file, '— download NASA path table first')
    process.exit(1)
  }
  const e = parsePathTable(fs.readFileSync(htmlPath, 'utf8'), src.meta)
  console.log(e.id, e._counts)
  delete e._counts
  eclipses.push(e)
}

const outPath = path.join(root, 'src', 'data', 'solarEclipses.ts')
const header = `/**
 * Solar eclipse paths for the Earth globe.
 *
 * Totality/annularity limits and central lines from NASA GSFC path tables
 * (Fred Espenak). Partial bands are approximate (~4200 km half-width from
 * the central line) for "where you can see a partial eclipse" on the map.
 *
 * Credit: Eclipse Predictions by Fred Espenak, NASA's GSFC.
 * Regenerate: node scripts/build-eclipse-paths.mjs
 */
export type EclipseType = 'total' | 'annular' | 'hybrid' | 'partial'

export interface SolarEclipse {
  id: string
  date: string
  type: EclipseType
  title: string
  titleFr: string
  regions: string
  regionsFr: string
  maxDuration: string
  nasaUrl: string
  /** Fly-to center [lon, lat] */
  focus: [number, number]
  zoom: number
  /** Central line [lon, lat][] */
  centralLine: [number, number][]
  /** Path of totality / annularity (GeoJSON polygon rings) */
  pathPolygon: [number, number][][] | null
  /** Approximate partial visibility (GeoJSON polygon rings) */
  partialPolygon: [number, number][][] | null
}

export const SOLAR_ECLIPSES: SolarEclipse[] = `

const footer = `

/** Upcoming eclipses on/after a date (YYYY-MM-DD compare). */
export function upcomingSolarEclipses(from: Date = new Date()): SolarEclipse[] {
  const t = from.toISOString().slice(0, 10)
  return SOLAR_ECLIPSES.filter((e) => e.date >= t)
}

/** Build a MapLibre-ready FeatureCollection for one or all eclipses. */
export function eclipsesToGeoJSON(
  list: SolarEclipse[] = SOLAR_ECLIPSES,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const e of list) {
    if (e.partialPolygon) {
      features.push({
        type: 'Feature',
        properties: {
          id: e.id,
          kind: 'partial',
          title: e.title,
          titleFr: e.titleFr,
          regions: e.regions,
          regionsFr: e.regionsFr,
          date: e.date,
          eclipseType: e.type,
          maxDuration: e.maxDuration,
          nasaUrl: e.nasaUrl,
        },
        geometry: { type: 'Polygon', coordinates: e.partialPolygon },
      })
    }
    if (e.pathPolygon) {
      features.push({
        type: 'Feature',
        properties: {
          id: e.id,
          kind: 'totality',
          title: e.title,
          titleFr: e.titleFr,
          regions: e.regions,
          regionsFr: e.regionsFr,
          date: e.date,
          eclipseType: e.type,
          maxDuration: e.maxDuration,
          nasaUrl: e.nasaUrl,
        },
        geometry: { type: 'Polygon', coordinates: e.pathPolygon },
      })
    }
    if (e.centralLine.length >= 2) {
      features.push({
        type: 'Feature',
        properties: {
          id: e.id,
          kind: 'centerline',
          title: e.title,
          titleFr: e.titleFr,
          regions: e.regions,
          regionsFr: e.regionsFr,
          date: e.date,
          eclipseType: e.type,
          maxDuration: e.maxDuration,
          nasaUrl: e.nasaUrl,
        },
        geometry: { type: 'LineString', coordinates: e.centralLine },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}
`

fs.mkdirSync(path.dirname(outPath), { recursive: true })
// Compact coordinates (2 decimals enough for globe overview)
const compact = JSON.parse(
  JSON.stringify(eclipses, (_k, v) =>
    typeof v === 'number' ? Math.round(v * 1000) / 1000 : v,
  ),
)
fs.writeFileSync(outPath, header + JSON.stringify(compact, null, 2) + footer)
console.log('Wrote', outPath)
