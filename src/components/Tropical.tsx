import type { TropicalStorm } from '../api/types'

interface Props {
  storms: TropicalStorm[]
  onFocus?: (lat: number, lon: number, name: string) => void
}

export function Tropical({ storms, onFocus }: Props) {
  return (
    <section className="panel tropical-panel">
      <div className="panel-header">
        <h2>🌀 Tropical</h2>
        <span className="panel-hint">
          {storms.length ? `${storms.length} active` : 'Quiet'}
        </span>
      </div>
      {!storms.length ? (
        <p className="muted-center">
          No active tropical cyclones reported (NHC / NWS). Basin can stay quiet for long
          stretches.
        </p>
      ) : (
        <ul className="storm-list">
          {storms.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="storm-card"
                onClick={() => onFocus?.(s.lat, s.lon, s.name)}
              >
                <div className="storm-top">
                  <strong>{s.name}</strong>
                  <span className="storm-class">{s.classification}</span>
                </div>
                {s.intensity && <p className="storm-meta">Intensity: {s.intensity}</p>}
                {s.movement && <p className="storm-meta">Movement: {s.movement}</p>}
                {s.headline && <p className="storm-headline">{s.headline}</p>}
                <p className="storm-coords">
                  {s.lat.toFixed(1)}°, {s.lon.toFixed(1)}° · tap to open on map
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
