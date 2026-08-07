/**
 * Plain-English precip timing for “Right now” / Today / widget.
 * Prefers 15-min steps when available, else hourly.
 */
import type { WeatherData } from '../api/types'
import type { Units } from './format'
import { formatPrecipAmount, parseWeatherLocal, precipUnit } from './format'

export interface PrecipTiming {
  /** Full sentence for hero / glance */
  sentence: string
  /** Short chip / next-precip line */
  short: string
  /** dry | maybe | wet */
  level: 'dry' | 'maybe' | 'wet'
  /** Minutes until first measurable precip (null if none in window) */
  startMins: number | null
  /** Accumulated mm in the next ~3h (expected) */
  next3hMm: number
}

function fmtClock(ms: number, tz: string): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
  })
}

function isSnowyCode(code: number | undefined): boolean {
  if (code == null) return false
  return (code >= 71 && code <= 77) || (code >= 85 && code <= 86)
}

/**
 * Build “Rain starts ~3:40 · ~2 mm by 5” style guidance for the next ~6 hours.
 */
export function precipTiming(weather: WeatherData, units: Units = 'metric'): PrecipTiming {
  const tz = weather.timezone
  const now = Date.now()
  const windowEnd = now + 6 * 3600_000
  const kindWord = (() => {
    const code = weather.current?.weather_code
    if (isSnowyCode(code)) return 'Snow'
    const t = weather.current?.temperature_2m
    if (t != null && t <= 0.5) return 'Wintry precip'
    return 'Rain'
  })()

  type Slot = { ms: number; mm: number; pop: number; code?: number }
  const slots: Slot[] = []

  const m = weather.minutely_15
  if (m?.time?.length) {
    for (let i = 0; i < m.time.length; i++) {
      const ms = parseWeatherLocal(m.time[i], tz)
      if (ms + 15 * 60_000 < now) continue
      if (ms > windowEnd) break
      slots.push({
        ms,
        mm: m.precipitation[i] ?? 0,
        pop: 0,
        code: m.weather_code?.[i],
      })
    }
  }

  if (slots.length < 2) {
    const h = weather.hourly
    slots.length = 0
    for (let i = 0; i < h.time.length; i++) {
      const ms = parseWeatherLocal(h.time[i], tz)
      if (ms + 60 * 60_000 < now) continue
      if (ms > windowEnd) break
      slots.push({
        ms,
        mm: h.precipitation[i] ?? 0,
        pop: h.precipitation_probability[i] ?? 0,
        code: h.weather_code?.[i],
      })
    }
  }

  if (!slots.length) {
    return {
      sentence: 'Not enough near-term precip data yet — check the hourly strip.',
      short: 'Precip timing unavailable',
      level: 'maybe',
      startMins: null,
      next3hMm: 0,
    }
  }

  const end3h = now + 3 * 3600_000
  const next3hMm = slots
    .filter((s) => s.ms <= end3h)
    .reduce((a, s) => a + (s.mm > 0 ? s.mm : 0), 0)
  const maxPop = Math.max(0, ...slots.map((s) => s.pop))

  const wetIdx = slots.findIndex((s) => s.mm >= 0.15 || s.pop >= 50)
  const heavyNow = slots[0] && (slots[0].mm >= 0.4 || (slots[0].pop >= 70 && slots[0].mm >= 0.1))

  // Dry stretch
  if (wetIdx < 0 && next3hMm < 0.2 && maxPop < 35) {
    const until = fmtClock(slots[slots.length - 1].ms, tz)
    return {
      sentence: `Looks dry through about ${until}. Leave the umbrella.`,
      short: 'Dry next few hours',
      level: 'dry',
      startMins: null,
      next3hMm,
    }
  }

  // Falling now / next slot
  if (wetIdx === 0 || (slots[0].mm >= 0.15 && wetIdx <= 0)) {
    const by = fmtClock(Math.min(end3h, slots[Math.min(slots.length - 1, 4)].ms), tz)
    const amt =
      next3hMm >= 0.2
        ? ` · ~${formatPrecipAmount(next3hMm, units)} ${precipUnit(units)} by ${by}`
        : maxPop >= 50
          ? ` · up to ${Math.round(maxPop)}% chance`
          : ''
    return {
      sentence: heavyNow
        ? `${kindWord} falling now${amt}.`
        : `${kindWord} in the next hour${amt}.`,
      short:
        slots[0].mm >= 0.15
          ? `${kindWord} now${next3hMm >= 0.2 ? ` · ~${formatPrecipAmount(next3hMm, units)} ${precipUnit(units)} / 3h` : ''}`
          : `Showers soon (${Math.round(slots[0].pop || maxPop)}%)`,
      level: heavyNow || next3hMm >= 1 ? 'wet' : 'maybe',
      startMins: 0,
      next3hMm,
    }
  }

  if (wetIdx > 0) {
    const when = slots[wetIdx]
    const startMins = Math.max(0, Math.round((when.ms - now) / 60_000))
    const startLabel = fmtClock(when.ms, tz)
    // Sum from first wet slot through ~2h after
    const after = when.ms + 2 * 3600_000
    const chunkMm = slots
      .filter((s) => s.ms >= when.ms && s.ms <= after)
      .reduce((a, s) => a + s.mm, 0)
    const endLabel = fmtClock(Math.min(after, slots[slots.length - 1].ms), tz)
    const amt =
      chunkMm >= 0.2
        ? ` · ~${formatPrecipAmount(chunkMm, units)} ${precipUnit(units)} by ${endLabel}`
        : when.pop >= 40
          ? ` · ${Math.round(when.pop)}% chance`
          : ''
    const hours = startMins >= 60 ? `~${Math.round(startMins / 60)}h` : `~${startMins}m`
    return {
      sentence: `${kindWord} starts ~${startLabel} (${hours})${amt}.`,
      short:
        chunkMm >= 0.2
          ? `${kindWord} ~${startLabel} · ~${formatPrecipAmount(chunkMm, units)} ${precipUnit(units)}`
          : `${kindWord} risk ~${startLabel}`,
      level: chunkMm >= 1.5 || when.pop >= 70 ? 'wet' : 'maybe',
      startMins,
      next3hMm,
    }
  }

  // Soft chance only
  return {
    sentence: `Mostly dry, small chance of showers (up to ${Math.round(maxPop)}%).`,
    short: maxPop >= 30 ? `Slight shower chance (${Math.round(maxPop)}%)` : 'Mostly dry',
    level: maxPop >= 40 ? 'maybe' : 'dry',
    startMins: null,
    next3hMm,
  }
}

/** Chip-friendly label (replaces sparse nextPrecipLabel when richer). */
export function precipTimingShort(weather: WeatherData, units: Units = 'metric'): string | null {
  const t = precipTiming(weather, units)
  if (t.level === 'dry' && t.next3hMm < 0.15) return null
  return t.short
}
