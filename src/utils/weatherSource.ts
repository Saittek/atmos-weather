/**
 * Human-readable forecast source line for trust UI.
 */
import type { WeatherData } from '../api/types'

/** e.g. "Sources · Environment Canada City Page + GEM/ECMWF · Open-Meteo" */
export function formatWeatherSource(weather: WeatherData | null | undefined): string {
  const s = weather?.solara_source
  if (!s?.strategy) {
    return 'Sources · Open-Meteo forecast'
  }

  const strategy = s.strategy
  // ECCC path
  if (/ECCC/i.test(strategy)) {
    const models = [s.shortModel, s.longModel].filter(Boolean).join(' / ')
    return models
      ? `Sources · ${strategy} (models ${models}) · Open-Meteo`
      : `Sources · ${strategy} · Open-Meteo`
  }

  // US / Europe blends
  if (/HRRR|ECMWF|ICON|GEM|blend|Best/i.test(strategy)) {
    const bits = [strategy]
    if (s.shortModel) bits.push(`near-term ${s.shortModel}`)
    if (s.longModel && s.longModel !== s.shortModel) bits.push(`longer ${s.longModel}`)
    return `Sources · Solara blend (${bits.join(' · ')}) · Open-Meteo`
  }

  const short = s.shortModel ? ` · ${s.shortModel}` : ''
  const long = s.longModel && s.longModel !== s.shortModel ? ` · ${s.longModel}` : ''
  return `Sources · Solara blend (${strategy}${short}${long}) · Open-Meteo`
}

/** One-line “what do H/L mean” for the hero */
export function todayRangeHint(): string {
  return 'H / L are today’s calendar high & low at this place (raised if now is already warmer/colder).'
}
