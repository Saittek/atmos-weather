/**
 * Environment and Climate Change Canada — City Page Weather (MSC GeoMet).
 * Official public forecast for Canadian cities/regions (weather.gc.ca product).
 *
 * Collection: citypageweather-realtime
 * https://api.weather.gc.ca/collections/citypageweather-realtime
 */

import type { CurrentWeather, DailyWeather, HourlyWeather, WeatherData } from './types'

const CITYPAGE =
  'https://api.weather.gc.ca/collections/citypageweather-realtime/items'

/** Prefer English nested values from ECCC bilingual objects */
function enVal(v: unknown): unknown {
  if (v == null) return null
  if (typeof v === 'object' && v !== null && 'en' in v) {
    return (v as { en: unknown }).en
  }
  return v
}

function num(v: unknown): number | null {
  const x = enVal(v)
  if (x == null || x === '') return null
  const n = typeof x === 'number' ? x : Number(x)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string | null {
  const x = enVal(v)
  if (x == null) return null
  return String(x)
}

/**
 * Map Environment Canada weather icon codes → WMO-like codes used by Solara icons.
 * EC icons: https://weather.gc.ca/weathericons/
 */
export function ecccIconToWmo(icon: number | null | undefined, isDay = true): number {
  if (icon == null || !Number.isFinite(icon)) return isDay ? 1 : 0
  const c = Math.trunc(icon)

  // Clear / sunny
  if (c === 0 || c === 1 || c === 30 || c === 31) return isDay ? 0 : 0
  // Mainly sunny / few clouds
  if (c === 2 || c === 32) return 1
  // Partly cloudy
  if (c === 3 || c === 4 || c === 33 || c === 34) return 2
  // Cloudy / overcast
  if (c === 5 || c === 10 || c === 35) return 3
  // Rain / showers
  if (c === 6 || c === 12 || c === 36 || c === 39) return 61
  if (c === 7 || c === 13 || c === 37 || c === 40) return 63
  if (c === 8 || c === 14 || c === 41) return 65
  // Thunder
  if (c === 9 || c === 19 || c === 28 || c === 29) return 95
  // Snow / flurries
  if (c === 15 || c === 16 || c === 42 || c === 43) return 71
  if (c === 17 || c === 18 || c === 25 || c === 26) return 73
  if (c === 11 || c === 27) return 75
  // Freezing rain / ice
  if (c === 20 || c === 21 || c === 22 || c === 23 || c === 24) return 66
  // Fog / haze / smoke / blowing (ECCC icons)
  // 44 = smoke — keep distinct (Solara code 44); never call it fog
  if (c === 44) return 44
  // 45–47 often fog / ice fog / blowing snow mix — treat as fog when not smoke
  if (c === 45 || c === 46 || c === 47 || c === 48) return 45
  // Drizzle
  if (c === 50 || c === 51) return 51
  // Default cloudy-ish
  return isDay ? 2 : 3
}

function compassToDeg(dir: string | null): number {
  if (!dir) return 0
  const d = dir.toUpperCase().replace(/[^A-Z]/g, '')
  const map: Record<string, number> = {
    N: 0,
    NNE: 22,
    NE: 45,
    ENE: 67,
    E: 90,
    ESE: 112,
    SE: 135,
    SSE: 157,
    S: 180,
    SSW: 202,
    SW: 225,
    WSW: 247,
    W: 270,
    WNW: 292,
    NW: 315,
    NNW: 337,
  }
  return map[d] ?? 0
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

export interface EcccCityPage {
  name: string
  identifier: string
  lat: number
  lon: number
  distanceKm: number
  props: Record<string, unknown>
}

interface GeoFeature {
  geometry?: { type: string; coordinates: number[] }
  properties?: Record<string, unknown> | null
}

async function fetchCityPageBbox(
  west: number,
  south: number,
  east: number,
  north: number,
  limit = 20,
): Promise<GeoFeature[]> {
  const url = new URL(CITYPAGE)
  url.searchParams.set('f', 'json')
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('bbox', `${west},${south},${east},${north}`)
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/geo+json, application/json' },
  })
  if (!res.ok) return []
  const data = (await res.json()) as { features?: GeoFeature[] }
  return data.features ?? []
}

