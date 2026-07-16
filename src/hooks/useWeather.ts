import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchAirQuality,
  fetchAlerts,
  fetchMultiModel,
  fetchPressureProfile,
  fetchTropicalStorms,
  fetchWeather,
  locationKey,
  parseShareParams,
  reverseGeocode,
} from '../api/weather'
import { saveUserData, type CloudPrefs } from '../api/auth'
import type {
  AirQualityData,
  DensityMode,
  LocationResult,
  ModelSeries,
  PressureLevelProfile,
  ThemeMode,
  TropicalStorm,
  WeatherAlert,
  WeatherData,
} from '../api/types'
import type { Units } from '../utils/format'
import { useAuth } from './useAuth'
import { getCurrentPosition } from '../lib/native'
import { loadOfflineBundle, saveOfflineBundle } from '../utils/offlineCache'
import { filterActiveAlerts } from '../utils/activeAlerts'

const STORAGE_KEY = 'atmos-weather-prefs-v2'
const NOTIFIED_KEY = 'atmos-notified-alerts'
const AQI_NOTIFIED_KEY = 'atmos-notified-aqi'

export interface Prefs {
  units: Units
  theme: ThemeMode
  density: DensityMode
  lastLocation?: LocationResult
  favorites: LocationResult[]
  severeMode: boolean
  /** Radar-first, intense UI — the signature “stand out” mode */
  stormMode: boolean
  notifyAlerts: boolean
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<Prefs>
      return {
        units: p.units ?? 'imperial',
        theme: p.theme ?? 'dark',
        density: p.density ?? 'comfortable',
        lastLocation: p.lastLocation,
        favorites: Array.isArray(p.favorites) ? p.favorites : [],
        severeMode: p.severeMode ?? true,
        stormMode: p.stormMode ?? false,
        notifyAlerts: p.notifyAlerts ?? false,
      }
    }
    const old = localStorage.getItem('atmos-weather-prefs')
    if (old) {
      const p = JSON.parse(old) as { units?: Units; lastLocation?: LocationResult }
      return {
        units: p.units ?? 'imperial',
        theme: 'dark',
        density: 'comfortable',
        lastLocation: p.lastLocation,
        favorites: [],
        severeMode: true,
        stormMode: false,
        notifyAlerts: false,
      }
    }
  } catch {
    /* ignore */
  }
  return {
    units: 'imperial',
    theme: 'dark',
    density: 'comfortable',
    favorites: [],
    severeMode: true,
    stormMode: false,
    notifyAlerts: false,
  }
}

function saveLocal(prefs: Prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement
  let mode: 'dark' | 'light' = 'dark'
  if (theme === 'light') mode = 'light'
  else if (theme === 'auto') {
    mode = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }
  root.dataset.theme = mode
  root.style.colorScheme = mode
  return mode
}

function prefsToCloud(p: Prefs): CloudPrefs {
  return {
    units: p.units,
    theme: p.theme,
    density: p.density,
    lastLocation: p.lastLocation ?? null,
    favorites: p.favorites,
    severeMode: p.severeMode,
    stormMode: p.stormMode,
    notifyAlerts: p.notifyAlerts,
  }
}

function cloudToPrefs(c: CloudPrefs, local: Prefs): Prefs {
  const map = new Map<string, LocationResult>()
  for (const f of [...(c.favorites ?? []), ...local.favorites]) {
    if (f?.latitude != null && f?.longitude != null) {
      map.set(locationKey(f), f)
    }
  }
  return {
    units: c.units ?? local.units,
    theme: c.theme ?? local.theme,
    density: c.density ?? local.density,
    lastLocation: c.lastLocation ?? local.lastLocation,
    favorites: [...map.values()].slice(0, 12),
    severeMode: c.severeMode ?? local.severeMode,
    stormMode: c.stormMode ?? local.stormMode,
    notifyAlerts: c.notifyAlerts ?? local.notifyAlerts,
  }
}

