/**
 * Saved dark-sky observing sites (local).
 */
export interface DarkSite {
  id: string
  name: string
  latitude: number
  longitude: number
  note?: string
  addedAt: number
}

const KEY = 'solara-dark-sites-v1'

export function loadDarkSites(): DarkSite[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as DarkSite[]
    return Array.isArray(arr) ? arr.slice(0, 24) : []
  } catch {
    return []
  }
}

export function saveDarkSites(sites: DarkSite[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(sites.slice(0, 24)))
  } catch {
    /* ignore */
  }
}

export function addDarkSite(
  site: Omit<DarkSite, 'id' | 'addedAt'>,
  list?: DarkSite[],
): DarkSite[] {
  const cur = list ?? loadDarkSites()
  const next: DarkSite = {
    ...site,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    addedAt: Date.now(),
  }
  // Dedupe near coords
  const filtered = cur.filter(
    (s) =>
      Math.abs(s.latitude - next.latitude) > 0.02 ||
      Math.abs(s.longitude - next.longitude) > 0.02,
  )
  const out = [next, ...filtered].slice(0, 24)
  saveDarkSites(out)
  return out
}

export function removeDarkSite(id: string, list?: DarkSite[]): DarkSite[] {
  const cur = list ?? loadDarkSites()
  const out = cur.filter((s) => s.id !== id)
  saveDarkSites(out)
  return out
}

/** Haversine km */
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371
  const toR = (d: number) => (d * Math.PI) / 180
  const dLat = toR(b.latitude - a.latitude)
  const dLon = toR(b.longitude - a.longitude)
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(a.latitude)) * Math.cos(toR(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

export function driveHintKm(km: number): string {
  if (km < 1) return 'Here'
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}
