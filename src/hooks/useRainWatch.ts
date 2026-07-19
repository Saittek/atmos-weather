import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchLocationSnapshot } from '../api/weather'
import type { LocationResult, LocationSnapshot } from '../api/types'
import { locationKey } from '../api/weather'

const NOTIFIED_KEY = 'atmos-rain-watch-notified'

function loadNotified(): Set<string> {
  try {
    const raw = sessionStorage.getItem(NOTIFIED_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch {
    /* ignore */
  }
  return new Set()
}

function saveNotified(s: Set<string>) {
  try {
    sessionStorage.setItem(NOTIFIED_KEY, JSON.stringify([...s].slice(-50)))
  } catch {
    /* ignore */
  }
}

async function notify(title: string, body: string, tag: string) {
  try {
    const { showLocalAlert } = await import('../api/push')
    await showLocalAlert(title, body, tag)
    return
  } catch {
    /* fall through */
  }
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, icon: '/icons/icon-192.png', tag })
  } catch {
    /* ignore */
  }
}

/**
 * Polls favorite locations (+ optional current) for approaching rain
 * and fires browser notifications.
 */
export function useRainWatch(
  favorites: LocationResult[],
  enabled: boolean,
  currentLoc: LocationResult | null,
) {
  const [snapshots, setSnapshots] = useState<LocationSnapshot[]>([])
  const [loading, setLoading] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const notified = useRef(loadNotified())

  const refresh = useCallback(async () => {
    const mobile =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches
    // Mobile: only poll when notifications are on (big network savings)
    if (mobile && !enabled) {
      setSnapshots([])
      setLoading(false)
      return
    }
    if (typeof document !== 'undefined' && document.hidden) return

    const map = new Map<string, LocationResult>()
    // Cap network fan-out on mobile
    const favCap = mobile ? 2 : 6
    for (const p of favorites.slice(0, favCap)) {
      map.set(locationKey(p), p)
    }
    // Skip re-fetching current location on mobile — main weather already covers it
    if (currentLoc && !mobile) map.set(locationKey(currentLoc), currentLoc)
    else if (currentLoc && mobile && !favorites.length) {
      map.set(locationKey(currentLoc), currentLoc)
    }
    const places = [...map.values()]
    if (!places.length) {
      setSnapshots([])
      return
    }
    setLoading(true)
    try {
      const results = await Promise.all(places.map((p) => fetchLocationSnapshot(p)))
      const snaps = results.filter(Boolean) as LocationSnapshot[]
      setSnapshots(snaps)

      if (!enabled) return

      for (const s of snaps) {
        // Rain approaching
        if (s.precipSoon && s.rainStartsInMin != null && s.rainStartsInMin <= 90) {
          const key = `rain-${locationKey(s.location)}-${Math.floor(s.rainStartsInMin / 15)}`
          if (!notified.current.has(key)) {
            notified.current.add(key)
            const msg =
              s.rainStartsInMin <= 5
                ? `Rain starting now near ${s.location.name}`
                : `Rain in ~${s.rainStartsInMin} min near ${s.location.name}`
            setBanner(msg)
            window.setTimeout(() => setBanner(null), 8000)
            void notify('Solara rain watch', msg, key)
          }
        }

        // Alerts on favorites
        if (s.hasAlert) {
          const key = `fav-alert-${locationKey(s.location)}`
          if (!notified.current.has(key)) {
            notified.current.add(key)
            const msg = `Weather alert active near ${s.location.name}`
            setBanner(msg)
            window.setTimeout(() => setBanner(null), 8000)
            void notify('Solara alert', msg, key)
          }
        }
      }
      saveNotified(notified.current)
    } finally {
      setLoading(false)
    }
  }, [favorites, enabled, currentLoc])

  const currentLat = currentLoc?.latitude
  const currentLon = currentLoc?.longitude

  useEffect(() => {
    const mobile =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches
    // Mobile without notify: never start the rain-watch network loop
    if (mobile && !enabled) {
      setSnapshots([])
      return
    }
    const start = window.setTimeout(() => void refresh(), mobile ? 8000 : 2000)
    if (!favorites.length && currentLat == null) {
      return () => window.clearTimeout(start)
    }
    const id = window.setInterval(() => void refresh(), (mobile ? 20 : 10) * 60 * 1000)
    return () => {
      window.clearTimeout(start)
      window.clearInterval(id)
    }
  }, [refresh, favorites.length, currentLat, currentLon, enabled])

  return { snapshots, loading, banner, refresh }
}
