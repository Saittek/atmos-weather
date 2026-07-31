/**
 * Compare current forecast to the last open for this place → “what changed” line.
 */
import type { WeatherData } from '../api/types'
import type { Units } from './format'
import { convertTemp } from './format'
import { locationKey } from '../api/weather'
import type { LocationResult } from '../api/types'
import { filterActiveAlerts } from './activeAlerts'
import type { WeatherAlert } from '../api/types'
import { willIGetWet } from './wetSummary'
import { todayDailyIndex } from './weatherStory'

const STORAGE = 'solara-weather-delta-v1'

export interface WeatherSnapshot {
  placeKey: string
  placeName: string
  savedAt: number
  tempC: number
  code: number
  popMax: number
  wetLevel: string
  alertIds: string[]
  alertEvents: string[]
}

export interface WeatherDelta {
  lines: string[]
  ageLabel: string
  significant: boolean
}

function loadAll(): Record<string, WeatherSnapshot> {
  try {
    const raw = localStorage.getItem(STORAGE)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, WeatherSnapshot>
  } catch {
    return {}
  }
}

function saveAll(map: Record<string, WeatherSnapshot>) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function loadPlaceSnapshot(placeKey: string): WeatherSnapshot | null {
  return loadAll()[placeKey] ?? null
}

export function savePlaceSnapshot(
  location: LocationResult,
  weather: WeatherData,
  alerts: WeatherAlert[] = [],
): void {
  const placeKey = locationKey(location)
  const ti = todayDailyIndex(weather)
  const active = filterActiveAlerts(alerts)
  const wet = willIGetWet(weather)
  const snap: WeatherSnapshot = {
    placeKey,
    placeName: location.name || 'Place',
    savedAt: Date.now(),
    tempC: Number(weather.current?.temperature_2m ?? 0),
    code: Number(weather.current?.weather_code ?? 0),
    popMax: Number(weather.daily?.precipitation_probability_max?.[ti] ?? 0),
    wetLevel: wet.level,
    alertIds: active.map((a) => a.id).slice(0, 12),
    alertEvents: active.map((a) => a.event).slice(0, 6),
  }
  const all = loadAll()
  all[placeKey] = snap
  // Cap stored places
  const keys = Object.keys(all)
  if (keys.length > 20) {
    const sorted = keys
      .map((k) => ({ k, t: all[k].savedAt }))
      .sort((a, b) => a.t - b.t)
    for (const { k } of sorted.slice(0, keys.length - 20)) delete all[k]
  }
  saveAll(all)
}

function ageLabel(ms: number): string {
  const m = Math.round(ms / 60_000)
  if (m < 2) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 36) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function computeWeatherDelta(
  location: LocationResult,
  weather: WeatherData,
  alerts: WeatherAlert[],
  units: Units,
): WeatherDelta | null {
  const prev = loadPlaceSnapshot(locationKey(location))
  if (!prev) return null
  const age = Date.now() - prev.savedAt
  // Too fresh — not interesting
  if (age < 4 * 60_000) return null
  // Too old — treat as new session, don't compare ancient data
  if (age > 36 * 3600_000) return null

  const lines: string[] = []
  const tempNow = Number(weather.current?.temperature_2m ?? 0)
  const dT = tempNow - prev.tempC
  const display = (c: number) => Math.round(convertTemp(c, units))
  if (Math.abs(dT) >= 1.5) {
    const deltaDisp =
      units === 'imperial' ? Math.round(dT * (9 / 5)) : Math.round(dT)
    const sign = deltaDisp > 0 ? '+' : ''
    lines.push(`Temp ${sign}${deltaDisp}° since last open · now ${display(tempNow)}°`)
  }

  const ti = todayDailyIndex(weather)
  const popNow = Number(weather.daily?.precipitation_probability_max?.[ti] ?? 0)
  if (Math.abs(popNow - prev.popMax) >= 15) {
    lines.push(`Rain chance ${Math.round(prev.popMax)}% → ${Math.round(popNow)}%`)
  }

  const wet = willIGetWet(weather)
  if (wet.level !== prev.wetLevel) {
    if (wet.level === 'wet' || wet.level === 'maybe') {
      lines.push(`Wet risk up: ${wet.title}`)
    } else if (prev.wetLevel === 'wet' || prev.wetLevel === 'maybe') {
      lines.push('Drier than last open')
    }
  }

  const active = filterActiveAlerts(alerts)
  const newAlerts = active.filter((a) => !prev.alertIds.includes(a.id))
  const cleared = prev.alertEvents.filter(
    (ev) => !active.some((a) => a.event === ev),
  )
  if (newAlerts.length) {
    lines.push(
      newAlerts.length === 1
        ? `New alert: ${newAlerts[0].event}`
        : `${newAlerts.length} new alerts`,
    )
  } else if (cleared.length && !active.length) {
    lines.push('Alerts cleared since last open')
  }

  if (!lines.length) {
    return {
      lines: ['Conditions similar to last open'],
      ageLabel: ageLabel(age),
      significant: false,
    }
  }

  return {
    lines: lines.slice(0, 4),
    ageLabel: ageLabel(age),
    significant: true,
  }
}