/** Nearest official City Page site to a Canadian lat/lon */
export async function fetchNearestEcccCityPage(
  lat: number,
  lon: number,
): Promise<EcccCityPage | null> {
  const pads = [0.6, 1.5, 3, 6, 12]
  let features: GeoFeature[] = []
  for (const pad of pads) {
    features = await fetchCityPageBbox(lon - pad, lat - pad, lon + pad, lat + pad)
    if (features.length) break
  }
  if (!features.length) return null

  let best: EcccCityPage | null = null
  for (const f of features) {
    const coords = f.geometry?.coordinates
    if (!coords || coords.length < 2) continue
    const [clon, clat] = coords
    const dist = haversineKm(lat, lon, clat, clon)
    const props = (f.properties ?? {}) as Record<string, unknown>
    const nameObj = props.name as { en?: string } | string | undefined
    const name =
      typeof nameObj === 'string' ? nameObj : nameObj?.en || str(props.identifier) || 'Canada'
    const candidate: EcccCityPage = {
      name,
      identifier: str(props.identifier) || name,
      lat: clat,
      lon: clon,
      distanceKm: dist,
      props,
    }
    if (!best || candidate.distanceKm < best.distanceKm) best = candidate
  }
  // Reject absurdly far matches
  if (best && best.distanceKm > 250) return null
  return best
}

function readTempClass(
  temps: unknown,
  cls: 'high' | 'low',
): number | null {
  if (!temps || typeof temps !== 'object') return null
  const t = temps as { temperature?: unknown }
  const arr = Array.isArray(t.temperature) ? t.temperature : []
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const c = str((item as { class?: unknown }).class)?.toLowerCase()
    if (c === cls) return num((item as { value?: unknown }).value)
  }
  return null
}

function periodIsNight(periodName: string): boolean {
  return /night|soir|nuit/i.test(periodName)
}

/**
 * Overlay official ECCC City Page fields onto an Open-Meteo backbone.
 * Keeps full hourly/daily schema from models; prefers ECCC for current + near hours + daily highs/lows.
 */