function loadNotified(): Set<string> {
  try {
    const raw = sessionStorage.getItem(NOTIFIED_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch {
    /* ignore */
  }
  return new Set()
}

function saveNotified(set: Set<string>) {
  try {
    sessionStorage.setItem(NOTIFIED_KEY, JSON.stringify([...set].slice(-40)))
  } catch {
    /* ignore */
  }
}

export function useWeather() {
  const { user, cloudData, setCloudData } = useAuth()
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>(() =>
    applyTheme(loadPrefs().theme),
  )
  const [location, setLocation] = useState<LocationResult | null>(prefs.lastLocation ?? null)
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [air, setAir] = useState<AirQualityData | null>(null)
  const [alerts, setAlerts] = useState<WeatherAlert[]>([])
  const [models, setModels] = useState<ModelSeries[]>([])
  const [profile, setProfile] = useState<PressureLevelProfile | null>(null)
  const [storms, setStorms] = useState<TropicalStorm[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [severeActive, setSevereActive] = useState(false)
  const [cloudSynced, setCloudSynced] = useState(false)
  const [cloudStatus, setCloudStatus] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [offline, setOffline] = useState(false)

  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  const syncTimer = useRef<number | null>(null)
  const statusTimer = useRef<number | null>(null)
  const skipCloudPush = useRef(false)
  const hydratedUser = useRef<string | null>(null)
  const initialLoadDone = useRef(false)
  const fetchGen = useRef(0)
  const notifiedRef = useRef<Set<string>>(loadNotified())
  const locationRef = useRef(location)
  locationRef.current = location
  const weatherRef = useRef(weather)
  weatherRef.current = weather

  const showStatus = useCallback((msg: string, ms = 2200) => {
    setCloudStatus(msg)
    if (statusTimer.current) window.clearTimeout(statusTimer.current)
    statusTimer.current = window.setTimeout(() => setCloudStatus(null), ms)
  }, [])

  useEffect(() => {
    const mode = applyTheme(prefs.theme)
    setResolvedTheme(mode)
    document.documentElement.dataset.density = prefs.density

    if (prefs.theme !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => setResolvedTheme(applyTheme('auto'))
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [prefs.theme, prefs.density])

  useEffect(() => {
    return () => {
      if (syncTimer.current) window.clearTimeout(syncTimer.current)
      if (statusTimer.current) window.clearTimeout(statusTimer.current)
    }
  }, [])

  const pushCloud = useCallback(
    async (p: Prefs, quiet = false) => {
      if (!user) return
      try {
        const saved = await saveUserData(prefsToCloud(p))
        setCloudData(saved)
        setCloudSynced(true)
        if (!quiet) showStatus('Saved to account')
      } catch {
        setCloudSynced(false)
        if (!quiet) showStatus('Cloud save failed — check that the server is running', 3500)
      }
    },
    [user, setCloudData, showStatus],
  )

  const scheduleCloudPush = useCallback(
    (p: Prefs) => {
      if (!user || skipCloudPush.current) return
      if (syncTimer.current) window.clearTimeout(syncTimer.current)
      syncTimer.current = window.setTimeout(() => {
        void pushCloud(p)
      }, 700)
    },
    [user, pushCloud],
  )

  const commitPrefs = useCallback(
    (next: Prefs) => {
      saveLocal(next)
      setPrefs(next)
      scheduleCloudPush(next)
    },
    [scheduleCloudPush],
  )

  const patchPrefs = useCallback(
    (partial: Partial<Prefs>) => {
      commitPrefs({ ...prefsRef.current, ...partial })
    },
    [commitPrefs],
  )

  const loadForLocationRef = useRef<
    ((loc: LocationResult, opts?: { soft?: boolean }) => Promise<void>) | null
  >(null)

  // Hydrate account data once per login
  useEffect(() => {
    if (!user || !cloudData) {
      if (!user) {
        hydratedUser.current = null
        setCloudSynced(false)
      }
      return
    }
    if (hydratedUser.current === user.id) return
    hydratedUser.current = user.id

    skipCloudPush.current = true
    const local = prefsRef.current
    const merged = cloudToPrefs(cloudData, local)
    saveLocal(merged)
    setPrefs(merged)
    setCloudSynced(true)
    showStatus('Account data loaded')

    window.setTimeout(() => {
      skipCloudPush.current = false
      void pushCloud(merged, true)
    }, 80)

    if (merged.lastLocation && !parseShareParams()) {
      const cur = locationRef.current
      const next = merged.lastLocation
      if (!cur || locationKey(cur) !== locationKey(next)) {
        window.setTimeout(() => {
          void loadForLocationRef.current?.(next)
        }, 120)
      }
    }
  }, [user, cloudData, pushCloud, showStatus])

  const loadForLocation = useCallback(
    async (loc: LocationResult, opts?: { soft?: boolean }) => {
      const gen = ++fetchGen.current
      const soft = Boolean(opts?.soft && weatherRef.current)
      if (soft) setRefreshing(true)
      else setLoading(true)
      setError(null)
      setLocation(loc)

      // Only persist location change when not a background soft refresh of same place
      const prev = prefsRef.current.lastLocation
      const samePlace = prev && locationKey(prev) === locationKey(loc)
      if (!soft || !samePlace) {
        commitPrefs({ ...prefsRef.current, lastLocation: loc })
      }

      try {
        const u = new URL(window.location.href)
        u.searchParams.set('lat', loc.latitude.toFixed(4))
        u.searchParams.set('lon', loc.longitude.toFixed(4))
        u.searchParams.set('name', loc.name)
        if (loc.admin1) u.searchParams.set('region', loc.admin1)
        else u.searchParams.delete('region')
        if (loc.country) u.searchParams.set('country', loc.country)
        else u.searchParams.delete('country')
        window.history.replaceState({}, '', u.toString())
      } catch {
        /* ignore */
      }

      try {
        const mobile =
          typeof window !== 'undefined' &&
          window.matchMedia('(max-width: 720px)').matches

        // Phase 1 — forecast only (fastest paint; biggest mobile win)
        const w = await fetchWeather(loc.latitude, loc.longitude)
        if (gen !== fetchGen.current) return
        setWeather(w)
        setUpdatedAt(Date.now())
        setOffline(false)
        setLoading(false)
        setRefreshing(false)

        // Phase 1b — air + alerts (don't block the first paint)
        const loadAirAlerts = async () => {
          if (gen !== fetchGen.current) return
          const [a, al] = await Promise.all([
            fetchAirQuality(loc.latitude, loc.longitude),
            fetchAlerts(loc.latitude, loc.longitude),
          ])
          if (gen !== fetchGen.current) return
          const activeAlerts = filterActiveAlerts(al)
          setAir(a)
          setAlerts(activeAlerts)
          saveOfflineBundle({
            location: loc,
            weather: w,
            air: a,
            alerts: activeAlerts,
            savedAt: Date.now(),
          })
          const severe = activeAlerts.some((x) =>
            ['Extreme', 'Severe', 'Moderate'].includes(x.severity),
          )
          setSevereActive(severe)

          const notify = prefsRef.current.notifyAlerts
          if (
            notify &&
            'Notification' in window &&
            Notification.permission === 'granted'
          ) {
            for (const top of activeAlerts.slice(0, 3)) {
              if (!['Extreme', 'Severe', 'Moderate'].includes(top.severity)) continue
              if (notifiedRef.current.has(top.id)) continue
              notifiedRef.current.add(top.id)
              try {
                new Notification(`Solara: ${top.event}`, {
                  body: top.headline,
                  icon: '/icons/icon-192.png',
                  tag: top.id,
                })
              } catch {
                /* ignore */
              }
            }
            saveNotified(notifiedRef.current)
            const aqi = a?.current?.us_aqi
            if (aqi != null && aqi >= 100) {
              const aqiKey = `aqi-${locationKey(loc)}-${Math.floor(aqi / 25)}`
              try {
                const raw = sessionStorage.getItem(AQI_NOTIFIED_KEY)
                const set = new Set(raw ? (JSON.parse(raw) as string[]) : [])
                if (!set.has(aqiKey)) {
                  set.add(aqiKey)
                  sessionStorage.setItem(
                    AQI_NOTIFIED_KEY,
                    JSON.stringify([...set].slice(-30)),
                  )
                  new Notification('Solara air quality', {
                    body: `AQI ${aqi} near ${loc.name} — limit outdoor time if sensitive`,
                    icon: '/icons/icon-192.png',
                    tag: aqiKey,
                  })
                }
              } catch {
                /* ignore */
              }
            }
          }
        }

        if (mobile) {
          window.setTimeout(() => void loadAirAlerts(), soft ? 80 : 280)
        } else {
          void loadAirAlerts()
        }

        // Phase 2 — heavy secondary (skip entirely on mobile to save radio/CPU)
        if (!mobile) {
          const loadSecondary = async () => {
            if (gen !== fetchGen.current) return
            if (typeof document !== 'undefined' && document.hidden) return
            try {
              const [m, pr, st] = await Promise.all([
                fetchMultiModel(loc.latitude, loc.longitude),
                fetchPressureProfile(loc.latitude, loc.longitude),
                fetchTropicalStorms(),
              ])
              if (gen !== fetchGen.current) return
              setModels(m)
              setProfile(pr)
              setStorms(st)
            } catch {
              /* optional */
            }
          }
          const ric = (
            window as Window & {
              requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
            }
          ).requestIdleCallback
          if (typeof ric === 'function') {
            ric(() => void loadSecondary(), { timeout: 4000 })
          } else {
            window.setTimeout(() => void loadSecondary(), 1500)
          }
        } else {
          // Clear stale secondary from previous location
          setModels([])
          setProfile(null)
          setStorms([])
        }
      } catch (e) {
        if (gen !== fetchGen.current) return
        // Offline fallback: last good snapshot
        const cached = loadOfflineBundle()
        if (cached?.weather) {
          const cachedAlerts = filterActiveAlerts(cached.alerts ?? [])
          setLocation(cached.location)
          setWeather(cached.weather)
          setAir(cached.air)
          setAlerts(cachedAlerts)
          setUpdatedAt(cached.savedAt)
          setOffline(true)
          setSevereActive(
            cachedAlerts.some((x) =>
              ['Extreme', 'Severe', 'Moderate'].includes(x.severity),
            ),
          )
          setError(null)
          showStatus(
            `Offline · showing last weather from ${new Date(cached.savedAt).toLocaleTimeString()}`,
          )
        } else {
          setError(e instanceof Error ? e.message : 'Failed to load weather')
        }
      } finally {
        if (gen === fetchGen.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [commitPrefs, showStatus],
  )

  loadForLocationRef.current = loadForLocation

  const setUnits = useCallback((units: Units) => patchPrefs({ units }), [patchPrefs])
  const setTheme = useCallback((theme: ThemeMode) => patchPrefs({ theme }), [patchPrefs])
  const setDensity = useCallback((density: DensityMode) => patchPrefs({ density }), [patchPrefs])
  const setSevereMode = useCallback(
    (severeMode: boolean) => patchPrefs({ severeMode }),
    [patchPrefs],
  )

  const setStormMode = useCallback(
    (stormMode: boolean) => {
      // Storm mode: radar-first + keep severe highlighting on
      patchPrefs({
        stormMode,
        severeMode: stormMode ? true : prefsRef.current.severeMode,
      })
    },
    [patchPrefs],
  )

  const setNotifyAlerts = useCallback(
    async (notifyAlerts: boolean) => {
      if (notifyAlerts && 'Notification' in window) {
        const perm = await Notification.requestPermission()
        if (perm !== 'granted') {
          patchPrefs({ notifyAlerts: false })
          showStatus('Notification permission denied')
          return false
        }
      }
      patchPrefs({ notifyAlerts })
      return true
    },
    [patchPrefs, showStatus],
  )

  const toggleFavorite = useCallback(
    (loc: LocationResult) => {
      const p = prefsRef.current
      const key = locationKey(loc)
      const exists = p.favorites.some((f) => locationKey(f) === key)
      const favorites = exists
        ? p.favorites.filter((f) => locationKey(f) !== key)
        : [...p.favorites, loc].slice(0, 12)
      commitPrefs({ ...p, favorites })
      showStatus(exists ? 'Removed from favorites' : 'Saved to favorites')
    },
    [commitPrefs, showStatus],
  )

  const isFavorite = useCallback(
    (loc: LocationResult | null) => {
      if (!loc) return false
      return prefs.favorites.some((f) => locationKey(f) === locationKey(loc))
    },
    [prefs.favorites],
  )

  const requestMyLocation = useCallback(() => {
    setGeoLoading(true)
    setError(null)
    void (async () => {
      try {
        const pos = await getCurrentPosition()
        const loc = await reverseGeocode(pos.latitude, pos.longitude)
        await loadForLocation(loc)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not get your location'
        setError(
          /permission/i.test(msg)
            ? 'Location permission denied — search for a city instead'
            : msg,
        )
      } finally {
        setGeoLoading(false)
      }
    })()
  }, [loadForLocation])

  const syncNow = useCallback(async () => {
    if (!user) {
      showStatus('Sign in to sync')
      return
    }
    await pushCloud(prefsRef.current)
  }, [user, pushCloud, showStatus])

  const clearError = useCallback(() => setError(null), [])

  // Initial load once
  useEffect(() => {
    if (initialLoadDone.current) return
    initialLoadDone.current = true
    const shared = parseShareParams()
    if (shared) void loadForLocation(shared)
    else if (prefs.lastLocation) void loadForLocation(prefs.lastLocation)
    else requestMyLocation()
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Soft auto-refresh — rare on mobile; never when tab is hidden
  useEffect(() => {
    if (!location) return
    const mobile =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches
    const ms = (mobile ? 20 : 12) * 60 * 1000
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      void loadForLocationRef.current?.(location, { soft: true })
    }, ms)
    return () => clearInterval(id)
  }, [location])

  // Drop alerts the moment they expire (without waiting for next fetch)
  useEffect(() => {
    if (!alerts.length) return
    const tick = () => {
      setAlerts((prev) => {
        const next = filterActiveAlerts(prev)
        if (next.length === prev.length) return prev
        setSevereActive(
          next.some((x) =>
            ['Extreme', 'Severe', 'Moderate'].includes(x.severity),
          ),
        )
        return next
      })
    }
    const id = window.setInterval(tick, 60 * 1000)
    return () => window.clearInterval(id)
  }, [alerts.length])

  return {
    location,
    weather,
    air,
    alerts,
    models,
    profile,
    storms,
    loading,
    refreshing,
    error,
    geoLoading,
    units: prefs.units,
    theme: prefs.theme,
    resolvedTheme,
    density: prefs.density,
    favorites: prefs.favorites,
    severeMode: prefs.severeMode,
    stormMode: prefs.stormMode,
    notifyAlerts: prefs.notifyAlerts,
    severeActive,
    cloudSynced,
    cloudStatus,
    updatedAt,
    offline,
    setUnits,
    setTheme,
    setDensity,
    setSevereMode,
    setStormMode,
    setNotifyAlerts,
    toggleFavorite,
    isFavorite,
    loadForLocation,
    requestMyLocation,
    /** @deprecated use requestMyLocation */
    useMyLocation: requestMyLocation,
    syncNow,
    clearError,
    refresh: () => location && loadForLocation(location, { soft: !!weather }),
  }
}
