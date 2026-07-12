import { useEffect, useState } from 'react'
import { CircleMarker, Popup, useMap } from 'react-leaflet'
import { fetchFiresNear, type FireHotspot } from '../api/fires'
import {
  fetchSmokeGrid,
  pm25Color,
  pm25Radius,
  type SmokePoint,
} from '../api/airGrid'

interface Props {
  lat: number
  lon: number
  showFires: boolean
  showSmoke: boolean
}

function frpRadius(frp: number): number {
  return Math.min(16, 5 + Math.sqrt(Math.max(frp, 1)) * 0.8)
}

function frpColor(frp: number): string {
  if (frp < 5) return '#fbbf24'
  if (frp < 30) return '#f97316'
  if (frp < 80) return '#ef4444'
  return '#a21caf'
}

export function FireSmokeLayers({ lat, lon, showFires, showSmoke }: Props) {
  const map = useMap()
  const [fires, setFires] = useState<FireHotspot[]>([])
  const [smoke, setSmoke] = useState<SmokePoint[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [zoom, setZoom] = useState(() => map.getZoom())

  useEffect(() => {
    const onZ = () => setZoom(map.getZoom())
    map.on('zoomend', onZ)
    return () => {
      map.off('zoomend', onZ)
    }
  }, [map])

  useEffect(() => {
    if (!showFires && !showSmoke) {
      setFires([])
      setSmoke([])
      setStatus(null)
      return
    }

    let cancelled = false
    const radius = zoom >= 9 ? 1.0 : zoom >= 7 ? 2.0 : zoom >= 5 ? 3.5 : 5

    ;(async () => {
      setLoading(true)
      setStatus(null)
      const errors: string[] = []

      if (showFires) {
        try {
          const f = await fetchFiresNear(lat, lon, radius, 120)
          if (!cancelled) setFires(f)
        } catch (e) {
          if (!cancelled) {
            setFires([])
            errors.push(`Fires: ${(e as Error).message}`)
          }
        }
      } else if (!cancelled) setFires([])

      if (showSmoke) {
        try {
          const steps = zoom >= 8 ? 5 : 6
          const s = await fetchSmokeGrid(lat, lon, radius * 1.8, steps)
          if (!cancelled) {
            setSmoke(s)
            if (!s.length) errors.push('Smoke: no PM2.5 samples')
          }
        } catch (e) {
          if (!cancelled) {
            setSmoke([])
            errors.push(`Smoke: ${(e as Error).message}`)
          }
        }
      } else if (!cancelled) setSmoke([])

      if (!cancelled) {
        setStatus(errors.length ? errors.join(' · ') : null)
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [lat, lon, showFires, showSmoke, zoom])

  return (
    <>
      {showSmoke &&
        smoke.map((p, i) => (
          <CircleMarker
            key={`sm-${i}-${p.lat.toFixed(3)}-${p.lon.toFixed(3)}`}
            center={[p.lat, p.lon]}
            radius={pm25Radius(p.pm25, zoom)}
            pathOptions={{
              color: 'rgba(120, 90, 50, 0.15)',
              weight: 0,
              fillColor: pm25Color(p.pm25),
              fillOpacity: Math.min(0.85, 0.35 + p.pm25 / 120),
            }}
          >
            <Popup>
              <strong>💨 Air / smoke (PM2.5)</strong>
              <br />
              {Math.round(p.pm25)} µg/m³
              {p.aqi != null ? ` · US AQI ${p.aqi}` : ''}
              <br />
              <span style={{ fontSize: 11, opacity: 0.8 }}>Open-Meteo air quality</span>
            </Popup>
          </CircleMarker>
        ))}

      {showFires &&
        fires.map((f, i) => (
          <CircleMarker
            key={`fire-${f.lat}-${f.lon}-${i}`}
            center={[f.lat, f.lon]}
            radius={frpRadius(f.frp)}
            pathOptions={{
              color: '#fff7ed',
              weight: 1.5,
              fillColor: frpColor(f.frp),
              fillOpacity: 0.92,
            }}
          >
            <Popup>
              <strong>🔥 Active fire hotspot</strong>
              <br />
              {f.sat} · FRP {f.frp.toFixed(1)} MW
              <br />
              Brightness {Math.round(f.brightness)}
              {f.acq ? (
                <>
                  <br />
                  Acquired {f.acq}
                </>
              ) : null}
              <br />
              <span style={{ fontSize: 11, opacity: 0.8 }}>NASA FIRMS 24h</span>
            </Popup>
          </CircleMarker>
        ))}

      {(status || loading) && (showFires || showSmoke) && (
        <div
          className={`map-layer-status ${status ? 'is-error' : ''}`}
          aria-live="polite"
        >
          {loading && !status ? 'Loading fire / smoke…' : status}
        </div>
      )}
    </>
  )
}
