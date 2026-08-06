/**
 * Compact live radar/cloud map for Stargaze desk.
 */
import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { fetchRainViewerMaps, primaryTileUrl, rainViewerFrames } from '../api/radar'

interface Props {
  lat: number
  lon: number
  placeName: string
}

function Recenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lon], map.getZoom(), { animate: false })
  }, [lat, lon, map])
  return null
}

export function StargazeCloudMap({ lat, lon, placeName }: Props) {
  const [tile, setTile] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const maps = await fetchRainViewerMaps()
        if (cancelled) return
        const frames = rainViewerFrames(maps, 8)
        const last = frames[frames.length - 1] ?? null
        const url = primaryTileUrl('global_loop', last, maps?.host)
        if (url) setTile(url)
        else setErr('No radar frames')
      } catch {
        if (!cancelled) setErr('Radar unavailable')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="sg-cloud-map" aria-label={`Cloud radar near ${placeName}`}>
      <MapContainer
        center={[lat, lon]}
        zoom={6}
        scrollWheelZoom={false}
        dragging
        zoomControl={false}
        attributionControl={false}
        className="sg-cloud-map-inner"
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution="© OSM © CARTO"
        />
        {tile && (
          <TileLayer url={tile} opacity={0.72} zIndex={200} />
        )}
        <CircleMarker
          center={[lat, lon]}
          radius={8}
          pathOptions={{
            color: '#a5b4fc',
            fillColor: '#818cf8',
            fillOpacity: 0.9,
            weight: 2,
          }}
        />
        <Recenter lat={lat} lon={lon} />
      </MapContainer>
      <p className="sg-cloud-map-cap">
        Live radar loop near you {err ? `· ${err}` : '· darker = heavier precip/cloud echo'}
      </p>
    </div>
  )
}
