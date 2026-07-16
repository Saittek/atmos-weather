import type {
  AirQualityData,
  GridPoint,
  LocationResult,
  LocationSnapshot,
  ModelId,
  ModelSeries,
  PressureLevelProfile,
  TropicalStorm,
  WeatherAlert,
  WeatherData,
} from './types'
import { filterActiveAlerts } from '../utils/activeAlerts'

const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST = 'https://api.open-meteo.com/v1/forecast'
const AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality'
const NWS = 'https://api.weather.gov'
/** Environment and Climate Change Canada — MSC GeoMet OGC API */
const EC_ALERTS = 'https://api.weather.gc.ca/collections/weather-alerts/items'

export async function searchLocations(query: string): Promise<LocationResult[]> {
  if (!query.trim()) return []
  const url = `${GEOCODE}?name=${encodeURIComponent(query)}&count=8&language=en&format=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Location search failed')
  const data = await res.json()
  return data.results ?? []
}

export async function reverseGeocode(lat: number, lon: number): Promise<LocationResult> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    return {
      id: 0,
      name: `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
      latitude: lat,
      longitude: lon,
    }
  }
  const data = await res.json()
  const a = data.address ?? {}
  const name =
    a.city || a.town || a.village || a.municipality || a.county || a.state || 'Current location'
  return {
    id: 0,
    name,
    latitude: lat,
    longitude: lon,
    country: a.country,
    country_code: a.country_code?.toUpperCase(),
    admin1: a.state || a.region,
  }
}

/** Short in-memory cache — soft refresh / StrictMode double-fetch */
const forecastCache = new Map<string, { at: number; data: WeatherData }>()
const airCache = new Map<string, { at: number; data: AirQualityData | null }>()
const FORECAST_TTL_MS = 90_000

function cacheKey(lat: number, lon: number) {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`
}

export async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const key = cacheKey(lat, lon)
  const hit = forecastCache.get(key)
  if (hit && Date.now() - hit.at < FORECAST_TTL_MS) return hit.data

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'is_day',
      'precipitation',
      'rain',
      'showers',
      'snowfall',
      'weather_code',
      'cloud_cover',
      'pressure_msl',
      'surface_pressure',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
    ].join(','),
    hourly: [
      'temperature_2m',
      'relative_humidity_2m',
      'dew_point_2m',
      'apparent_temperature',
      'precipitation_probability',
      'precipitation',
      'rain',
      'showers',
      'snowfall',
      'weather_code',
      'pressure_msl',
      'cloud_cover',
      'visibility',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
      'uv_index',
      'is_day',
    ].join(','),
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'apparent_temperature_max',
      'apparent_temperature_min',
      'sunrise',
      'sunset',
      'daylight_duration',
      'sunshine_duration',
      'uv_index_max',
      'precipitation_sum',
      'rain_sum',
      'showers_sum',
      'snowfall_sum',
      'precipitation_hours',
      'precipitation_probability_max',
      'wind_speed_10m_max',
      'wind_gusts_10m_max',
      'wind_direction_10m_dominant',
    ].join(','),
    minutely_15: 'precipitation,weather_code,wind_speed_10m,temperature_2m',
    timezone: 'auto',
    forecast_days: '14',
    forecast_hours: '168',
    forecast_minutely_15: '16',
    // Yesterday + recent hours for trends / "vs yesterday"
    past_days: '1',
  })

  const res = await fetch(`${FORECAST}?${params}`)
  if (!res.ok) throw new Error('Weather forecast failed')
  const data = (await res.json()) as WeatherData
  forecastCache.set(key, { at: Date.now(), data })
  return data
}

const climateCache = new Map<
  string,
  { avgHigh: number; avgLow: number; avgPrecip: number }
>()

/** Multi-year average for this calendar date (cached per lat/lon/day) */
export async function fetchClimateNormal(
  lat: number,
  lon: number,
): Promise<{ avgHigh: number; avgLow: number; avgPrecip: number } | null> {
  try {
    const now = new Date()
    const month = String(now.getUTCMonth() + 1).padStart(2, '0')
    const day = String(now.getUTCDate()).padStart(2, '0')
    const key = `${lat.toFixed(2)},${lon.toFixed(2)},${month}-${day}`
    const hit = climateCache.get(key)
    if (hit) return hit

    // Fewer years + single range request is lighter than 10 parallel calls
    const years = [2018, 2019, 2020, 2021, 2022, 2023, 2024]
    const highs: number[] = []
    const lows: number[] = []
    const precips: number[] = []

    // Batch in parallel but cap concurrency by slicing
    await Promise.all(
      years.map(async (y) => {
        const date = `${y}-${month}-${day}`
        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`
        try {
          const res = await fetch(url)
          if (!res.ok) return
          const data = await res.json()
          const hi = data.daily?.temperature_2m_max?.[0]
          const lo = data.daily?.temperature_2m_min?.[0]
          const pr = data.daily?.precipitation_sum?.[0]
          if (hi != null) highs.push(hi)
          if (lo != null) lows.push(lo)
          if (pr != null) precips.push(pr)
        } catch {
          /* ignore year */
        }
      }),
    )

    if (highs.length < 3) return null
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
    const result = {
      avgHigh: avg(highs),
      avgLow: avg(lows),
      avgPrecip: avg(precips),
    }
    climateCache.set(key, result)
    return result
  } catch {
    return null
  }
}

