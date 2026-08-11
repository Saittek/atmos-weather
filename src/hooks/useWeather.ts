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
import { publishNativeWidgetSnapshot } from '../lib/nativeWidget'
import { loadOfflineBundle, offlineAgeLabel, saveOfflineBundle } from '../utils/offlineCache'
import { filterActiveAlerts } from '../utils/activeAlerts'
import { applyTheme } from '../lib/theme'
import { favoritesCap } from '../lib/entitlements'
import { shouldSuppressAlertNotify } from '../utils/quietHours'

const STORAGE_KEY = 'atmos-weather-prefs-v2'
const NOTIFIED_KEY = 'atmos-notified-alerts'
const AQI_NOTIFIED_KEY = 'atmos-notified-aqi'

export interface Prefs {
  units: Units
  theme: ThemeMode
  density: DensityMode
  lastLocation?: LocationResult
  /** Exact home pin — full GPS/manual precision, not city center */
  homeLocation?: LocationResult | null
  /** Work / second pin */
  workLocation?: LocationResult | null
  favorites: LocationResult[]
  severeMode: boolean
  /** Radar-first, intense UI — the signature “stand out” mode */
  stormMode: boolean
  notifyAlerts: boolean
  /** Mute non-Extreme push/local alerts in this local-time window */
  quietHoursEnabled: boolean
  /** "HH:MM" 24h */
  quietStart: string
  /** "HH:MM" 24h */
  quietEnd: string
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
        homeLocation: p.homeLocation ?? null,
        workLocation: p.workLocation ?? null,
        favorites: Array.isArray(p.favorites) ? p.favorites : [],
        severeMode: p.severeMode ?? true,
        stormMode: p.stormMode ?? false,
        notifyAlerts: p.notifyAlerts ?? false,
        quietHoursEnabled: p.quietHoursEnabled ?? false,
        quietStart: typeof p.quietStart === 'string' ? p.quietStart : '22:00',
        quietEnd: typeof p.quietEnd === 'string' ? p.quietEnd : '07:00',
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
        homeLocation: null,
        workLocation: null,
        favorites: [],
        severeMode: true,
        stormMode: false,
        notifyAlerts: false,
        quietHoursEnabled: false,
        quietStart: '22:00',
        quietEnd: '07:00',
      }
    }
  } catch {
    /* ignore */
  }
  return {
    units: 'imperial',
    theme: 'dark',
    density: 'comfortable',
    homeLocation: null,
    workLocation: null,
    favorites: [],
    severeMode: true,
    stormMode: false,
    notifyAlerts: false,
    quietHoursEnabled: false,
    quietStart: '22:00',
    quietEnd: '07:00',
  }
}

function saveLocal(prefs: Prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}

function prefsToCloud(p: Prefs): CloudPrefs {
  return {
    units: p.units,
    theme: p.theme,
    density: p.density,
    lastLocation: p.lastLocation ?? null,
    homeLocation: p.homeLocation ?? null,
    workLocation: p.workLocation ?? null,
    favorites: p.favorites,
    severeMode: p.severeMode,
    stormMode: p.stormMode,
    notifyAlerts: p.notifyAlerts,
    quietHoursEnabled: p.quietHoursEnabled,
    quietStart: p.quietStart,
    quietEnd: p.quietEnd,
  }
}

function cloudToPrefs(c: CloudPrefs, local: Prefs): Prefs {
  const map = new Map<string, LocationResult>()
  for (const f of [...(c.favorites ?? []), ...local.favorites]) {
    if (f?.latitude != null && f?.longitude != null) {
      map.set(locationKey(f), f)
    }
  }
  // Home: cloud wins when set; if account has no home yet, keep this device’s
  // pin so the next push uploads it (desktop → phone after first sign-in).
  const cloudHome = c.homeLocation
  const homeLocation =
    cloudHome != null &&
    Number.isFinite(cloudHome.latitude) &&
    Number.isFinite(cloudHome.longitude)
      ? cloudHome
      : (local.homeLocation ?? null)
  const cloudWork = c.workLocation
  const workLocation =
    cloudWork != null &&
    Number.isFinite(cloudWork.latitude) &&
    Number.isFinite(cloudWork.longitude)
      ? cloudWork
      : (local.workLocation ?? null)
  return {
    units: c.units ?? local.units,
    theme: c.theme ?? local.theme,
    density: c.density ?? local.density,
    lastLocation: c.lastLocation ?? local.lastLocation,
    homeLocation,
    workLocation,
    favorites: [...map.values()].slice(0, favoritesCap()),
    severeMode: c.severeMode ?? local.severeMode,
    stormMode: c.stormMode ?? local.stormMode,
    notifyAlerts: c.notifyAlerts ?? local.notifyAlerts,
    quietHoursEnabled: c.quietHoursEnabled ?? local.quietHoursEnabled,
    quietStart: c.quietStart ?? local.quietStart,
    quietEnd: c.quietEnd ?? local.quietEnd,
  }
}

