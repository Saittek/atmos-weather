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

function notify(title: string, body: string, tag: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, icon: '/icons/icon.svg', tag })
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
    const map = new Map<string, LocationResult>()
    for (const p of favorites.slice(0, 6)) {
      map.set(locationKey(p), p)
    }
    if (currentLoc) map.set(locationKey(currentLoc), currentLoc)
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
            notify('Atmos rain watch', msg, key)
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
            notify('Atmos alert', msg, key)
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
    void refresh()
    if (!favorites.length && currentLat == null) return
    const id = window.setInterval(() => void refresh(), 8 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [refresh, favorites.length, currentLat, currentLon])

  return { snapshots, loading, banner, refresh }
}