export async function fetchAirQuality(lat: number, lon: number): Promise<AirQualityData | null> {
  const key = cacheKey(lat, lon)
  const hit = airCache.get(key)
  if (hit && Date.now() - hit.at < FORECAST_TTL_MS) return hit.data

  try {
    const pollen = [
      'alder_pollen',
      'birch_pollen',
      'grass_pollen',
      'mugwort_pollen',
      'olive_pollen',
      'ragweed_pollen',
    ].join(',')
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: [
        'us_aqi',
        'pm10',
        'pm2_5',
        'carbon_monoxide',
        'nitrogen_dioxide',
        'sulphur_dioxide',
        'ozone',
        'european_aqi',
        pollen,
      ].join(','),
      hourly: `us_aqi,pm10,pm2_5,${pollen}`,
      timezone: 'auto',
      forecast_days: '3',
    })
    const res = await fetch(`${AIR}?${params}`)
    if (!res.ok) {
      airCache.set(key, { at: Date.now(), data: null })
      return null
    }
    const data = (await res.json()) as AirQualityData
    airCache.set(key, { at: Date.now(), data })
    return data
  } catch {
    return null
  }
}

/** Compact fetch for favorites home strip + rain watch */
export async function fetchLocationSnapshot(
  loc: LocationResult,
): Promise<LocationSnapshot | null> {
  try {
    const params = new URLSearchParams({
      latitude: String(loc.latitude),
      longitude: String(loc.longitude),
      current: 'temperature_2m,weather_code,is_day,precipitation',
      hourly: 'precipitation,precipitation_probability,weather_code',
      minutely_15: 'precipitation',
      daily: 'temperature_2m_max,temperature_2m_min',
      timezone: 'auto',
      forecast_days: '2',
      forecast_hours: '12',
      forecast_minutely_15: '8',
    })
    const [wRes, aRes, alRes] = await Promise.all([
      fetch(`${FORECAST}?${params}`),
      fetch(
        `${AIR}?latitude=${loc.latitude}&longitude=${loc.longitude}&current=us_aqi&timezone=auto`,
      ).catch(() => null),
      fetchAlerts(loc.latitude, loc.longitude),
    ])
    if (!wRes.ok) return null
    const w = await wRes.json()
    let aqi: number | null = null
    if (aRes?.ok) {
      const a = await aRes.json()
      aqi = a.current?.us_aqi ?? null
    }

    const now = Date.now()
    const mTimes: string[] = w.minutely_15?.time ?? []
    const mPrecip: number[] = w.minutely_15?.precipitation ?? []
    let rainStartsInMin: number | null = null
    let precipSoon = false
    for (let i = 0; i < mTimes.length; i++) {
      const t = new Date(mTimes[i]).getTime()
      if (t + 15 * 60 * 1000 < now) continue
      if ((mPrecip[i] ?? 0) > 0.1) {
        precipSoon = true
        rainStartsInMin = Math.max(0, Math.round((t - now) / 60000))
        break
      }
    }

    const hTimes: string[] = w.hourly?.time ?? []
    const hPrecip: number[] = w.hourly?.precipitation ?? []
    const hPop: number[] = w.hourly?.precipitation_probability ?? []
    let precipNextHour = 0
    let popMax6h = 0
    let counted = 0
    for (let i = 0; i < hTimes.length && counted < 6; i++) {
      const t = new Date(hTimes[i]).getTime()
      if (t + 60 * 60 * 1000 < now) continue
      if (counted === 0) precipNextHour = hPrecip[i] ?? 0
      popMax6h = Math.max(popMax6h, hPop[i] ?? 0)
      if ((hPrecip[i] ?? 0) > 0.2 && rainStartsInMin == null) {
        precipSoon = true
        rainStartsInMin = Math.max(0, Math.round((t - now) / 60000))
      }
      counted++
    }

    return {
      location: loc,
      temperature: w.current.temperature_2m,
      weatherCode: w.current.weather_code,
      isDay: w.current.is_day === 1,
      precipNextHour,
      precipSoon,
      rainStartsInMin,
      popMax6h,
      high: w.daily.temperature_2m_max[0],
      low: w.daily.temperature_2m_min[0],
      aqi,
      hasAlert: filterActiveAlerts(alRes).length > 0,
    }
  } catch {
    return null
  }
}