/** Same place within ~11 m (exact home match) */
export function sameExactPlace(a: LocationResult | null | undefined, b: LocationResult | null | undefined): boolean {
  if (!a || !b) return false
  return (
    Math.abs(a.latitude - b.latitude) < 0.0001 &&
    Math.abs(a.longitude - b.longitude) < 0.0001
  )
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
    applyTheme(prefs.theme),
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
      const keepPainted = Boolean(weatherRef.current)
      // Soft / place-switch while we already have a forecast: keep UI painted (no skeleton flash)
      if (soft || keepPainted) setRefreshing(true)
      else setLoading(true)
      setError(null)
      // Soft refresh of same pin — update location immediately. Place switches wait for weather
      // so place name never mismatches old temps.
      if (soft || !keepPainted) {
        setLocation(loc)
      }

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
        const w = await fetchWeather(loc.latitude, loc.longitude, { lite: mobile })
        if (gen !== fetchGen.current) return
        setLocation(loc)
        setWeather(w)
        // Drop previous place's air/alerts so we don't flash stale AQI/warnings
        if (!soft) {
          setAir(null)
          setAlerts([])
          setSevereActive(false)
          setModels([])
          setProfile(null)
          setStorms([])
        }
        setUpdatedAt(Date.now())
        setOffline(false)
        setLoading(false)
        setRefreshing(false)

        // Save forecast ASAP so offline + widget have something even if air fails
        saveOfflineBundle({
          location: loc,
          weather: w,
          air: null,
          alerts: [],
          savedAt: Date.now(),
        })

        // Home Screen WidgetKit tile (iOS native app only)
        void publishNativeWidgetSnapshot({
          location: loc,
          weather: w,
          units: prefsRef.current.units,
          homeLocation: prefsRef.current.homeLocation,
        })

        // Phase 1b — air + alerts (don't block the first paint)
        const loadAirAlerts = async () => {
          if (gen !== fetchGen.current) return
          try {
            const [a, al] = await Promise.all([
              fetchAirQuality(loc.latitude, loc.longitude, { lite: mobile }),
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
            const quietPrefs = prefsRef.current
            if (
              notify &&
              'Notification' in window &&
              Notification.permission === 'granted'
            ) {
              for (const top of activeAlerts.slice(0, 3)) {
                if (!['Extreme', 'Severe', 'Moderate'].includes(top.severity)) continue
                if (
                  shouldSuppressAlertNotify(
                    quietPrefs,
                    top.severity,
                    new Date(),
                    w.timezone || loc.timezone,
                  )
                ) {
                  continue
                }
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
              if (
                !shouldSuppressAlertNotify(
                  quietPrefs,
                  'Moderate',
                  new Date(),
                  w.timezone || loc.timezone,
                )
              ) {
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
          } catch {
            /* keep forecast; offline already has weather */
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
        // Offline: only use cache for THIS place — never swap to home/last city
        const cached = loadOfflineBundle(loc)
        if (cached?.weather) {
          const cachedAlerts = filterActiveAlerts(cached.alerts ?? [])
          // Keep the place the user asked for; weather is for the same pin
          setLocation(loc)
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
          // Keep Home Screen widget filled with last known forecast
          void publishNativeWidgetSnapshot({
            location: loc,
            weather: cached.weather,
            units: prefsRef.current.units,
            homeLocation: prefsRef.current.homeLocation,
          })
          showStatus(
            `Offline · last weather for ${loc.name} · ${offlineAgeLabel(cached.savedAt)}`,
            5000,
          )
        } else {
          setError(
            e instanceof Error
              ? `${e.message} — check connection and try again`
              : 'Could not load weather — check connection and try again',
          )
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

  const setUnits = useCallback(
    (units: Units) => {
      patchPrefs({ units })
      const loc = locationRef.current
      const w = weatherRef.current
      if (loc && w) {
        void publishNativeWidgetSnapshot({
          location: loc,
          weather: w,
          units,
          homeLocation: prefsRef.current.homeLocation,
        })
      }
    },
    [patchPrefs],
  )
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
      if (notifyAlerts) {
        if ('Notification' in window) {
          const perm = await Notification.requestPermission()
          if (perm !== 'granted') {
            patchPrefs({ notifyAlerts: false })
            showStatus('Notification permission denied')
            return false
          }
        }
        // Web Push (background) + native hooks when available
        try {
          const { ensurePushSubscription, recordPushSyncResult } = await import('../api/push')
          const result = await ensurePushSubscription()
          recordPushSyncResult(result.ok, result.reason)
          if (!result.ok) {
            // Still allow in-app/local notify when push subscribe needs sign-in
            if (result.reason?.toLowerCase().includes('sign in')) {
              showStatus('Notifications on — sign in for alerts when the app is closed')
            } else if (result.reason) {
              showStatus(result.reason)
            }
          } else {
            showStatus('Alert notifications enabled · closed-app push registered')
          }
        } catch {
          /* optional */
        }
      } else {
        try {
          const { unsubscribeWebPush } = await import('../api/push')
          await unsubscribeWebPush()
        } catch {
          /* ignore */
        }
      }
      patchPrefs({ notifyAlerts })
      return true
    },
    [patchPrefs, showStatus],
  )

  const setQuietHours = useCallback(
    (patch: {
      quietHoursEnabled?: boolean
      quietStart?: string
      quietEnd?: string
    }) => {
      patchPrefs(patch)
    },
    [patchPrefs],
  )

  const toggleFavorite = useCallback(
    (loc: LocationResult) => {
      const p = prefsRef.current
      const key = locationKey(loc)
      const exists = p.favorites.some((f) => locationKey(f) === key)
      if (!exists) {
        const cap = favoritesCap()
        if (p.favorites.length >= cap) {
          showStatus(
            `Saved places full (${cap}). Remove one or Preview Pro in Settings for more.`,
          )
          return
        }
        const favorites = [...p.favorites, loc].slice(0, cap)
        commitPrefs({ ...p, favorites })
        showStatus('Saved to favorites')
        return
      }
      const favorites = p.favorites.filter((f) => locationKey(f) !== key)
      commitPrefs({ ...p, favorites })
      showStatus('Removed from favorites')
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

  const pinExact = useCallback((loc: LocationResult, label: string): LocationResult | null => {
    const pin: LocationResult = {
      id: loc.id || 1,
      name: (loc.name || label).trim() || label,
      latitude: Number(loc.latitude),
      longitude: Number(loc.longitude),
      elevation: loc.elevation,
      country_code: loc.country_code,
      country: loc.country,
      admin1: loc.admin1,
      timezone: loc.timezone,
      population: loc.population,
    }
    if (
      !Number.isFinite(pin.latitude) ||
      !Number.isFinite(pin.longitude) ||
      Math.abs(pin.latitude) > 90 ||
      Math.abs(pin.longitude) > 180
    ) {
      return null
    }
    return pin
  }, [])

  const setHomeLocation = useCallback(
    (loc: LocationResult | null) => {
      const p = prefsRef.current
      if (!loc) {
        commitPrefs({ ...p, homeLocation: null })
        showStatus(
          user
            ? 'Home cleared · syncing to your account'
            : 'Home cleared on this device · Sign in to sync phones',
        )
        return
      }
      const home = pinExact(loc, 'Home')
      if (!home) {
        showStatus('Invalid coordinates for home')
        return
      }
      commitPrefs({ ...p, homeLocation: home })
      const coords = `${home.latitude.toFixed(5)}, ${home.longitude.toFixed(5)}`
      showStatus(
        user
          ? `Home set · ${coords} · syncing to phone when signed in`
          : `Home set · ${coords} · Sign in to use this home on your phone`,
      )
      const w = weatherRef.current
      if (w && locationRef.current && locationKey(locationRef.current) === locationKey(home)) {
        void publishNativeWidgetSnapshot({
          location: home,
          weather: w,
          units: prefsRef.current.units,
          homeLocation: home,
        })
      } else {
        window.setTimeout(() => {
          void loadForLocationRef.current?.(home)
        }, 80)
      }
    },
    [commitPrefs, showStatus, user, pinExact],
  )

  const setWorkLocation = useCallback(
    (loc: LocationResult | null) => {
      const p = prefsRef.current
      if (!loc) {
        commitPrefs({ ...p, workLocation: null })
        showStatus(user ? 'Work cleared · syncing' : 'Work cleared on this device')
        return
      }
      const work = pinExact(loc, 'Work')
      if (!work) {
        showStatus('Invalid coordinates for work')
        return
      }
      // Label clearly if name is a city only
      if (!/work/i.test(work.name)) {
        work.name = `${work.name.replace(/\s*\(Work\)\s*$/i, '').trim()} (Work)`
      }
      commitPrefs({ ...p, workLocation: work })
      showStatus(
        user
          ? `Work set · ${work.latitude.toFixed(5)}, ${work.longitude.toFixed(5)}`
          : `Work set · rain watch will include this pin`,
      )
    },
    [commitPrefs, showStatus, user, pinExact],
  )

  const isWork = useCallback(
    (loc: LocationResult | null) => sameExactPlace(loc, prefs.workLocation),
    [prefs.workLocation],
  )

  const goWork = useCallback(() => {
    const work = prefsRef.current.workLocation
    if (!work) {
      showStatus('No work pin yet')
      return
    }
    void loadForLocation(work)
  }, [loadForLocation, showStatus])

  const isHome = useCallback(
    (loc: LocationResult | null) => sameExactPlace(loc, prefs.homeLocation),
    [prefs.homeLocation],
  )

  const goHome = useCallback(() => {
    const home = prefsRef.current.homeLocation
    if (!home) {
      showStatus('No home set yet')
      return
    }
    void loadForLocation(home)
  }, [loadForLocation, showStatus])

  const requestMyLocation = useCallback(() => {
    setGeoLoading(true)
    setError(null)
    void (async () => {
      try {
        const pos = await getCurrentPosition()
        const labeled = await reverseGeocode(pos.latitude, pos.longitude)
        // Keep device GPS precision — reverse geocode is only for the label
        const loc: LocationResult = {
          ...labeled,
          latitude: pos.latitude,
          longitude: pos.longitude,
        }
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

  // Initial load once — prefer share link → exact home → last place → GPS
  useEffect(() => {
    if (initialLoadDone.current) return
    initialLoadDone.current = true
    const shared = parseShareParams()
    if (shared) void loadForLocation(shared)
    else if (prefs.homeLocation) void loadForLocation(prefs.homeLocation)
    else if (prefs.lastLocation) void loadForLocation(prefs.lastLocation)
    else requestMyLocation()

    // Re-register push if user already enabled notify (token/VAPID refresh)
    if (prefs.notifyAlerts) {
      void import('../api/push')
        .then(({ ensurePushSubscription }) => ensurePushSubscription())
        .catch(() => {})
    }
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Soft auto-refresh — fresher icons/conditions; never when tab is hidden
  useEffect(() => {
    if (!location) return
    const mobile =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches
    // Soft refresh — less aggressive on mobile (battery + radio)
    const ms = (mobile ? 12 : 7) * 60 * 1000
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      void loadForLocationRef.current?.(location, { soft: true })
    }, ms)
    return () => clearInterval(id)
  }, [location])

  // When the user returns to the tab after a while, soft-refresh once (keeps “now” current)
  useEffect(() => {
    if (!location) return
    let hiddenAt = 0
    const onVis = () => {
      if (document.hidden) {
        hiddenAt = Date.now()
        return
      }
      const away = hiddenAt ? Date.now() - hiddenAt : 0
      // Away ≥ 3 minutes → refresh; ignore quick tab switches
      if (away >= 3 * 60 * 1000) {
        const loc = locationRef.current
        if (loc) void loadForLocationRef.current?.(loc, { soft: true })
      }
      // Re-sync push when notify is on (token/subscription recovery)
      if (prefsRef.current.notifyAlerts && away >= 60_000) {
        void import('../api/push')
          .then(async ({ ensurePushSubscription, recordPushSyncResult }) => {
            const r = await ensurePushSubscription()
            recordPushSyncResult(r.ok, r.reason)
          })
          .catch(() => {})
      }
      hiddenAt = 0
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [location])

  // Re-publish Home Screen widget when returning to the native app
  useEffect(() => {
    let remove: (() => void) | undefined
    void (async () => {
      try {
        const { App } = await import('@capacitor/app')
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) return
          const loc = locationRef.current
          const w = weatherRef.current
          if (loc && w) {
            void publishNativeWidgetSnapshot({
              location: loc,
              weather: w,
              units: prefsRef.current.units,
              homeLocation: prefsRef.current.homeLocation,
            })
          }
        })
        remove = () => {
          void handle.remove()
        }
      } catch {
        /* web / plugin missing */
      }
    })()
    return () => remove?.()
  }, [])

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
    homeLocation: prefs.homeLocation ?? null,
    workLocation: prefs.workLocation ?? null,
    severeMode: prefs.severeMode,
    stormMode: prefs.stormMode,
    notifyAlerts: prefs.notifyAlerts,
    quietHoursEnabled: prefs.quietHoursEnabled,
    quietStart: prefs.quietStart,
    quietEnd: prefs.quietEnd,
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
    setQuietHours,
    toggleFavorite,
    isFavorite,
    setHomeLocation,
    isHome,
    goHome,
    setWorkLocation,
    isWork,
    goWork,
    loadForLocation,
    requestMyLocation,
    /** @deprecated use requestMyLocation */
    useMyLocation: requestMyLocation,
    syncNow,
    clearError,
    refresh: () => location && loadForLocation(location, { soft: !!weather }),
  }
}
