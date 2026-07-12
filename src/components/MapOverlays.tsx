import { useEffect, useState } from 'react'
import { CircleMarker, Popup, useMap } from 'react-leaflet'
import { fetchWeatherGrid } from '../api/weather'
import type { GridPoint } from '../api/types'
import type { Units } from '../utils/format'
import { convertSpeed, convertTemp, formatSpeed, formatTemp } from '../utils/format'

export type OverlayMode = 'none' | 'temp' | 'wind' | 'clouds' | 'precip'

interface Props {
  lat: number
  lon: number
  mode: OverlayMode
  units: Units
  enabled: boolean
}

function tempColor(c: number): string {
  // celsius scale
  if (c <= -10) return '#312e81'
  if (c <= 0) return '#2563eb'
  if (c <= 10) return '#22d3ee'
  if (c <= 18) return '#4ade80'
  if (c <= 26) return '#facc15'
  if (c <= 32) return '#f97316'
  return '#ef4444'
}

function windColor(kmh: number): string {
  if (kmh < 10) return '#86efac'
  if (kmh < 20) return '#4ade80'
  if (kmh < 35) return '#facc15'
  if (kmh < 50) return '#f97316'
  return '#ef4444'
}

function cloudColor(pct: number): string {
  const a = 0.15 + (pct / 100) * 0.55
  return `rgba(226,232,240,${a})`
}

function precipColor(mm: number): string {
  if (mm <= 0) return 'transparent'
  if (mm < 0.5) return 'rgba(56,189,248,0.45)'
  if (mm < 2) return 'rgba(37,99,235,0.55)'
  if (mm < 5) return 'rgba(29,78,216,0.65)'
  return 'rgba(126,34,206,0.7)'
}

function GridLayer({
  points,
  mode,
  units,
}: {
  points: GridPoint[]
  mode: OverlayMode
  units: Units
}) {
  if (mode === 'none' || !points.length) return null

  return (
    <>
      {points.map((p) => {
        let color = '#fff'
        let radius = 14
        let label = ''

        if (mode === 'temp') {
          color = tempColor(p.temperature_2m)
          label = formatTemp(p.temperature_2m, units)
          radius = 16
        } else if (mode === 'wind') {
          color = windColor(p.wind_speed_10m)
          label = formatSpeed(p.wind_speed_10m, units)
          radius = 12 + Math.min(10, p.wind_speed_10m / 5)
        } else if (mode === 'clouds') {
          color = cloudColor(p.cloud_cover)
          label = `${Math.round(p.cloud_cover)}% cloud`
          radius = 18
        } else if (mode === 'precip') {
          color = precipColor(p.precipitation)
          label =
            p.precipitation > 0
              ? `${p.precipitation.toFixed(1)} mm`
              : 'Dry'
          radius = p.precipitation > 0 ? 14 + p.precipitation * 2 : 8
        }

        if (mode === 'precip' && p.precipitation <= 0) return null

        return (
          <CircleMarker
            key={`${p.lat}-${p.lon}-${mode}`}
            center={[p.lat, p.lon]}
            radius={radius}
            pathOptions={{
              color: mode === 'clouds' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)',
              weight: 1,
              fillColor: color,
              fillOpacity: mode === 'clouds' ? 0.85 : 0.72,
            }}
          >
            <Popup>
              <strong>{label}</strong>
              <br />
              {formatTemp(p.temperature_2m, units)} · {formatSpeed(p.wind_speed_10m, units)}
              <br />
              {Math.round(p.cloud_cover)}% cloud
              {mode === 'wind' && (
                <>
                  <br />
                  Dir {Math.round(p.wind_direction_10m)}° ·{' '}
                  {Math.round(convertSpeed(p.wind_speed_10m, units))}{' '}
                  {units === 'metric' ? 'km/h' : 'mph'}
                </>
              )}
              {mode === 'temp' && (
                <>
                  <br />
                  {Math.round(convertTemp(p.temperature_2m, units))}° grid sample
                </>
              )}
            </Popup>
          </CircleMarker>
        )
      })}
    </>
  )
}

export function MapOverlays({ lat, lon, mode, units, enabled }: Props) {
  const map = useMap()
  const [points, setPoints] = useState<GridPoint[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled || mode === 'none') {
      setPoints([])
      return
    }
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const z = map.getZoom()
        const span = z >= 8 ? 1.2 : z >= 6 ? 2.5 : 4.5
        const steps = z >= 8 ? 6 : 5
        const grid = await fetchWeatherGrid(lat, lon, span, steps)
        if (!cancelled) setPoints(grid)
      } catch {
        if (!cancelled) setPoints([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [lat, lon, mode, enabled, map])

  useEffect(() => {
    const el = map.getContainer()
    el.dataset.overlayLoading = loading ? '1' : '0'
  }, [loading, map])

  // Leaflet needs a size refresh after layout changes
  useEffect(() => {
    const t = window.setTimeout(() => map.invalidateSize(), 80)
    return () => window.clearTimeout(t)
  }, [map, mode, enabled])

  if (!enabled || mode === 'none') return null
  return <GridLayer points={points} mode={mode} units={units} />
}
