import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { reverseGeocode } from '../api/weather'
import type { LocationResult } from '../api/types'
import type { Units } from '../utils/format'

const RadarMap = lazy(() =>
  import('../components/RadarMap').then((m) => ({ default: m.RadarMap })),
)

function readStoredLocation(): LocationResult | null {
  try {
    const raw = localStorage.getItem('atmos-weather-prefs-v2')
    if (!raw) return null
    const p = JSON.parse(raw) as { lastLocation?: LocationResult }
    return p.lastLocation ?? null
  } catch {
    return null
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
  const [params] = useSearchParams()
  const [place, setPlace] = useState<LocationResult>(() => {
    return placeFromParams(params) ?? readStoredLocation() ?? FALLBACK
  })

  const units: Units = params.get('units') === 'metric' ? 'metric' : 'imperial'

  // Keep place in sync when navigating /radar?lat=… from dashboard links
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
    const stored = readStoredLocation()
    if (stored) setPlace(stored)
  }, [params])

  // Resolve a friendly name if only coords were provided
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
    <div className="radar-page">
      <header className="radar-page-bar">
        <Link to={backQuery} className="chip-btn">
          ← Dashboard
        </Link>
        <div className="radar-page-title">
          <strong>📡 Live Radar</strong>
          <span>{place.name}</span>
        </div>
        <div className="radar-page-actions">
          <Link to="/widget" className="chip-btn hide-sm">
            ☔ Widget
          </Link>
          <Link to="/" className="chip-btn hide-sm">
            Home
          </Link>
        </div>
      </header>
      <div className="radar-page-map">
        <Suspense
          fallback={
            <div className="map-chunk-fallback radar-page-fallback" role="status">
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
            mapId="radar-page-map"
            pageMode
          />
        </Suspense>
      </div>
    </div>
  )
}
