/**
 * Zoomable light-pollution (Bortle) world map with location pin.
 * Equirectangular webp overlay on Leaflet — pinch/scroll zoom + pan.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  MapContainer,
  ImageOverlay,
  CircleMarker,
  Popup,
  useMap,
  ZoomControl,
} from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface Props {
  lat: number
  lon: number
  placeName: string
  /** Bortle class 1–9 when known */
  bortleClass?: number | null
}

const WORLD_BOUNDS: LatLngBoundsExpression = [
  [-90, -180],
  [90, 180],
]

const MAP_URL = '/data/bortle-map.webp'

function FitPin({ lat, lon, zoom }: { lat: number; lon: number; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lon], zoom, { animate: false })
  }, [lat, lon, zoom, map])
  return null
}

function MapUi({
  lat,
  lon,
  onZoom,
}: {
  lat: number
  lon: number
  onZoom: (z: number) => void
}) {
  const map = useMap()

  useEffect(() => {
    const sync = () => onZoom(map.getZoom())
    map.on('zoomend', sync)
    sync()
    return () => {
      map.off('zoomend', sync)
    }
  }, [map, onZoom])

  const zoomIn = () => map.zoomIn()
  const zoomOut = () => map.zoomOut()
  const recenter = () => map.setView([lat, lon], Math.max(map.getZoom(), 5), { animate: true })

  return (
    <div className="sg-bortle-controls" aria-label="Map controls">
      <button type="button" className="chip-btn" onClick={zoomIn} title="Zoom in">
        +
      </button>
      <button type="button" className="chip-btn" onClick={zoomOut} title="Zoom out">
        −
      </button>
      <button type="button" className="chip-btn" onClick={recenter} title="Center on place">
        ◎
      </button>
    </div>
  )
}

export function StargazeBortleMap({ lat, lon, placeName, bortleClass }: Props) {
  const [zoom, setZoom] = useState(5)
  const onZoom = useCallback((z: number) => setZoom(z), [])

  return (
    <div className="sg-bortle-map-interactive" aria-label={`Light pollution map near ${placeName}`}>
      <MapContainer
        center={[lat, lon]}
        zoom={5}
        minZoom={1}
        maxZoom={9}
        maxBounds={WORLD_BOUNDS}
        maxBoundsViscosity={0.85}
        scrollWheelZoom
        doubleClickZoom
        dragging
        touchZoom
        zoomControl={false}
        attributionControl={false}
        className="sg-bortle-map-leaflet"
        worldCopyJump={false}
      >
        {/* Dark basemap under pollution layer for coast context when zoomed */}
        <ImageOverlay
          url={MAP_URL}
          bounds={WORLD_BOUNDS}
          opacity={1}
          zIndex={100}
          className="sg-bortle-overlay"
        />
        <CircleMarker
          center={[lat, lon]}
          radius={9}
          pathOptions={{
            color: '#fef08a',
            fillColor: '#facc15',
            fillOpacity: 0.95,
            weight: 2,
          }}
        >
          <Popup>
            <strong>{placeName}</strong>
            <br />
            {bortleClass != null ? `Bortle ~${bortleClass}` : 'Your pin'}
            <br />
            {lat.toFixed(3)}, {lon.toFixed(3)}
          </Popup>
        </CircleMarker>
        <FitPin lat={lat} lon={lon} zoom={5} />
        <ZoomControl position="bottomright" />
        <MapUi lat={lat} lon={lon} onZoom={onZoom} />
      </MapContainer>
      <p className="sg-cloud-map-cap">
        Pinch or scroll to zoom · drag to pan · yellow pin is you
        {bortleClass != null ? ` · Bortle ~${bortleClass}` : ''} · zoom {zoom}
      </p>
    </div>
  )
}
