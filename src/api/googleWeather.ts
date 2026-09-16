import type { WeatherData } from './types'
import { getApiBase } from '../lib/native'

function looksLikeWeatherData(data: unknown): data is WeatherData {
  if (!data || typeof data !== 'object') return false
  const w = data as WeatherData
  return Boolean(w.current && w.hourly?.time?.length && w.daily?.time?.length)
}

/**
 * Google WeatherNext 3 forecast via Worker/Express proxy.
 * Throws if the key is missing or Google fails — Solara no longer falls back to Open-Meteo.
 */
export async function fetchGoogleWeather(
  lat: number,
  lon: number,
  opts?: { lite?: boolean },
): Promise<WeatherData> {
  const base = getApiBase()
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
  })
  if (opts?.lite) params.set('lite', '1')

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 14_000)
  try {
    const res = await fetch(`${base}/api/weather/google?${params}`, {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    })
    const payload: unknown = await res.json().catch(() => null)
    if (!res.ok) {
      const msg =
        payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error: unknown }).error)
          : `Google Weather HTTP ${res.status}`
      throw new Error(
        res.status === 503
          ? 'Google Weather is not configured on the server'
          : msg,
      )
    }
    if (!looksLikeWeatherData(payload)) {
      throw new Error('Google Weather returned an incomplete forecast')
    }
    return {
      ...payload,
      solara_source: {
        strategy: payload.solara_source?.strategy || 'Google WeatherNext 3',
        provider: 'google',
        longModel: payload.solara_source?.longModel || 'weathernext3',
        shortModel: payload.solara_source?.shortModel,
      },
    }
  } finally {
    clearTimeout(timer)
  }
}
