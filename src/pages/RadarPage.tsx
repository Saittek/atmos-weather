import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { reverseGeocode } from '../api/weather'
import type { LocationResult } from '../api/types'
import type { Units } from '../utils/format'
import { useI18n } from '../i18n/I18nProvider'
import { ModePageShell } from '../components/ModePageShell'

const RadarMap = lazy(() =>
  import('../components/RadarMap').then((m) => ({ default: m.RadarMap })),
)

function readStoredPrefs(): {
  lastLocation: LocationResult | null
  homeLocation: LocationResult | null
  units: Units
} {
  try {
    const raw = localStorage.getItem('atmos-weather-prefs-v2')
    if (!raw) return { lastLocation: null, homeLocation: null, units: 'imperial' }
    const p = JSON.parse(raw) as {
      lastLocation?: LocationResult
      homeLocation?: LocationResult | null
      units?: Units
    }
    return {
      lastLocation: p.lastLocation ?? null,
      homeLocation: p.homeLocation ?? null,
      units: p.units === 'metric' ? 'metric' : 'imperial',
    }
  } catch {
    return { lastLocation: null, homeLocation: null, units: 'imperial' }
  }
}

function placeFromParams(params: URLSearchParams): LocationResult | null {
  const lat = parseFloat(params.get('lat') ?? '')
  const lon = parseFloat(params.get('lon') ?? '')
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null
  return {
    id: 0,
    name: params.get('name') || `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
    latitude: lat,
    longitude: lon,
  }
}

const FALLBACK: LocationResult = {
  id: 0,
  name: 'United States',
  latitude: 39.5,
  longitude: -98.35,
}

/**
 * Full-viewport radar experience at /radar
 * Query: ?lat=&lon=&name=&units=
 */
export default function RadarPage() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const stored = useMemo(() => readStoredPrefs(), [])
  const [place, setPlace] = useState<LocationResult>(() => {
    return placeFromParams(params) ?? stored.lastLocation ?? FALLBACK
  })
  const homeLocation = stored.homeLocation

  const units: Units =
    params.get('units') === 'metric'
      ? 'metric'
      : params.get('units') === 'imperial'
        ? 'imperial'
        : stored.units

  useEffect(() => {
    const next = placeFromParams(params)
    if (next) {
      setPlace((prev) => {
        if (
          prev.latitude === next.latitude &&
          prev.longitude === next.longitude &&
          prev.name === next.name
        ) {
          return prev
        }
        return next
      })
      return
    }
    const s = readStoredPrefs()
    if (s.lastLocation) setPlace(s.lastLocation)
  }, [params])

  useEffect(() => {
    const lat = parseFloat(params.get('lat') ?? '')
    const lon = parseFloat(params.get('lon') ?? '')
    if (Number.isNaN(lat) || Number.isNaN(lon)) return
    if (params.get('name')) return
    let cancelled = false
    void reverseGeocode(lat, lon)
      .then((loc) => {
        if (!cancelled) setPlace(loc)
      })
      .catch(() => {
        /* keep coordinate label */
      })
    return () => {
      cancelled = true
    }
  }, [params])

  const backQuery = useMemo(() => {
    const q = new URLSearchParams()
    q.set('lat', place.latitude.toFixed(4))
    q.set('lon', place.longitude.toFixed(4))
    q.set('name', place.name)
    return `/?${q.toString()}`
  }, [place])

  return (
    <ModePageShell
      mode="radar"
      title={t('page.radar')}
      subtitle={place.name}
      emoji="📡"
      backTo={backQuery}
      backLabel={t('page.back')}
      fullViewport
      className="radar-page"
    >
      <Suspense
        fallback={
          <div className="map-chunk-fallback radar-page-fallback mode-page-loading" role="status">
            <div className="spinner large" />
            <span>Loading radar…</span>
          </div>
        }
      >
        <RadarMap
          lat={place.latitude}
          lon={place.longitude}
          placeName={place.name}
          units={units}
          severeMode
          chaserOverlays
          mapId="radar-page-map"
          pageMode
          homeLocation={homeLocation}
        />
      </Suspense>
    </ModePageShell>
  )
}
