import type { WeatherData } from './types'
import { getApiBase } from '../lib/native'

/** Skip retrying Google for a while after a "not configured" 503. */
let googleUnconfiguredUntil = 0

function looksLikeWeatherData(data: unknown): data is WeatherData {
  if (!data || typeof data !== 'object') return false
  const w = data as WeatherData
  return Boolean(w.current && w.hourly?.time?.length && w.daily?.time?.length)
}

/**
 * Ask the Worker/Express proxy for a Google WeatherNext 3 forecast.
 * Returns null on missing key, HTTP error, timeout, or mapping failure
 * so the caller can fall back to Open-Meteo unchanged.
 */
export async function fetchGoogleWeather(
  lat: number,
  lon: number,
  opts?: { lite?: boolean },
): Promise<WeatherData | null> {
  if (Date.now() < googleUnconfiguredUntil) return null

  const base = getApiBase()
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
  })
  if (opts?.lite) params.set('lite', '1')

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6500)
  try {
    const res = await fetch(`${base}/api/weather/google?${params}`, {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    })
    // 503 = secret not set. 404 = Worker not redeployed yet. Skip retries
    // so every forecast does not wait on a known-missing route.
    if (res.status === 503 || res.status === 404) {
      googleUnconfiguredUntil = Date.now() + 10 * 60_000
      return null
    }
    if (!res.ok) return null
    const data: unknown = await res.json()
    if (!looksLikeWeatherData(data)) return null
    return {
      ...data,
      solara_source: {
        strategy: data.solara_source?.strategy || 'Google WeatherNext 3',
        provider: 'google',
        longModel: data.solara_source?.longModel || 'weathernext3',
        shortModel: data.solara_source?.shortModel,
      },
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
