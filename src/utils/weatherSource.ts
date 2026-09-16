/**
 * Human-readable forecast source line for trust UI.
 */
import type { WeatherData } from '../api/types'
import { formatMetarLine } from '../api/metar'
import type { Units } from './format'

/** e.g. "Sources · Google WeatherNext 3" */
export function formatWeatherSource(weather: WeatherData | null | undefined): string {
  const s = weather?.solara_source
  if (s?.provider === 'google' || /WeatherNext|Google Weather/i.test(s?.strategy || '')) {
    return 'Sources · Google WeatherNext 3'
  }
  return 'Sources · Google WeatherNext 3'
}

/** Surface observation line when METAR is attached */
export function formatObsSource(
  weather: WeatherData | null | undefined,
  units: Units = 'metric',
): string | null {
  const m = weather?.solara_obs
  if (!m?.icao) return null
  return formatMetarLine(m, units)
}

/** One-line “what do H/L mean” for the hero */
export function todayRangeHint(): string {
  return 'H / L are today’s calendar high & low at this place (raised if now is already warmer/colder).'
}
