import { useEffect, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { AirQualityData, LocationResult, WeatherData } from '../api/types'
import { HomeMapMarker } from './HomeMapMarker'
import { fetchFiresNear, type FireHotspot } from '../api/fires'
import {
  fetchSmokeGrid,
  pm25Color,
  pm25Radius,
  type SmokePoint,
} from '../api/airGrid'
import { fireSmokeRisk } from '../utils/fireRisk'

interface Props {
  lat: number
  lon: number
  placeName: string
  weather: WeatherData
  air: AirQualityData | null
  homeLocation?: LocationResult | null
}

function MapFix() {
  const map = useMap()
  useEffect(() => {
    const fix = () => {
      try {
        map.invalidateSize({ animate: false })
      } catch {
        /* torn down */
      }
    }
    fix()
    const t1 = window.setTimeout(fix, 100)
    const t2 = window.setTimeout(fix, 400)
    window.addEventListener('resize', fix)
    const el = map.getContainer()
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => fix())
        : null
    ro?.observe(el)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.removeEventListener('resize', fix)
      ro?.disconnect()
    }
  }, [map])
  return null
}

function Recenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lon], map.getZoom())
  }, [lat, lon, map])
  return null
}

/** Dedicated fire & smoke map (NASA FIRMS + PM2.5 grid) */
export function FireMapPanel({
  lat,
  lon,
  placeName,
  weather,
  air,
  homeLocation = null,
}: Props) {
  const [fires, setFires] = useState<FireHotspot[]>([])
  const [smoke, setSmoke] = useState<SmokePoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showSmoke, setShowSmoke] = useState(true)
  const [showFires, setShowFires] = useState(true)
  const risk = fireSmokeRisk(weather, air)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      const errs: string[] = []
      try {
        const [f, s] = await Promise.all([
          fetchFiresNear(lat, lon, 3.5, 100).catch((e: Error) => {
            errs.push(`Fires: ${e.message}`)
            return [] as FireHotspot[]
          }),
          fetchSmokeGrid(lat, lon, 3.2, 6).catch((e: Error) => {
            errs.push(`Smoke: ${e.message}`)
            return [] as SmokePoint[]
          }),
        ])
        if (cancelled) return
        setFires(f)
        setSmoke(s)
        setError(errs.length ? errs.join(' · ') : null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    const id = window.setInterval(() => void load(), 15 * 60 * 1000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [lat, lon])

  const refresh = () => {
    setLoading(true)
    setError(null)
    void Promise.all([
      fetchFiresNear(lat, lon, 3.5, 100).catch(() => [] as FireHotspot[]),
      fetchSmokeGrid(lat, lon, 3.2, 6).catch(() => [] as SmokePoint[]),
    ])
      .then(([f, s]) => {
        setFires(f)
        setSmoke(s)
        if (!f.length && !s.length) setError('Could not load fire or smoke data')
      })
      .finally(() => setLoading(false))
  }

  return (
    <section className={`panel fire-map-panel fire-${risk.fireLevel}`}>
      <div className="panel-header">
        <h2>🔥 Fire & smoke map</h2>
        <div className="fire-map-actions">
          <label className="toggle compact-toggle">
            <input
              type="checkbox"
              checked={showFires}
              onChange={(e) => setShowFires(e.target.checked)}
            />
            Fires
          </label>
          <label className="toggle compact-toggle">
            <input
              type="checkbox"
              checked={showSmoke}
              onChange={(e) => setShowSmoke(e.target.checked)}
            />
            Smoke
          </label>
          <button type="button" className="chip-btn" disabled={loading} onClick={refresh}>
            ↻
          </button>
        </div>
      </div>
      <p className="fire-map-lead">
        Hotspots near <strong>{placeName}</strong> (NASA FIRMS 24h) + PM2.5 haze grid ·
        fire-weather {risk.fireLabel.toLowerCase()} · air {risk.smokeLevel}
      </p>
      <div className="fire-map-stage">
        <MapContainer
          key={`fire-${lat.toFixed(2)}-${lon.toFixed(2)}`}
          center={[lat, lon]}
          zoom={7}
          className="fire-map"
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%', minHeight: 260 }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution="&copy; OSM &copy; CARTO"
            maxZoom={18}
          />
          <MapFix />
          <Recenter lat={lat} lon={lon} />

          {showSmoke &&
            smoke.map((p, i) => (
              <CircleMarker
                key={`sm-${i}-${p.lat.toFixed(3)}`}
                center={[p.lat, p.lon]}
                radius={pm25Radius(p.pm25, 7)}
                pathOptions={{
                  color: 'transparent',
                  weight: 0,
                  fillColor: pm25Color(p.pm25),
                  fillOpacity: Math.min(0.8, 0.3 + p.pm25 / 100),
                }}
              >
                <Popup>
                  💨 PM2.5 {Math.round(p.pm25)} µg/m³
                  {p.aqi != null ? ` · AQI ${p.aqi}` : ''}
                </Popup>
              </CircleMarker>
            ))}

          <HomeMapMarker home={homeLocation} />

          <CircleMarker
            center={[lat, lon]}
            radius={7}
            pathOptions={{
              color: '#fff',
              fillColor: '#38bdf8',
              fillOpacity: 1,
              weight: 2,
            }}
          >
            <Popup>You · {placeName}</Popup>
          </CircleMarker>

          {showFires &&
            fires.map((f, i) => (
              <CircleMarker
                key={`f-${f.lat}-${f.lon}-${i}`}
                center={[f.lat, f.lon]}
                radius={Math.min(14, 5 + Math.sqrt(Math.max(f.frp, 1)) * 0.7)}
                pathOptions={{
                  color: '#fff7ed',
                  weight: 1,
                  fillColor:
                    f.frp > 50 ? '#ef4444' : f.frp > 15 ? '#f97316' : '#fbbf24',
                  fillOpacity: 0.92,
                }}
              >
                <Popup>
                  🔥 {f.sat} · FRP {f.frp.toFixed(1)} MW
                  <br />
                  {f.acq || 'Last 24h'}
                </Popup>
              </CircleMarker>
            ))}
        </MapContainer>
        {loading && (
          <div className="fire-map-loading">
            <div className="spinner" /> Loading fire & smoke…
          </div>
        )}
      </div>
      {error && (
        <p className="banner error" role="alert">
          {error}
        </p>
      )}
      <div className="fire-map-stats">
        <span>
          <strong>{fires.length}</strong> fire hotspot{fires.length === 1 ? '' : 's'}
        </span>
        <span>
          <strong>{smoke.length}</strong> smoke sample{smoke.length === 1 ? '' : 's'}
        </span>
        <span>
          Smoke risk:{' '}
          <strong style={{ color: risk.smokeColor }}>{risk.smokeLevel}</strong>
        </span>
      </div>
      <div className="map-layer-legend">
        <span className="legend-smoke">
          Smoke: green clean → yellow → orange → red hazardous
        </span>
        <span className="legend-fire">Fires: yellow weak → red intense</span>
      </div>
      <p className="model-note">
        Hotspots are satellite detections — not all are wildfires. PM2.5 from Open-Meteo.
        Follow official fire agencies.
      </p>
    </section>
  )
}
