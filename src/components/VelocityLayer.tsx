/**
 * Nearest-site NEXRAD velocity overlay (IEM RIDGE N0S / N0U).
 * Uses a dedicated high Leaflet pane so it sits above reflectivity loops.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Circle, CircleMarker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import {
  nearestNexrad,
  velocityTileUrl,
  type VelocityProduct,
  type NexradSite,
} from '../api/severeLayers'

interface Props {
  lat: number
  lon: number
  enabled: boolean
  /** Called when nearest site / product changes (for legend + auto-zoom) */
  onStatus?: (s: {
    site: NexradSite | null
    km: number | null
    product: VelocityProduct
  }) => void
}

const PANE = 'solara-velocity'
const RANGE_KM = 230

export function VelocityLayer({ lat, lon, enabled, onStatus }: Props) {
  const map = useMap()
  const layerRef = useRef<L.TileLayer | null>(null)
  const [product, setProduct] = useState<VelocityProduct>('n0s')
  const nearest = useMemo(
    () => (enabled ? nearestNexrad(lat, lon, 450) : null),
    [lat, lon, enabled],
  )
  const site = nearest?.site ?? null
  const km = nearest?.km ?? null

  // Dedicated pane above radar tiles / under popups
  useEffect(() => {
    if (!map.getPane(PANE)) {
      const pane = map.createPane(PANE)
      pane.style.zIndex = '450'
      pane.style.pointerEvents = 'none'
    }
  }, [map])

  useEffect(() => {
    onStatus?.({ site, km, product })
  }, [site, km, product, onStatus])

  // Tile layer — do NOT remount on every tileerror (that was the bug)
  useEffect(() => {
    if (!enabled || !site) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
      return
    }

    const url = velocityTileUrl(site.id, product)
    if (layerRef.current) {
      map.removeLayer(layerRef.current)
      layerRef.current = null
    }

    const layer = L.tileLayer(url, {
      pane: PANE,
      opacity: 0.88,
      zIndex: 450,
      maxZoom: 12,
      maxNativeZoom: 9,
      minZoom: 4,
      className: 'radar-velocity-tiles',
      attribution: 'Velocity © IEM / NWS NEXRAD',
      // Empty off-site tiles are normal — never thrash product on tileerror
      errorTileUrl:
        'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 1,
    })
    layer.addTo(map)
    layerRef.current = layer

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
    }
  }, [map, enabled, site?.id, product, site])

  // Auto-zoom toward the site once when velocity turns on
  const didFly = useRef<string | null>(null)
  useEffect(() => {
    if (!enabled || !site) {
      didFly.current = null
      return
    }
    const key = site.id
    if (didFly.current === key) return
    didFly.current = key
    const z = map.getZoom()
    map.flyTo([site.lat, site.lon], Math.max(z, 7), { duration: 0.7 })
  }, [enabled, site, map])

  if (!enabled || !site) return null

  return (
    <>
      <Circle
        center={[site.lat, site.lon]}
        radius={RANGE_KM * 1000}
        pathOptions={{
          color: '#22d3ee',
          weight: 1.5,
          dashArray: '6 6',
          fillColor: '#22d3ee',
          fillOpacity: 0.04,
          opacity: 0.7,
        }}
      />
      <CircleMarker
        center={[site.lat, site.lon]}
        radius={6}
        pathOptions={{
          color: '#0f172a',
          weight: 2,
          fillColor: '#22d3ee',
          fillOpacity: 1,
        }}
      >
        <Popup>
          <strong>NEXRAD {site.id}</strong>
          <br />
          {site.name}
          <br />
          {km != null ? `${Math.round(km)} km from view center` : null}
          <br />
          Product: {product === 'n0s' ? 'Storm-relative (N0S)' : 'Base velocity (N0U)'}
          <br />
          <button
            type="button"
            className="chip-btn"
            style={{ marginTop: 6 }}
            onClick={() => setProduct((p) => (p === 'n0s' ? 'n0u' : 'n0s'))}
          >
            Switch to {product === 'n0s' ? 'base vel' : 'SRM'}
          </button>
          <br />
          <small>
            Red/green couplets can indicate rotation. Clear air = little/no velocity paint.
          </small>
        </Popup>
      </CircleMarker>
    </>
  )
}
