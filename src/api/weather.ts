import type {
  AirQualityData,
  GridPoint,
  LocationResult,
  LocationSnapshot,
  ModelId,
  ModelSeries,
  PressureLevelProfile,
  TropicalGlobeData,
  TropicalStorm,
  WeatherAlert,
  WeatherData,
} from './types'
import { filterActiveAlerts } from '../utils/activeAlerts'
import { isDaytimeNow } from '../utils/daylight'
import {
  blendWeatherData,
  pickModels,
  detectForecastRegion,
  fallbackModels,
} from './forecastModels'
import { fetchNearestEcccCityPage, mergeEcccIntoWeather } from './ecccCityPage'
import { fetchNearestMetar } from './metar'
import { getApiBase } from '../lib/native'
import { todayDailyIndex } from '../utils/weatherStory'

function todayDailyIndexSafe(w: WeatherData): number {
  try {
    return Math.max(0, todayDailyIndex(w))
  } catch {
    return 0
  }
}

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

function cacheKey(lat: number, lon: number, tag = '') {
  return `${lat.toFixed(3)},${lon.toFixed(3)}${tag ? `:${tag}` : ''}`
}

export type FetchWeatherOpts = {
  /**
   * Smaller payload for phones: still enough for hourly strip + 10-day outlook,
   * ~40–60% less JSON than the desktop request.
   */
  lite?: boolean
}

const CURRENT_VARS = [
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
].join(',')

const HOURLY_VARS = [
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
  'cloud_cover_low',
  'cloud_cover_mid',
  'cloud_cover_high',
  'visibility',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'uv_index',
  'is_day',
].join(',')

const DAILY_VARS = [
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
].join(',')

function buildForecastParams(
  lat: number,
  lon: number,
  opts: {
    lite: boolean
    model: string
    /** Short-range fetch: fewer days/hours, keep 15-min precip */
    mode: 'short' | 'long' | 'single'
  },
): URLSearchParams {
  const { lite, model, mode } = opts
  const short = mode === 'short'
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: CURRENT_VARS,
    hourly: HOURLY_VARS,
    daily: DAILY_VARS,
    timezone: 'auto',
  })

  if (model && model !== 'best_match') {
    params.set('models', model)
  }

  if (short) {
    // High-res nowcasting window (HRRR / GEM / ICON)
    params.set('forecast_days', '2')
    params.set('forecast_hours', '36')
    params.set('minutely_15', 'precipitation,weather_code,wind_speed_10m,temperature_2m')
    params.set('forecast_minutely_15', lite ? '12' : '16')
  } else {
    // Always request 14 daily days (small payload); lite still trims hourly hours
    params.set('forecast_days', '14')
    params.set('forecast_hours', lite ? '72' : '120')
    params.set('past_days', '1')
    // 15-min on long fetch too when single-model (global best_match)
    if (mode === 'single') {
      params.set('minutely_15', 'precipitation,weather_code,wind_speed_10m,temperature_2m')
      params.set('forecast_minutely_15', lite ? '12' : '16')
    }
  }

  return params
}

async function fetchForecastRaw(params: URLSearchParams): Promise<WeatherData | null> {
  try {
    const res = await fetch(`${FORECAST}?${params}`)
    if (!res.ok) return null
    const data = (await res.json()) as WeatherData
    if (!data?.current || !data?.hourly?.time?.length) return null
    return data
  } catch {
    return null
  }
}

/**
 * Main forecast load: region-aware models + short/long blend for accuracy.
 * US → HRRR + ECMWF · Canada → ECCC City Page + GEM + ECMWF · Europe → ICON + ECMWF · else best_match.
 */
