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

/**
 * Polls favorite locations for approaching rain and fires browser notifications.
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
    const places = favorites.slice(0, 6)
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
        if (!s.precipSoon || s.rainStartsInMin == null) continue
        // Only alert if rain starts within 90 minutes
        if (s.rainStartsInMin > 90) continue
        const key = `${locationKey(s.location)}-${Math.floor(s.rainStartsInMin / 15)}`
        if (notified.current.has(key)) continue
        notified.current.add(key)
        saveNotified(notified.current)

        const msg =
          s.rainStartsInMin <= 5
            ? `Rain starting now near ${s.location.name}`
            : `Rain in ~${s.rainStartsInMin} min near ${s.location.name}`

        setBanner(msg)
        window.setTimeout(() => setBanner(null), 8000)

        if (
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          try {
            new Notification('Atmos rain watch', {
              body: msg,
              icon: '/icons/icon.svg',
              tag: key,
            })
          } catch {
            /* ignore */
          }
        }
      }
    } finally {
      setLoading(false)
    }
  }, [favorites, enabled])

  useEffect(() => {
    void refresh()
    if (!favorites.length) return
    const id = window.setInterval(() => void refresh(), 8 * 60 * 1000)
    return () => clearInterval(id)
  }, [refresh, favorites.length, currentLoc?.latitude, currentLoc?.longitude])

  return { snapshots, loading, banner, refresh }
}