function mapNwsAlert(f: {
  id: string
  properties: Record<string, unknown>
}): WeatherAlert {
  const p = f.properties
  return {
    id: String(f.id),
    event: String(p.event ?? 'Alert'),
    headline: String(p.headline ?? p.event ?? 'Weather alert'),
    description: String(p.description ?? ''),
    instruction: String(p.instruction ?? ''),
    severity: String(p.severity ?? 'Unknown'),
    urgency: String(p.urgency ?? 'Unknown'),
    certainty: String(p.certainty ?? 'Unknown'),
    areas: String(p.areaDesc ?? ''),
    onset: (p.onset as string) ?? null,
    ends: (p.ends as string) ?? (p.expires as string) ?? null,
    sender: String(p.senderName ?? 'National Weather Service'),
  }
}

/** Map Environment Canada risk colour / impact / type → NWS-like severity labels */
function mapEcSeverity(p: Record<string, unknown>): string {
  const colour = String(p.risk_colour_en ?? '').toLowerCase()
  const impact = String(p.impact_en ?? '').toLowerCase()
  const type = String(p.alert_type ?? '').toLowerCase()

  if (colour === 'red' || impact === 'extreme') return 'Extreme'
  if (colour === 'orange' || impact === 'high' || type === 'warning') return 'Severe'
  if (colour === 'yellow' || impact === 'moderate' || type === 'watch') return 'Moderate'
  if (type === 'advisory' || type === 'statement' || colour === 'grey' || colour === 'gray')
    return 'Minor'
  return 'Unknown'
}

function mapEcUrgency(p: Record<string, unknown>): string {
  const type = String(p.alert_type ?? '').toLowerCase()
  if (type === 'warning') return 'Immediate'
  if (type === 'watch') return 'Expected'
  return 'Unknown'
}