export async function fetchWeather(
  lat: number,
  lon: number,
  opts?: FetchWeatherOpts,
): Promise<WeatherData> {
  const lite = Boolean(opts?.lite)
  const pick = pickModels(lat, lon)
  const region = detectForecastRegion(lat, lon)
  const key = cacheKey(lat, lon, `${lite ? 'lite' : 'full'}:${pick.label}:eccc`)
  const hit = forecastCache.get(key)
  if (hit && Date.now() - hit.at < FORECAST_TTL_MS) {
    // Keep forecast cache; refresh surface obs lightly
    try {
      const metar = await Promise.race([
        fetchNearestMetar(lat, lon),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1600)),
      ])
      if (metar) return { ...hit.data, solara_obs: metar }
    } catch {
      /* ignore */
    }
    return hit.data
  }

  if (forecastCache.size > 24) {
    const first = forecastCache.keys().next().value
    if (first != null) forecastCache.delete(first)
  }

  // Canada: start Environment Canada City Page in parallel with models
  const ecccPromise =
    region === 'canada'
      ? fetchNearestEcccCityPage(lat, lon).catch(() => null)
      : Promise.resolve(null)

  let data: WeatherData | null = null
  const chain = fallbackModels(pick)

  async function tryModel(
    model: string,
    mode: 'short' | 'long' | 'single',
  ): Promise<WeatherData | null> {
    return fetchForecastRaw(buildForecastParams(lat, lon, { lite, model, mode }))
  }

  if (pick.shortModel) {
    const [short0, long0, eccc] = await Promise.all([
      tryModel(pick.shortModel, 'short'),
      tryModel(pick.longModel, 'long'),
      ecccPromise,
    ])

    let short = short0
    let long = long0
    let longModelUsed = pick.longModel
    let shortModelUsed = pick.shortModel

    // If preferred long failed, walk fallback chain
    if (!long) {
      for (const m of chain) {
        if (m === pick.shortModel || m === pick.longModel) continue
        long = await tryModel(m, 'long')
        if (long) {
          longModelUsed = m
          break
        }
      }
    }
    if (!short) {
      for (const m of chain) {
        if (m === pick.shortModel) continue
        short = await tryModel(m, 'short')
        if (short) {
          shortModelUsed = m
          break
        }
      }
    }

    const usedPick = {
      ...pick,
      shortModel: shortModelUsed,
      longModel: longModelUsed,
    }

    if (long && short) {
      data = blendWeatherData(short, long, usedPick)
    } else if (long) {
      data = blendWeatherData(null, long, usedPick)
    } else if (short) {
      data = {
        ...short,
        solara_source: {
          strategy: pick.label,
          shortModel: shortModelUsed,
        },
      }
    }

    if (data && eccc) {
      try {
        data = mergeEcccIntoWeather(data, eccc)
      } catch {
        /* keep model blend if ECCC map fails */
      }
    }
  } else {
    const eccc = await ecccPromise
    for (const m of chain) {
      data = await tryModel(m, 'single')
      if (data) {
        data = {
          ...data,
          solara_source: {
            strategy: pick.label,
            longModel: m,
          },
        }
        break
      }
    }
    if (data && eccc) {
      try {
        data = mergeEcccIntoWeather(data, eccc)
      } catch {
        /* ignore */
      }
    }
  }

  if (!data) {
    data = await tryModel('best_match', 'single')
    if (data) {
      data = {
        ...data,
        solara_source: { strategy: 'Best match', longModel: 'best_match' },
      }
    }
  }

  if (!data) throw new Error('Weather forecast failed')

  // Surface obs (METAR) — best-effort, don't block forever
  try {
    const metar = await Promise.race([
      fetchNearestMetar(lat, lon),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2800)),
    ])
    if (metar) data = { ...data, solara_obs: metar }
  } catch {
    /* forecast is enough */
  }

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

export async function fetchAirQuality(
  lat: number,
  lon: number,
  opts?: { lite?: boolean },
): Promise<AirQualityData | null> {
  const lite = Boolean(opts?.lite)
  const key = cacheKey(lat, lon, lite ? 'air-lite' : 'air')
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
      timezone: 'auto',
    })
    // Hourly pollen for allergy peaks (lite still gets short horizon)
    if (!lite) {
      params.set('hourly', `us_aqi,pm10,pm2_5,${pollen}`)
      params.set('forecast_days', '3')
    } else {
      params.set('hourly', pollen)
      params.set('forecast_days', '2')
    }
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
    const pick = pickModels(loc.latitude, loc.longitude)
    // Prefer high-res short model for rain timing on pins
    const model = pick.shortModel || pick.longModel || 'best_match'
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
    if (model !== 'best_match') params.set('models', model)
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
      isDay: isDaytimeNow(w),
      precipNextHour,
      precipSoon,
      rainStartsInMin,
      popMax6h,
      high: w.daily.temperature_2m_max[todayDailyIndexSafe(w)],
      low: w.daily.temperature_2m_min[todayDailyIndexSafe(w)],
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

/** Prefer FR or EN nested EC fields by UI locale */
function ecLang(): 'en' | 'fr' {
  try {
    const v = localStorage.getItem('solara-locale-v1')
    if (v === 'fr') return 'fr'
  } catch {
    /* ignore */
  }
  return 'en'
}

function ecPick(p: Record<string, unknown>, base: string): string {
  const lang = ecLang()
  const primary = p[`${base}_${lang}`]
  const fallback = p[`${base}_en`] ?? p[`${base}_fr`] ?? p[base]
  const v = primary ?? fallback
  return v != null ? String(v) : ''
}

