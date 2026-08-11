/**
 * Home-centric alerts:
 * - Watch → warning escalation near exact home
 * - Morning daily brief (once per local day)
 */
import { useEffect, useRef } from 'react'
import type { LocationResult, WeatherData } from '../api/types'
import {
  fetchAllThreatPolygons,
  findNearbyThreats,
  type NearbyThreat,
} from '../api/severeLayers'
import { showLocalAlert } from '../api/push'
import { formatTemp } from '../utils/format'
import type { Units } from '../utils/format'
import { isDaytimeNow } from '../utils/daylight'
import { getWeatherInfo } from '../utils/weatherCodes'
import { todayDailyIndex } from '../utils/weatherStory'
import {
  shouldSuppressAlertNotify,
  type QuietHoursPrefs,
} from '../utils/quietHours'
import { heavyHaptic } from './useThreatProximity'

const ESCALATION_KEY = 'solara-home-escalation-v1'
const BRIEF_KEY = 'solara-home-brief-day-v1'
const WATCH_SEEN_KEY = 'solara-home-watch-seen-v1'
const POLL_MS = 2.5 * 60_000
const HOME_KM = 50
/** Local hours 6–10 inclusive for morning brief */
const BRIEF_HOUR_START = 6
const BRIEF_HOUR_END = 10

function loadSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

function saveSet(key: string, s: Set<string>, max = 60) {
  try {
    localStorage.setItem(key, JSON.stringify([...s].slice(-max)))
  } catch {
    /* ignore */
  }
}

function localDayKey(tz?: string): string {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: tz }) // YYYY-MM-DD
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

function localHour(tz?: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: tz,
    }).formatToParts(new Date())
    return Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  } catch {
    return new Date().getHours()
  }
}

function isWarning(t: NearbyThreat): boolean {
  return t.warning.significance === 'W' || t.warning.significance === 'S'
}

function isWatch(t: NearbyThreat): boolean {
  return t.warning.significance === 'A'
}

function severePhen(t: NearbyThreat): boolean {
  return ['TO', 'SV', 'FF', 'EW', 'SQ'].includes(t.warning.phenomena)
}

/**
 * Poll home for watch→warning escalation and fire a once-daily morning brief.
 */
export function useHomeAlerts(opts: {
  home: LocationResult | null | undefined
  /** Current weather when viewing home (or any weather for brief content) */
  weather: WeatherData | null
  units: Units
  enabled?: boolean
  /** Prefer home weather; if null, use weather when isHome */
  homeWeather?: WeatherData | null
  /** Quiet hours prefs (mute non-extreme overnight) */
  quietHours?: QuietHoursPrefs
}) {
  const { home, weather, units, enabled = true, homeWeather, quietHours } = opts
  const watchSeen = useRef(loadSet(WATCH_SEEN_KEY))
  const escalated = useRef(loadSet(ESCALATION_KEY))
  const quiet = quietHours ?? {}

  // —— Watch → warning escalation near home ——
  useEffect(() => {
    if (!enabled || !home) return

    let cancelled = false
    const check = async () => {
      if (typeof document !== 'undefined' && document.hidden) return
      try {
        const polys = await fetchAllThreatPolygons(home.latitude, home.longitude)
        if (cancelled) return
        const near = findNearbyThreats(home.latitude, home.longitude, polys, HOME_KM)
        const tz = home.timezone || homeWeather?.timezone || weather?.timezone

        for (const t of near) {
          if (!severePhen(t)) continue
          if (isWatch(t) && (t.inside || t.distanceKm < 40)) {
            watchSeen.current.add(`${t.warning.phenomena}-watch`)
            saveSet(WATCH_SEEN_KEY, watchSeen.current)
          }
        }

        for (const t of near) {
          if (!severePhen(t) || !isWarning(t)) continue
          if (!t.inside && t.distanceKm > 25) continue

          // Quiet hours: still allow severe/extreme home warnings through
          if (
            shouldSuppressAlertNotify(quiet, 'Severe', new Date(), tz, {
              allowSevereThrough: true,
            })
          ) {
            continue
          }

          const escKey = `esc-${t.warning.id}`
          if (escalated.current.has(escKey)) continue

          const phen = t.warning.phenomena
          const hadWatch =
            watchSeen.current.has(`${phen}-watch`) ||
            watchSeen.current.has('TO-watch') ||
            watchSeen.current.has('SV-watch')

          escalated.current.add(escKey)
          saveSet(ESCALATION_KEY, escalated.current)

          const dist = t.inside
            ? 'covers your home'
            : `~${Math.round(t.distanceKm)} km from home`
          const title = hadWatch
            ? `Solara: Watch upgraded — ${t.warning.label}`
            : `Solara: Warning near home — ${t.warning.label}`
          const body = hadWatch
            ? `A warning is now active ${dist}. Seek official guidance.`
            : `${t.warning.label} ${dist}.`

          void showLocalAlert(title, body, escKey)
          void heavyHaptic()
        }
      } catch {
        /* network ok to fail silently */
      }
    }

    void check()
    const id = window.setInterval(() => void check(), POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [
    home?.latitude,
    home?.longitude,
    home?.timezone,
    enabled,
    home,
    quiet.quietHoursEnabled,
    quiet.quietStart,
    quiet.quietEnd,
    homeWeather?.timezone,
    weather?.timezone,
  ])

  // —— Morning daily brief (once per local day, home weather preferred) ——
  useEffect(() => {
    if (!enabled || !home) return
    const w = homeWeather ?? weather
    if (!w) return

    const tz = w.timezone || home.timezone
    // Morning brief is optional comfort — respect quiet hours fully
    if (shouldSuppressAlertNotify(quiet, 'Moderate', new Date(), tz)) return

    const day = localDayKey(tz)
    const hour = localHour(tz)
    if (hour < BRIEF_HOUR_START || hour > BRIEF_HOUR_END) return

    try {
      if (localStorage.getItem(BRIEF_KEY) === day) return
    } catch {
      /* ignore */
    }

    const ti = todayDailyIndex(w)
    const high = w.daily.temperature_2m_max[ti]
    const low = w.daily.temperature_2m_min[ti]
    const pop = w.daily.precipitation_probability_max[ti] ?? 0
    const info = getWeatherInfo(w.current.weather_code, isDaytimeNow(w))
    const title = `Solara morning · ${home.name || 'Home'}`
    const body = `${info.label} · now ${formatTemp(w.current.temperature_2m, units)} · H ${formatTemp(high, units)} / L ${formatTemp(low, units)} · PoP ${Math.round(pop)}%`

    try {
      localStorage.setItem(BRIEF_KEY, day)
    } catch {
      /* ignore */
    }
    void showLocalAlert(title, body, `brief-${day}`)
  }, [
    home?.name,
    home,
    weather,
    homeWeather,
    units,
    enabled,
    weather?.current?.time,
  ])
}