function mapEcAlert(f: {
  id?: string
  properties: Record<string, unknown>
}): WeatherAlert {
  const p = f.properties
  const name = String(p.alert_name_en ?? p.alert_short_name_en ?? 'Weather alert')
  const area = String(p.feature_name_en ?? '')
  const province = String(p.province ?? '')
  const areas = [area, province].filter(Boolean).join(', ')
  const type = String(p.alert_type ?? 'alert')
  const text = String(p.alert_text_en ?? '')
  const impact = String(p.impact_en ?? '')
  const confidence = String(p.confidence_en ?? '')

  // Split long EC text: first paragraph as headline-ish, rest as body
  const paragraphs = text
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const headline =
    paragraphs[0]?.replace(/\s+/g, ' ').slice(0, 220) ||
    `${name}${areas ? ` for ${areas}` : ''}`

  // Actionable lines often appear after "Take action" etc.
  const instruction =
    paragraphs.find((para) =>
      /take action|protect yourself|call 9-1-1|what to do|prepare|evacuate/i.test(para),
    ) ?? ''

  return {
    id: String(f.id ?? p.id ?? `${name}-${areas}`),
    event: name.replace(/\b\w/g, (c) => c.toUpperCase()),
    headline,
    description: text,
    instruction,
    severity: mapEcSeverity(p),
    urgency: mapEcUrgency(p),
    certainty: confidence || 'Unknown',
    areas,
    onset: (p.publication_datetime as string) ?? (p.validity_datetime as string) ?? null,
    ends:
      (p.event_end_datetime as string) ??
      (p.expiration_datetime as string) ??
      null,
    sender: `Environment and Climate Change Canada${type ? ` · ${type}` : ''}${
      impact ? ` · impact: ${impact}` : ''
    }`,
  }
}

/** Ray-cast point-in-ring (GeoJSON [lon, lat] rings). */
function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0]
    const yi = ring[i]?.[1]
    const xj = ring[j]?.[0]
    const yj = ring[j]?.[1]
    if (
      xi == null ||
      yi == null ||
      xj == null ||
      yj == null ||
      !Number.isFinite(xi) ||
      !Number.isFinite(yi) ||
      !Number.isFinite(xj) ||
      !Number.isFinite(yj)
    ) {
      continue
    }
    if (yi === yj) continue
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * True if lat/lon lies inside a GeoJSON Polygon / MultiPolygon.
 * Returns null when geometry is missing or unsupported (caller decides).
 */
function pointInGeometry(
  lon: number,
  lat: number,
  geometry: { type?: string; coordinates?: unknown } | null | undefined,
): boolean | null {
  if (!geometry?.type || geometry.coordinates == null) return null
  const type = geometry.type

  const inPolygon = (coords: number[][][]): boolean => {
    if (!coords?.length || !coords[0]?.length) return false
    // exterior
    if (!pointInRing(lon, lat, coords[0])) return false
    // holes
    for (let h = 1; h < coords.length; h++) {
      if (pointInRing(lon, lat, coords[h])) return false
    }
    return true
  }

  if (type === 'Polygon') {
    return inPolygon(geometry.coordinates as number[][][])
  }
  if (type === 'MultiPolygon') {
    const multi = geometry.coordinates as number[][][][]
    return multi.some((poly) => inPolygon(poly))
  }
  return null
}

async function fetchUsAlerts(lat: number, lon: number): Promise<WeatherAlert[]> {
  try {
    // NWS point endpoint only returns alerts whose footprint includes this location
    const res = await fetch(`${NWS}/alerts/active?point=${lat},${lon}`, {
      headers: {
        Accept: 'application/geo+json',
        'User-Agent': 'SolaraWeather/1.0 (personal weather dashboard)',
      },
    })
    if (!res.ok) return []
    const data = await res.json()
    const now = Date.now()
    return (data.features ?? [])
      .filter(
        (f: {
          properties?: Record<string, unknown>
          geometry?: { type?: string; coordinates?: unknown } | null
        }) => {
          const p = f.properties ?? {}
          const status = String(p.status ?? '').toLowerCase()
          const messageType = String(p.messageType ?? '').toLowerCase()
          // Drop non-public / cancelled traffic even if still in a feed
          if (status === 'test' || status === 'draft' || status === 'exercise') return false
          if (messageType === 'cancel') return false
          const ends = p.ends ?? p.expires
          if (ends != null) {
            const t = Date.parse(String(ends))
            if (Number.isFinite(t) && t <= now) return false
          }
          // If geometry is present, require the exact point inside it
          // (skips rare edge cases / oversized footprints with bad bbox only)
          const inside = pointInGeometry(lon, lat, f.geometry)
          if (inside === false) return false
          return true
        },
      )
      .map((f: { id: string; properties: Record<string, unknown> }) => mapNwsAlert(f))
  } catch {
    return []
  }
}

