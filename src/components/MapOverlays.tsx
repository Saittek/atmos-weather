/**
 * Model overlay — Ventusky official embed
 * https://embed.ventusky.com
 * Sized to work in the compact dashboard radar panel and on mobile.
 */

export type OverlayMode =
  | 'none'
  | 'temp'
  | 'wind'
  | 'gust'
  | 'clouds'
  | 'precip'
  | 'pressure'
  | 'cape'

/** Ventusky layer ids (parameter `l`) */
const VENTUSKY_LAYERS: Record<Exclude<OverlayMode, 'none'>, string> = {
  temp: 'temperature-2m',
  wind: 'wind-10m',
  gust: 'gust',
  clouds: 'clouds-total',
  precip: 'rain-1h',
  pressure: 'pressure',
  cape: 'cape',
}

export const OVERLAY_OPTIONS: { id: OverlayMode; label: string }[] = [
  { id: 'none', label: 'None (radar only)' },
  { id: 'temp', label: 'Temperature' },
  { id: 'wind', label: 'Wind' },
  { id: 'gust', label: 'Wind gusts' },
  { id: 'clouds', label: 'Cloud cover' },
  { id: 'precip', label: 'Precip 1h' },
  { id: 'pressure', label: 'Pressure' },
  { id: 'cape', label: 'CAPE / instability' },
]

export function ventuskyEmbedUrl(
  lat: number,
  lon: number,
  mode: Exclude<OverlayMode, 'none'>,
  zoom = 5,
  placeName?: string,
): string {
  const layer = VENTUSKY_LAYERS[mode]
  // Slightly lower zoom so the field fits small panels / phones
  const z = Math.max(3, Math.min(8, Math.round(zoom)))
  const p = `${lat.toFixed(3)};${lon.toFixed(3)};${z}`
  // Build manually so `;` in p/pin stay unescaped (Ventusky requires them)
  let url = `https://embed.ventusky.com/?p=${p}&l=${encodeURIComponent(layer)}`
  if (placeName) {
    const safe = placeName.replace(/[;|&<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28)
    if (safe) {
      url += `&pin=${lat.toFixed(3)};${lon.toFixed(3)};dot;${encodeURIComponent(safe)}`
    }
  }
  return url
}

export function ventuskyShareUrl(
  lat: number,
  lon: number,
  mode: Exclude<OverlayMode, 'none'>,
  zoom = 5,
): string {
  const layer = VENTUSKY_LAYERS[mode]
  const z = Math.max(3, Math.min(8, Math.round(zoom)))
  return `https://www.ventusky.com/?p=${lat.toFixed(3)};${lon.toFixed(3)};${z}&l=${layer}`
}

interface Props {
  lat: number
  lon: number
  mode: OverlayMode
  placeName?: string
  /** Leaflet-ish zoom 3–12 → Ventusky zoom */
  mapZoom?: number
  /** Compact panel (dashboard) vs full page */
  compact?: boolean
}

/**
 * Full-bleed Ventusky model map for the radar stage.
 * Renders nothing when mode is none.
 */
export function MapOverlays({
  lat,
  lon,
  mode,
  placeName,
  mapZoom = 5,
  compact = false,
}: Props) {
  if (mode === 'none') return null

  // Compact / mobile: pull out a bit so layers read better
  const z = compact ? Math.min(mapZoom, 5) : mapZoom
  const src = ventuskyEmbedUrl(lat, lon, mode, z, placeName)
  const share = ventuskyShareUrl(lat, lon, mode, z)
  const label = OVERLAY_OPTIONS.find((o) => o.id === mode)?.label ?? 'Ventusky'

  return (
    <div className={`ventusky-overlay ${compact ? 'is-compact' : ''}`}>
      <div className="ventusky-frame-wrap">
        <iframe
          key={src}
          title={`Ventusky ${label}`}
          src={src}
          className="ventusky-frame"
          // Do not use loading="lazy" — delayed iframes often never paint in small panels
          allow="fullscreen; accelerometer; gyroscope"
          allowFullScreen
          referrerPolicy="origin-when-cross-origin"
        />
      </div>
      <div className="ventusky-bar">
        <span className="ventusky-credit">
          <strong>{label}</strong>
          <span className="ventusky-by"> · Ventusky</span>
        </span>
        <div className="ventusky-bar-actions">
          <a
            className="chip-btn ventusky-open"
            href={share}
            target="_blank"
            rel="noreferrer"
          >
            Full map ↗
          </a>
        </div>
      </div>
    </div>
  )
}