export function mergeEcccIntoWeather(
  base: WeatherData,
  page: EcccCityPage,
): WeatherData {
  const p = page.props
  const cc = p.currentConditions as Record<string, unknown> | undefined
  const out: WeatherData = {
    ...base,
    hourly: { ...base.hourly },
    daily: { ...base.daily },
    current: { ...base.current },
  }

  // --- Current (official station/city conditions) ---
  if (cc) {
    const temp = num((cc.temperature as { value?: unknown })?.value ?? cc.temperature)
    const rh = num((cc.relativeHumidity as { value?: unknown })?.value ?? cc.relativeHumidity)
    const dew = num((cc.dewpoint as { value?: unknown })?.value ?? cc.dewpoint)
    const wind = cc.wind as Record<string, unknown> | undefined
    const windSpd = num((wind?.speed as { value?: unknown })?.value)
    const windGust = num((wind?.gust as { value?: unknown })?.value)
    const bearing = num((wind?.bearing as { value?: unknown })?.value)
    const windDir = str((wind?.direction as { value?: unknown })?.value)
    const pressureKpa = num((cc.pressure as { value?: unknown })?.value)
    const icon = num((cc.iconCode as { value?: unknown })?.value)
    const humidex = num((cc.humidex as { value?: unknown })?.value)
    const windChill = num((cc.windChill as { value?: unknown })?.value)
    const ts = str((cc.timestamp as { en?: string })?.en ?? cc.timestamp) || out.current.time

    // Day/night only from sunrise/sunset (never UTC hour hacks)
    let isDay = out.current.is_day
    const riseSet = p.riseSet as { sunrise?: { en?: string }; sunset?: { en?: string } } | undefined
    if (riseSet?.sunrise?.en && riseSet?.sunset?.en) {
      const now = Date.parse(ts.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(ts) ? ts : ts)
      const rise = Date.parse(riseSet.sunrise.en)
      const set = Date.parse(riseSet.sunset.en)
      if (Number.isFinite(now) && Number.isFinite(rise) && Number.isFinite(set)) {
        isDay = now >= rise && now < set ? 1 : 0
      }
    }

    // ECCC often leaves stale windChill/humidex on the payload — only apply when
    // the air temp is in the right season for that index (fixes "dress for cold" on hot days).
    let feels = temp ?? out.current.apparent_temperature
    if (temp != null) {
      if (humidex != null && temp >= 20 && humidex >= temp) {
        feels = humidex
      } else if (windChill != null && temp <= 5 && windChill <= temp) {
        feels = windChill
      }
    }

    const next: CurrentWeather = {
      ...out.current,
      time: ts,
      temperature_2m: temp ?? out.current.temperature_2m,
      relative_humidity_2m: rh ?? out.current.relative_humidity_2m,
      apparent_temperature: feels ?? out.current.apparent_temperature,
      is_day: isDay,
      weather_code: ecccIconToWmo(icon, isDay === 1),
      wind_speed_10m: windSpd ?? out.current.wind_speed_10m,
      wind_gusts_10m: windGust ?? out.current.wind_gusts_10m,
      wind_direction_10m:
        bearing ?? (windDir ? compassToDeg(windDir) : out.current.wind_direction_10m),
      // ECCC pressure is kPa → hPa
      pressure_msl:
        pressureKpa != null ? pressureKpa * 10 : out.current.pressure_msl,
      surface_pressure:
        pressureKpa != null ? pressureKpa * 10 : out.current.surface_pressure,
    }
    // Keep model precip fields; observations rarely include rate
    out.current = next
    void dew
  }

  // --- Hourly overlay ---
  const hGroup = p.hourlyForecastGroup as { hourlyForecasts?: unknown[] } | undefined
  const hours = Array.isArray(hGroup?.hourlyForecasts) ? hGroup!.hourlyForecasts! : []
  if (hours.length && out.hourly?.time?.length) {
    const byIso = new Map<string, number>()
    // Index base hours by UTC hour key YYYY-MM-DDTHH
    out.hourly.time.forEach((t, i) => {
      const d = new Date(t.includes('T') ? (t.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(t) ? t : `${t}Z`) : t)
      if (!Number.isFinite(d.getTime())) {
        byIso.set(t.slice(0, 13), i)
        return
      }
      const key = d.toISOString().slice(0, 13)
      byIso.set(key, i)
    })

    const h = out.hourly
    for (const raw of hours) {
      if (!raw || typeof raw !== 'object') continue
      const hr = raw as Record<string, unknown>
      const tsRaw = str(hr.timestamp) || str((hr.timestamp as { en?: string })?.en)
      if (!tsRaw) continue
      const d = new Date(tsRaw)
      if (!Number.isFinite(d.getTime())) continue
      const key = d.toISOString().slice(0, 13)
      const idx = byIso.get(key)
      if (idx == null) continue

      const temp = num((hr.temperature as { value?: unknown })?.value)
      const pop = num((hr.lop as { value?: unknown })?.value)
      const icon = num((hr.iconCode as { value?: unknown })?.value)
      const wind = hr.wind as Record<string, unknown> | undefined
      const wspd = num((wind?.speed as { value?: unknown })?.value)
      const wgust = num((wind?.gust as { value?: unknown })?.value)
      const wdir = str((wind?.direction as { value?: unknown })?.value)
      const uv = num((hr.uv as { index?: { value?: unknown } })?.index?.value ?? (hr.uv as { index?: unknown })?.index)
      const humidex = num((hr.humidex as { value?: unknown })?.value)
      const isDay = icon != null ? icon < 30 || (icon >= 0 && icon <= 17) : h.is_day[idx] === 1

      if (temp != null) h.temperature_2m[idx] = temp
      if (temp != null) h.apparent_temperature[idx] = humidex != null && humidex > temp ? humidex : temp
      if (pop != null) h.precipitation_probability[idx] = pop
      if (icon != null) h.weather_code[idx] = ecccIconToWmo(icon, isDay)
      if (wspd != null) h.wind_speed_10m[idx] = wspd
      if (wgust != null) h.wind_gusts_10m[idx] = wgust
      if (wdir) h.wind_direction_10m[idx] = compassToDeg(wdir)
      if (uv != null && h.uv_index) h.uv_index[idx] = uv
      h.is_day[idx] = isDay ? 1 : 0
    }
    out.hourly = h as HourlyWeather
  }

  // --- Daily from day/night periods ---
  const fGroup = p.forecastGroup as { forecasts?: unknown[] } | undefined
  const periods = Array.isArray(fGroup?.forecasts) ? fGroup!.forecasts! : []
  if (periods.length && out.daily?.time?.length) {
    // Pair "Today/Sunday" + "Tonight/Sunday night" into calendar days
    type DayAgg = {
      high: number | null
      low: number | null
      code: number | null
      pop: number | null
      uv: number | null
    }
    const dayOrder: DayAgg[] = []
    let cur: DayAgg | null = null

    for (const raw of periods) {
      if (!raw || typeof raw !== 'object') continue
      const per = raw as Record<string, unknown>
      const periodName =
        str((per.period as { textForecastName?: unknown })?.textForecastName) ||
        str((per.period as { value?: unknown })?.value) ||
        ''
      const night = periodIsNight(periodName)
      const high = readTempClass(per.temperatures, 'high')
      const low = readTempClass(per.temperatures, 'low')
      const abbr = per.abbreviatedForecast as Record<string, unknown> | undefined
      const icon = num((abbr?.icon as { value?: unknown })?.value ?? (abbr?.iconCode as { value?: unknown })?.value)
      const pop = num((abbr?.pop as { value?: unknown })?.value)
      const uv = num((per.uv as { index?: unknown })?.index)

      if (!night) {
        const prevLow = cur != null ? cur.low : null
        const nextDay: DayAgg = {
          high,
          low: prevLow,
          code: icon != null ? ecccIconToWmo(icon, true) : null,
          pop,
          uv,
        }
        dayOrder.push(nextDay)
        cur = nextDay
      } else if (cur != null) {
        // Attach overnight low to previous day period
        if (low != null) cur.low = low
        if (pop != null) cur.pop = Math.max(cur.pop ?? 0, pop)
      } else {
        const nightOnly: DayAgg = {
          high: null,
          low,
          code: icon != null ? ecccIconToWmo(icon, false) : null,
          pop,
          uv: null,
        }
        dayOrder.push(nightOnly)
        cur = nightOnly
      }
    }

    const d = { ...out.daily } as DailyWeather
    // Open-Meteo often includes past_days — index 0 may be YESTERDAY.
    // ECCC dayOrder[0] is always "Today" (first daytime period). Align by calendar date.
    const tz = out.timezone || 'UTC'
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
    let todayIdx = d.time.findIndex((t) => t.startsWith(todayStr))
    if (todayIdx < 0) todayIdx = 0

    for (let i = 0; i < dayOrder.length; i++) {
      const di = todayIdx + i
      if (di < 0 || di >= d.time.length) break
      const a = dayOrder[i]
      // Prefer ECCC highs/lows, but never drop below model if ECCC is missing
      if (a.high != null) d.temperature_2m_max[di] = a.high
      if (a.low != null) d.temperature_2m_min[di] = a.low
      if (a.code != null) d.weather_code[di] = a.code
      if (a.pop != null) d.precipitation_probability_max[di] = a.pop
      if (a.uv != null) d.uv_index_max[di] = a.uv
      if (a.high != null) d.apparent_temperature_max[di] = a.high
      if (a.low != null) d.apparent_temperature_min[di] = a.low
    }

    // Sunrise/sunset for *today* from riseSet (not index 0 when past_days is set)
    const riseSet = p.riseSet as { sunrise?: { en?: string }; sunset?: { en?: string } } | undefined
    if (riseSet?.sunrise?.en && d.sunrise?.[todayIdx] != null) {
      d.sunrise[todayIdx] = riseSet.sunrise.en
    }
    if (riseSet?.sunset?.en && d.sunset?.[todayIdx] != null) {
      d.sunset[todayIdx] = riseSet.sunset.en
    }

    out.daily = d
  }

  out.solara_source = {
    strategy: `ECCC · ${page.name}`,
    shortModel: 'eccc_citypage',
    longModel: base.solara_source?.longModel || 'gem+ecmwf',
  }

  return out
}