/**
 * Canadian public weather alerts via MSC GeoMet OGC API (Environment Canada).
 * Fetches a tight bbox, then keeps only polygons that actually contain the point
 * (not neighboring forecast regions).
 */
async function fetchCanadaAlerts(lat: number, lon: number): Promise<WeatherAlert[]> {
  try {
    // Small fetch window only — final filter is point-in-polygon on each feature
    const d = 0.08
    const bbox = [lon - d, lat - d, lon + d, lat + d].map((n) => n.toFixed(5)).join(',')
    const url = `${EC_ALERTS}?f=json&limit=80&bbox=${bbox}`
    const res = await fetch(url, {
      headers: { Accept: 'application/geo+json' },
    })
    if (!res.ok) return []
    const data = await res.json()
    const features = (data.features ?? []) as {
      id?: string
      properties: Record<string, unknown>
      geometry?: { type?: string; coordinates?: unknown } | null
    }[]

    // De-dupe by alert id (same alert can appear for overlapping features)
    const seen = new Set<string>()
    const alerts: WeatherAlert[] = []
    for (const f of features) {
      // Only alerts whose polygon covers this exact location
      const inside = pointInGeometry(lon, lat, f.geometry)
      if (inside === false) continue
      // No geometry: do not guess — skip (avoids neighboring area noise)
      if (inside === null) continue

      const mapped = mapEcAlert(f)
      // Prefer unique event+area; EC ids already include feature
      if (seen.has(mapped.id)) continue
      seen.add(mapped.id)
      // Skip cancelled/expired if status present
      const status = String(f.properties.status_en ?? '').toLowerCase()
      if (
        status === 'ended' ||
        status === 'cancelled' ||
        status === 'canceled' ||
        status === 'expired'
      )
        continue
      // Drop by event end / expiration datetime
      const endRaw =
        f.properties.event_end_datetime ?? f.properties.expiration_datetime
      if (endRaw != null) {
        const t = Date.parse(String(endRaw))
        if (Number.isFinite(t) && t <= Date.now()) continue
      }
      alerts.push(mapped)
    }
    return alerts
  } catch {
    return []
  }
}

/** Active alerts for a point — US (NWS) + Canada (Environment Canada) */
export async function fetchAlerts(lat: number, lon: number): Promise<WeatherAlert[]> {
  const [us, ca] = await Promise.all([fetchUsAlerts(lat, lon), fetchCanadaAlerts(lat, lon)])
  // Canada first if both (border cases rare); severity sort happens in UI
  return filterActiveAlerts([...ca, ...us])
}

const MODEL_META: { id: ModelId; label: string; param?: string }[] = [
  { id: 'best_match', label: 'Best match' },
  { id: 'gfs_seamless', label: 'GFS (US)', param: 'gfs_seamless' },
  { id: 'ecmwf_ifs025', label: 'ECMWF IFS', param: 'ecmwf_ifs025' },
  { id: 'icon_seamless', label: 'ICON (DWD)', param: 'icon_seamless' },
]

