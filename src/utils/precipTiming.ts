/**
 * Plain-English precip timing for “Right now” / Today / widget.
 * Prefers 15-min steps when available, else hourly.
 */
import type { WeatherData } from '../api/types'
import { detectLocale } from '../i18n/messages'
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
  const fr = detectLocale() === 'fr'
  const tz = weather.timezone
  const now = Date.now()
  const windowEnd = now + 6 * 3600_000
  const kindWord = (() => {
    const code = weather.current?.weather_code
    if (isSnowyCode(code)) return fr ? 'Neige' : 'Snow'
    const temp = weather.current?.temperature_2m
    if (temp != null && temp <= 0.5) return fr ? 'Précip. hivernales' : 'Wintry precip'
    return fr ? 'Pluie' : 'Rain'
  })()

  type Slot = { ms: number; mm: number; pop: number; code?: number }
  const slots: Slot[] = []
  const h = weather.hourly

  /** Nearest hourly PoP for a timestamp (minutely has no PoP). */
  const hourlyPopAt = (ms: number): number => {
    if (!h?.time?.length) return 0
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < h.time.length; i++) {
      const hm = parseWeatherLocal(h.time[i], tz)
      const d = Math.abs(hm - ms)
      if (d < bestDist) {
        bestDist = d
        best = h.precipitation_probability[i] ?? 0
      }
      if (hm > ms + 2 * 3600_000) break
    }
    return best
  }

  const m = weather.minutely_15
  if (m?.time?.length) {
    for (let i = 0; i < m.time.length; i++) {
      const ms = parseWeatherLocal(m.time[i], tz)
      if (ms + 15 * 60_000 < now) continue
      if (ms > windowEnd) break
      slots.push({
        ms,
        mm: m.precipitation[i] ?? 0,
        pop: hourlyPopAt(ms),
        code: m.weather_code?.[i],
      })
    }
  }

  // Prefer hourly when minutely is thin, or when amounts look dry but PoP is elevated
  const maxMinutelyMm = slots.reduce((a, s) => Math.max(a, s.mm), 0)
  const maxMinutelyPop = slots.reduce((a, s) => Math.max(a, s.pop), 0)
  const useHourly =
    slots.length < 2 || (maxMinutelyMm < 0.15 && maxMinutelyPop >= 40)

  if (useHourly && h?.time?.length) {
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
      sentence: fr
        ? 'Pas assez de données de précipitations à court terme — voir l’horaire.'
        : 'Not enough near-term precip data yet — check the hourly strip.',
      short: fr ? 'Horaire précip. indisponible' : 'Precip timing unavailable',
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
      sentence: fr
        ? `Semble sec jusqu’à environ ${until}. Laissez le parapluie.`
        : `Looks dry through about ${until}. Leave the umbrella.`,
      short: fr ? 'Sec pour les prochaines heures' : 'Dry next few hours',
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
        ? fr
          ? ` · ~${formatPrecipAmount(next3hMm, units)} ${precipUnit(units)} d’ici ${by}`
          : ` · ~${formatPrecipAmount(next3hMm, units)} ${precipUnit(units)} by ${by}`
        : maxPop >= 50
          ? fr
            ? ` · jusqu’à ${Math.round(maxPop)} % de risque`
            : ` · up to ${Math.round(maxPop)}% chance`
          : ''
    return {
      sentence: heavyNow
        ? fr
          ? `${kindWord} en cours${amt}.`
          : `${kindWord} falling now${amt}.`
        : fr
          ? `${kindWord} dans l’heure${amt}.`
          : `${kindWord} in the next hour${amt}.`,
      short:
        slots[0].mm >= 0.15
          ? fr
            ? `${kindWord} maintenant${next3hMm >= 0.2 ? ` · ~${formatPrecipAmount(next3hMm, units)} ${precipUnit(units)} / 3 h` : ''}`
            : `${kindWord} now${next3hMm >= 0.2 ? ` · ~${formatPrecipAmount(next3hMm, units)} ${precipUnit(units)} / 3h` : ''}`
          : fr
            ? `Averses bientôt (${Math.round(slots[0].pop || maxPop)} %)`
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
    const after = when.ms + 2 * 3600_000
    const chunkMm = slots
      .filter((s) => s.ms >= when.ms && s.ms <= after)
      .reduce((a, s) => a + s.mm, 0)
    const endLabel = fmtClock(Math.min(after, slots[slots.length - 1].ms), tz)
    const amt =
      chunkMm >= 0.2
        ? fr
          ? ` · ~${formatPrecipAmount(chunkMm, units)} ${precipUnit(units)} d’ici ${endLabel}`
          : ` · ~${formatPrecipAmount(chunkMm, units)} ${precipUnit(units)} by ${endLabel}`
        : when.pop >= 40
          ? fr
            ? ` · ${Math.round(when.pop)} % de risque`
            : ` · ${Math.round(when.pop)}% chance`
          : ''
    const hours =
      startMins >= 60
        ? fr
          ? `~${Math.round(startMins / 60)} h`
          : `~${Math.round(startMins / 60)}h`
        : fr
          ? `~${startMins} min`
          : `~${startMins}m`
    return {
      sentence: fr
        ? `${kindWord} vers ~${startLabel} (${hours})${amt}.`
        : `${kindWord} starts ~${startLabel} (${hours})${amt}.`,
      short:
        chunkMm >= 0.2
          ? `${kindWord} ~${startLabel} · ~${formatPrecipAmount(chunkMm, units)} ${precipUnit(units)}`
          : fr
            ? `Risque de ${kindWord.toLowerCase()} ~${startLabel}`
            : `${kindWord} risk ~${startLabel}`,
      level: chunkMm >= 1.5 || when.pop >= 70 ? 'wet' : 'maybe',
      startMins,
      next3hMm,
    }
  }

  return {
    sentence: fr
      ? `Surtout sec, faible risque d’averses (jusqu’à ${Math.round(maxPop)} %).`
      : `Mostly dry, small chance of showers (up to ${Math.round(maxPop)}%).`,
    short: maxPop >= 30
      ? fr
        ? `Faible risque d’averses (${Math.round(maxPop)} %)`
        : `Slight shower chance (${Math.round(maxPop)}%)`
      : fr
        ? 'Surtout sec'
        : 'Mostly dry',
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
