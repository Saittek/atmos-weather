import type { LocationResult } from '../api/types'
import { locationKey } from '../api/weather'

const KEY = 'solara-recent-places-v1'
const MAX = 8

export function loadRecentPlaces(): LocationResult[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as LocationResult[]
    return Array.isArray(list) ? list.filter((p) => p && Number.isFinite(p.latitude)) : []
  } catch {
    return []
  }
}

export function pushRecentPlace(loc: LocationResult): LocationResult[] {
  try {
    const prev = loadRecentPlaces()
    const key = locationKey(loc)
    const next = [
      loc,
      ...prev.filter((p) => locationKey(p) !== key),
    ].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
    return next
  } catch {
    return loadRecentPlaces()
  }
}

export function clearRecentPlaces() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