export async function fetchMultiModel(lat: number, lon: number): Promise<ModelSeries[]> {
  const results = await Promise.all(
    MODEL_META.map(async (m) => {
      try {
        const params = new URLSearchParams({
          latitude: String(lat),
          longitude: String(lon),
          hourly: 'temperature_2m,precipitation',
          forecast_days: '3',
          timezone: 'auto',
        })
        if (m.param) params.set('models', m.param)
        const res = await fetch(`${FORECAST}?${params}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        return {
          id: m.id,
          label: m.label,
          hourly: data.hourly
            ? {
                time: data.hourly.time,
                temperature_2m: data.hourly.temperature_2m,
                precipitation: data.hourly.precipitation,
              }
            : null,
        } satisfies ModelSeries
      } catch (e) {
        return {
          id: m.id,
          label: m.label,
          hourly: null,
          error: e instanceof Error ? e.message : 'failed',
        } satisfies ModelSeries
      }
    }),
  )
  return results
}

const PRESSURE_LEVELS = [1000, 925, 850, 700, 500, 300, 250, 200] as const

export async function fetchPressureProfile(
  lat: number,
  lon: number,
): Promise<PressureLevelProfile | null> {
  try {
    const tempVars = PRESSURE_LEVELS.map((l) => `temperature_${l}hPa`).join(',')
    const rhVars = PRESSURE_LEVELS.map((l) => `relative_humidity_${l}hPa`).join(',')
    const wsVars = PRESSURE_LEVELS.map((l) => `wind_speed_${l}hPa`).join(',')
    const wdVars = PRESSURE_LEVELS.map((l) => `wind_direction_${l}hPa`).join(',')

    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      hourly: [tempVars, rhVars, wsVars, wdVars].join(','),
      forecast_days: '1',
      forecast_hours: '6',
      timezone: 'auto',
    })
    const res = await fetch(`${FORECAST}?${params}`)
    if (!res.ok) return null
    const data = await res.json()
    const h = data.hourly
    if (!h?.time?.length) return null

    // Pick hour closest to now (wall-clock times from Open-Meteo)
    const now = Date.now()
    let idx = 0
    let best = Infinity
    h.time.forEach((t: string, i: number) => {
      // Prefer local parse when no offset in string
      const ms = /[zZ]|[+-]\d{2}:?\d{2}$/.test(t)
        ? new Date(t).getTime()
        : new Date(t).getTime()
      const d = Math.abs(ms - now)
      if (d < best) {
        best = d
        idx = i
      }
    })

    return {
      time: h.time[idx],
      levels: [...PRESSURE_LEVELS],
      temperature: PRESSURE_LEVELS.map((l) => h[`temperature_${l}hPa`]?.[idx] ?? null),
      relative_humidity: PRESSURE_LEVELS.map(
        (l) => h[`relative_humidity_${l}hPa`]?.[idx] ?? null,
      ),
      wind_speed: PRESSURE_LEVELS.map((l) => h[`wind_speed_${l}hPa`]?.[idx] ?? null),
      wind_direction: PRESSURE_LEVELS.map((l) => h[`wind_direction_${l}hPa`]?.[idx] ?? null),
    }
  } catch {
    return null
  }
}

/** Sample a small grid around a point for map heat overlays */
export async function fetchWeatherGrid(
  lat: number,
  lon: number,
  span = 2.5,
  steps = 5,
): Promise<GridPoint[]> {
  const lats: number[] = []
  const lons: number[] = []
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const la = lat - span / 2 + (span * i) / (steps - 1)
      const lo = lon - span / 2 + (span * j) / (steps - 1)
      lats.push(Number(la.toFixed(3)))
      lons.push(Number(lo.toFixed(3)))
    }
  }

  const params = new URLSearchParams({
    latitude: lats.join(','),
    longitude: lons.join(','),
    current: 'temperature_2m,wind_speed_10m,wind_direction_10m,cloud_cover,precipitation',
    timezone: 'auto',
  })

  const res = await fetch(`${FORECAST}?${params}`)
  if (!res.ok) throw new Error('Grid fetch failed')
  const data = await res.json()

  // Multi-location response is an array
  const list = Array.isArray(data) ? data : [data]
  return list.map((item: {
    latitude: number
    longitude: number
    current: {
      temperature_2m: number
      wind_speed_10m: number
      wind_direction_10m: number
      cloud_cover: number
      precipitation: number
    }
  }) => ({
    lat: item.latitude,
    lon: item.longitude,
    temperature_2m: item.current.temperature_2m,
    wind_speed_10m: item.current.wind_speed_10m,
    wind_direction_10m: item.current.wind_direction_10m,
    cloud_cover: item.current.cloud_cover,
    precipitation: item.current.precipitation,
  }))
}

export async function fetchTropicalStorms(): Promise<TropicalStorm[]> {
  // Try NHC CurrentStorms.json (may fail CORS in some browsers)
  try {
    const res = await fetch('https://www.nhc.noaa.gov/CurrentStorms.json', {
      headers: { Accept: 'application/json' },
    })
    if (res.ok) {
      const data = await res.json()
      const active = data.activeStorms ?? data.storms ?? []
      return (active as Record<string, unknown>[]).map((s) => {
        const latNum = parseFloat(String(s.latitudeDecimal ?? s.lat ?? 0))
        const lonNum = parseFloat(String(s.longitudeDecimal ?? s.lon ?? 0))
        return {
          id: String(s.id ?? s.binNumber ?? s.name),
          name: String(s.name ?? 'Unknown'),
          classification: String(s.classification ?? s.sampleClass ?? s.intensity ?? 'Tropical'),
          intensity: String(s.intensity ?? s.wind ?? ''),
          pressure: s.pressure != null ? String(s.pressure) : undefined,
          movement: s.movement != null ? String(s.movement) : undefined,
          lat: latNum,
          lon: lonNum,
          binNumber: s.binNumber != null ? String(s.binNumber) : undefined,
          headline: s.headline != null ? String(s.headline) : undefined,
        } satisfies TropicalStorm
      })
    }
  } catch {
    /* CORS or network */
  }

  // Fallback: NWS active tropical-related alerts (no positions)
  try {
    const res = await fetch(
      `${NWS}/alerts/active?event=Hurricane,Tropical%20Storm,Tropical%20Depression,Typhoon`,
      {
        headers: {
          Accept: 'application/geo+json',
          'User-Agent': 'SolaraWeather/1.0 (personal weather dashboard)',
        },
      },
    )
    if (!res.ok) return []
    const data = await res.json()
    const seen = new Set<string>()
    const storms: TropicalStorm[] = []
    for (const f of data.features ?? []) {
      const p = f.properties ?? {}
      const event = String(p.event ?? 'Tropical')
      const key = String(p.headline ?? event)
      if (seen.has(key)) continue
      seen.add(key)
      // Try geometry centroid
      let lat = 25
      let lon = -70
      const g = f.geometry
      if (g?.type === 'Point' && Array.isArray(g.coordinates)) {
        lon = g.coordinates[0]
        lat = g.coordinates[1]
      }
      storms.push({
        id: f.id ?? key,
        name: event,
        classification: event,
        intensity: String(p.severity ?? ''),
        lat,
        lon,
        headline: String(p.headline ?? p.description ?? '').slice(0, 200),
      })
    }
    return storms
  } catch {
    return []
  }
}

export function formatLocationLabel(loc: LocationResult): string {
  const parts = [loc.name]
  if (loc.admin1) parts.push(loc.admin1)
  if (loc.country) parts.push(loc.country)
  return parts.join(', ')
}

export function locationKey(loc: LocationResult): string {
  return `${loc.latitude.toFixed(3)},${loc.longitude.toFixed(3)}`
}

export function shareUrl(loc: LocationResult): string {
  const u = new URL(window.location.href)
  u.searchParams.set('lat', loc.latitude.toFixed(4))
  u.searchParams.set('lon', loc.longitude.toFixed(4))
  u.searchParams.set('name', loc.name)
  if (loc.admin1) u.searchParams.set('region', loc.admin1)
  if (loc.country) u.searchParams.set('country', loc.country)
  return u.toString()
}

export function parseShareParams(): LocationResult | null {
  const u = new URL(window.location.href)
  const lat = parseFloat(u.searchParams.get('lat') ?? '')
  const lon = parseFloat(u.searchParams.get('lon') ?? '')
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null
  return {
    id: 0,
    name: u.searchParams.get('name') || `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
    latitude: lat,
    longitude: lon,
    admin1: u.searchParams.get('region') || undefined,
    country: u.searchParams.get('country') || undefined,
  }
}
