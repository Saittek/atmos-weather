/**
 * Persistent home pin on Leaflet maps (exact home location).
 */
import { useMemo } from 'react'
import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import type { LocationResult } from '../api/types'

interface Props {
  home: LocationResult | null | undefined
}

const homeIcon = L.divIcon({
  className: 'home-map-marker',
  html: '<div class="home-map-marker-inner" aria-hidden="true">🏠</div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -16],
})

export function HomeMapMarker({ home }: Props) {
  const position = useMemo(() => {
    if (!home) return null
    const lat = Number(home.latitude)
    const lon = Number(home.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
    return [lat, lon] as [number, number]
  }, [home])

  if (!position || !home) return null

  return (
    <Marker position={position} icon={homeIcon} zIndexOffset={800}>
      <Popup>
        <strong>🏠 Home</strong>
        <br />
        {home.name || 'Home'}
        <br />
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.85em' }}>
          {home.latitude.toFixed(5)}, {home.longitude.toFixed(5)}
        </span>
      </Popup>
    </Marker>
  )
}
