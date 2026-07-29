/**
 * Simple multi-model confidence for high temp and precip (dashboard strip).
 */
import type { ModelSeries, WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { convertTemp, parseWeatherLocal } from '../utils/format'

export type ConfidenceLevel = 'high' | 'moderate' | 'low'

export interface ModelConfidenceSummary {
  highTemp: {
    level: ConfidenceLevel
    label: string
    spread: number
    unit: string
    values: { name: string; value: number }[]
  }
  precip: {
    level: ConfidenceLevel
    label: string
    spread: number
    values: { name: string; value: number }[]
  }
  overall: ConfidenceLevel
  headline: string
}

function levelFromSpreadTemp(spread: number, units: Units): ConfidenceLevel {
  const high = units === 'metric' ? 1.5 : 2.5
  const mod = units === 'metric' ? 3.5 : 6
  if (spread <= high) return 'high'
  if (spread <= mod) return 'moderate'
  return 'low'
}

/** Precip total mm spread over ~24h */
function levelFromSpreadPrecipMm(spread: number): ConfidenceLevel {
  if (spread <= 1.5) return 'high'
  if (spread <= 5) return 'moderate'
  return 'low'
}

function worst(a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel {
  const o = { high: 0, moderate: 1, low: 2 }
  return o[a] >= o[b] ? a : b
}

export function summarizeModelConfidence(
  models: ModelSeries[],
  weather: WeatherData | null,
  units: Units,
): ModelConfidenceSummary | null {
  const ok = models.filter((m) => m.hourly?.time?.length)
  if (ok.length < 2) return null

  const tz = weather?.timezone
  const now = Date.now()
  const unit = units === 'metric' ? '°C' : '°F'

  const highVals: { name: string; value: number }[] = []
  const precipVals: { name: string; value: number }[] = []

  for (const m of ok) {
    const h = m.hourly!
    const start = Math.max(
      0,
      h.time.findIndex((t) => parseWeatherLocal(t, tz) >= now - 30 * 60_000),
    )
    const temps = h.temperature_2m
      .slice(start, start + 24)
      .filter((v) => v != null && Number.isFinite(Number(v)))
      .map(Number)
    if (temps.length) {
      highVals.push({
        name: m.label || m.id,
        value: convertTemp(Math.max(...temps), units),
      })
    }
    const prec = (h.precipitation || [])
      .slice(start, start + 24)
      .filter((v) => v != null && Number.isFinite(Number(v)))
      .map(Number)
    if (prec.length) {
      precipVals.push({
        name: m.label || m.id,
        value: Math.round(prec.reduce((a, b) => a + b, 0) * 10) / 10,
      })
    }
  }

  if (highVals.length < 2) return null

  const highNums = highVals.map((v) => v.value)
  const highSpread = Math.max(...highNums) - Math.min(...highNums)
  const highLevel = levelFromSpreadTemp(highSpread, units)

  const popNums = precipVals.map((v) => v.value)
  const popSpread =
    popNums.length >= 2 ? Math.max(...popNums) - Math.min(...popNums) : 0
  const popLevel =
    precipVals.length >= 2 ? levelFromSpreadPrecipMm(popSpread) : 'moderate'

  const overall = worst(highLevel, precipVals.length >= 2 ? popLevel : 'high')

  const highLabel =
    highLevel === 'high'
      ? 'Models agree on today’s high'
      : highLevel === 'moderate'
        ? 'Some spread on today’s high'
        : 'Models disagree on today’s high'

  const precipLabel =
    popLevel === 'high'
      ? 'Models agree on precip totals'
      : popLevel === 'moderate'
        ? 'Mixed precip amounts across models'
        : 'Models disagree on precip totals'

  const headline =
    overall === 'high'
      ? 'High confidence forecast'
      : overall === 'moderate'
        ? 'Moderate confidence — check updates'
        : 'Low confidence — models disagree'

  return {
    highTemp: {
      level: highLevel,
      label: highLabel,
      spread: highSpread,
      unit,
      values: highVals,
    },
    precip: {
      level: popLevel,
      label: precipLabel,
      spread: popSpread,
      values: precipVals,
    },
    overall,
    headline,
  }
}
