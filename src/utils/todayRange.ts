/**
 * Shared “today H / L” so hero cards and story never disagree.
 */
import type { WeatherData } from '../api/types'
import { todayDailyIndex } from './weatherStory'

export interface TodayRange {
  high: number
  low: number
  /** Daily array index used */
  dayIndex: number
  /** True if we raised high or lowered low from current temp */
  clamped: boolean
}

/**
 * Calendar-day high/low at this place.
 * Clamps with current temp so H ≥ now ≥ L never inverts, and high ≥ low always.
 */
export function todayRange(weather: WeatherData): TodayRange {
  const dayIndex = Math.max(0, todayDailyIndex(weather))
  const now = weather.current?.temperature_2m
  const highRaw = weather.daily?.temperature_2m_max?.[dayIndex]
  const lowRaw = weather.daily?.temperature_2m_min?.[dayIndex]

  let high =
    highRaw != null && Number.isFinite(highRaw)
      ? Number(highRaw)
      : now != null && Number.isFinite(now)
        ? Number(now)
        : 0
  let low =
    lowRaw != null && Number.isFinite(lowRaw)
      ? Number(lowRaw)
      : now != null && Number.isFinite(now)
        ? Number(now)
        : 0

  let clamped = false
  if (now != null && Number.isFinite(now)) {
    if (now > high) {
      high = now
      clamped = true
    }
    if (now < low) {
      low = now
      clamped = true
    }
  }

  if (high < low) {
    // Misaligned daily slot / model glitch — flatten to a sane band around now
    const mid = now != null && Number.isFinite(now) ? now : (high + low) / 2
    high = Math.max(high, low, mid)
    low = Math.min(high, low, mid)
    if (high < low) {
      high = mid
      low = mid
    }
    clamped = true
  }

  return { high, low, dayIndex, clamped }
}