/** Map Environment Canada risk colour / impact / type → NWS-like severity labels */
function mapEcSeverity(p: Record<string, unknown>): string {
  const colour = String(
    p.risk_colour_en ?? p.risk_colour_fr ?? p.risk_colour ?? '',
  ).toLowerCase()
  const impact = String(p.impact_en ?? p.impact_fr ?? p.impact ?? '').toLowerCase()
  const type = String(p.alert_type ?? '').toLowerCase()

  if (colour === 'red' || impact === 'extreme' || impact === 'extrême') return 'Extreme'
  if (
    colour === 'orange' ||
    impact === 'high' ||
    impact === 'élevé' ||
    impact === 'eleve' ||
    type === 'warning'
  )
    return 'Severe'
  if (colour === 'yellow' || impact === 'moderate' || impact === 'modéré' || type === 'watch')
    return 'Moderate'
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
  const name =
    ecPick(p, 'alert_name') ||
    ecPick(p, 'alert_short_name') ||
    (ecLang() === 'fr' ? 'Alerte météo' : 'Weather alert')
  const area = ecPick(p, 'feature_name')
  const province = String(p.province ?? '')
  const areas = [area, province].filter(Boolean).join(', ')
  const type = String(p.alert_type ?? 'alert')
  const text = ecPick(p, 'alert_text')
  const impact = ecPick(p, 'impact')
  const confidence = ecPick(p, 'confidence')

  // Split long EC text: first paragraph as headline-ish, rest as body
  const paragraphs = text
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const headline =
    paragraphs[0]?.replace(/\s+/g, ' ').slice(0, 220) ||
    `${name}${areas ? (ecLang() === 'fr' ? ` pour ${areas}` : ` for ${areas}`) : ''}`

  // Actionable lines often appear after "Take action" etc.
  const instruction =
    paragraphs.find((para) =>
      /take action|protect yourself|call 9-1-1|what to do|prepare|evacuate|protégez|appelez|que faire|évacuez/i.test(
        para,
      ),
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
      // Prefer polygon cover; if no geometry, keep when bbox already tight (0.08°)
      const inside = pointInGeometry(lon, lat, f.geometry)
      if (inside === false) continue
      // null geometry: still accept (bbox fetch is small; better than missing alerts)

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
  { id: 'gfs_hrrr', label: 'HRRR (US)', param: 'gfs_hrrr' },
  { id: 'gfs_seamless', label: 'GFS seamless', param: 'gfs_seamless' },
  { id: 'ecmwf_ifs025', label: 'ECMWF IFS', param: 'ecmwf_ifs025' },
  { id: 'icon_seamless', label: 'ICON (DWD)', param: 'icon_seamless' },
  { id: 'gem_seamless', label: 'GEM (Canada)', param: 'gem_seamless' },
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

/** Active tropical cyclones + forecast tracks (Worker proxies NHC to avoid CORS). */
export async function fetchTropicalGlobeData(): Promise<TropicalGlobeData | null> {
  try {
    const base = getApiBase()
    const res = await fetch(`${base}/api/tropical`, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    return (await res.json()) as TropicalGlobeData
  } catch {
    return null
  }
}

export async function fetchTropicalStorms(): Promise<TropicalStorm[]> {
  // Prefer Worker proxy (positions + forecast track geometry)
  try {
    const globe = await fetchTropicalGlobeData()
    if (globe?.storms?.length) return globe.storms
  } catch {
    /* fall through */
  }

  // Direct NHC CurrentStorms.json (may fail CORS in some browsers)
  try {
    const res = await fetch('https://www.nhc.noaa.gov/CurrentStorms.json', {
      headers: { Accept: 'application/json' },
    })
    if (res.ok) {
      const data = await res.json()
      const active = data.activeStorms ?? data.storms ?? []
      return (active as Record<string, unknown>[]).map((s) => {
        const latNum = parseFloat(
          String(s.latitudeNumeric ?? s.latitudeDecimal ?? s.lat ?? 0),
        )
        const lonNum = parseFloat(
          String(s.longitudeNumeric ?? s.longitudeDecimal ?? s.lon ?? 0),
        )
        const wind = s.intensity != null ? String(s.intensity) : String(s.wind ?? '')
        const windKt = Number(wind)
        return {
          id: String(s.id ?? s.binNumber ?? s.name),
          name: String(s.name ?? 'Unknown'),
          classification: String(s.classification ?? s.sampleClass ?? 'Tropical'),
          intensity: Number.isFinite(windKt) ? `${windKt} kt` : wind,
          pressure: s.pressure != null ? String(s.pressure) : undefined,
          movement:
            s.movement != null
              ? String(s.movement)
              : s.movementDir != null
                ? `${s.movementDir}° ${s.movementSpeed ?? ''} kt`.trim()
                : undefined,
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

/** Storm-chaser share link always points at the /chase desk */
export function shareChaseUrl(loc: LocationResult): string {
  const u = new URL(window.location.origin + '/chase')
  u.searchParams.set('lat', loc.latitude.toFixed(4))
  u.searchParams.set('lon', loc.longitude.toFixed(4))
  u.searchParams.set('name', loc.name)
  if (loc.admin1) u.searchParams.set('region', loc.admin1)
  if (loc.country) u.searchParams.set('country', loc.country)
  return u.toString()
}

/** Open-Meteo instability fields for storm desk (CAPE / CIN / LI) */
export interface StormEnvHourly {
  time: string[]
  cape: (number | null)[]
  cin: (number | null)[]
  liftedIndex: (number | null)[]
}

export interface StormEnvSnapshot {
  now: {
    cape: number | null
    cin: number | null
    liftedIndex: number | null
  }
  peak12h: {
    cape: number | null
    capeTime: string | null
    cinMin: number | null
    liMin: number | null
  }
  hourly: StormEnvHourly
  fetchedAt: number
}

const stormEnvCache = new Map<string, StormEnvSnapshot>()
const STORM_ENV_TTL_MS = 120_000

/**
 * Fetch CAPE, convective inhibition, and lifted index for storm environment analysis.
 * Separate from main forecast to keep mobile payloads lean.
 */
export async function fetchStormEnv(lat: number, lon: number): Promise<StormEnvSnapshot | null> {
  const key = cacheKey(lat, lon, 'stormenv')
  const hit = stormEnvCache.get(key)
  if (hit && Date.now() - hit.fetchedAt < STORM_ENV_TTL_MS) return hit

  try {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      hourly: 'cape,convective_inhibition,lifted_index',
      forecast_hours: '24',
      timezone: 'auto',
    })
    const res = await fetch(`${FORECAST}?${params}`)
    if (!res.ok) return hit ?? null
    const data = (await res.json()) as {
      hourly?: {
        time?: string[]
        cape?: (number | null)[]
        convective_inhibition?: (number | null)[]
        lifted_index?: (number | null)[]
      }
    }
    const times = data.hourly?.time ?? []
    if (!times.length) return hit ?? null

    const cape = data.hourly?.cape ?? times.map(() => null)
    const cin = data.hourly?.convective_inhibition ?? times.map(() => null)
    const li = data.hourly?.lifted_index ?? times.map(() => null)

    // Prefer first hour closest to now (index 0 is often current model hour)
    const nowIdx = 0
    let peakCape: number | null = null
    let peakCapeTime: string | null = null
    let cinMin: number | null = null
    let liMin: number | null = null
    const horizon = Math.min(times.length, 12)
    for (let i = 0; i < horizon; i++) {
      const c = cape[i]
      if (c != null && Number.isFinite(c) && (peakCape == null || c > peakCape)) {
        peakCape = c
        peakCapeTime = times[i] ?? null
      }
      const cinV = cin[i]
      if (cinV != null && Number.isFinite(cinV) && (cinMin == null || cinV < cinMin)) {
        cinMin = cinV
      }
      const liV = li[i]
      if (liV != null && Number.isFinite(liV) && (liMin == null || liV < liMin)) {
        liMin = liV
      }
    }

    const snap: StormEnvSnapshot = {
      now: {
        cape: cape[nowIdx] != null && Number.isFinite(cape[nowIdx]!) ? cape[nowIdx]! : null,
        cin: cin[nowIdx] != null && Number.isFinite(cin[nowIdx]!) ? cin[nowIdx]! : null,
        liftedIndex: li[nowIdx] != null && Number.isFinite(li[nowIdx]!) ? li[nowIdx]! : null,
      },
      peak12h: {
        cape: peakCape,
        capeTime: peakCapeTime,
        cinMin,
        liMin,
      },
      hourly: { time: times, cape, cin, liftedIndex: li },
      fetchedAt: Date.now(),
    }
    if (stormEnvCache.size > 32) {
      const first = stormEnvCache.keys().next().value
      if (first != null) stormEnvCache.delete(first)
    }
    stormEnvCache.set(key, snap)
    return snap
  } catch {
    return hit ?? null
  }
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
