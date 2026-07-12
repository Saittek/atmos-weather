import type { LocationSnapshot } from '../api/types'
import type { Units } from '../utils/format'
import { formatTemp } from '../utils/format'
import { WeatherIcon3D } from './WeatherIcon3D'

interface Props {
  snapshots: LocationSnapshot[]
  loading: boolean
  units: Units
  currentKey?: string
  onSelect: (lat: number, lon: number, name: string) => void
  onRefresh: () => void
}

export function HomePins({
  snapshots,
  loading,
  units,
  currentKey,
  onSelect,
  onRefresh,
}: Props) {
  if (!snapshots.length && !loading) {
    return (
      <section className="panel home-pins-panel">
        <div className="panel-header">
          <h2>🏠 Pinned places</h2>
        </div>
        <p className="muted-center">
          Star favorites to build your home strip — live temp, rain timing, and alert badges.
        </p>
      </section>
    )
  }

  return (
    <section className="panel home-pins-panel">
      <div className="panel-header">
        <h2>🏠 Pinned places</h2>
        <button type="button" className="chip-btn" onClick={onRefresh} disabled={loading}>
          {loading ? '…' : '↻'}
        </button>
      </div>
      <div className="home-pins-scroll">
        {snapshots.map((s) => {
          const key = `${s.location.latitude.toFixed(3)},${s.location.longitude.toFixed(3)}`
          const active = currentKey === key
          return (
            <button
              type="button"
              key={key}
              className={`pin-card ${active ? 'active' : ''} ${s.precipSoon ? 'rainy' : ''} ${s.hasAlert ? 'alerted' : ''}`}
              onClick={() =>
                onSelect(s.location.latitude, s.location.longitude, s.location.name)
              }
            >
              <div className="pin-top">
                <span className="pin-name">{s.location.name}</span>
                <span className="pin-icon" aria-hidden>
                  <WeatherIcon3D
                    code={s.weatherCode}
                    isDay={s.isDay}
                    size="sm"
                    forceAnimate
                  />
                </span>
              </div>
              <div className="pin-temp">{formatTemp(s.temperature, units)}</div>
              <div className="pin-meta">
                H {formatTemp(s.high, units)} · L {formatTemp(s.low, units)}
              </div>
              <div className="pin-badges">
                {s.hasAlert && <span className="pin-badge alert">Alert</span>}
                {s.precipSoon && s.rainStartsInMin != null && (
                  <span className="pin-badge rain">
                    {s.rainStartsInMin <= 5 ? 'Rain now' : `Rain ~${s.rainStartsInMin}m`}
                  </span>
                )}
                {!s.precipSoon && s.popMax6h >= 40 && (
                  <span className="pin-badge pop">{s.popMax6h}% later</span>
                )}
                {s.aqi != null && s.aqi > 100 && (
                  <span className="pin-badge aqi">AQI {Math.round(s.aqi)}</span>
                )}
              </div>
            </button>
          )
        })}
        {loading && !snapshots.length && (
          <div className="pin-card loading-pin">
            <div className="spinner" />
            <span>Loading pins…</span>
          </div>
        )}
      </div>
    </section>
  )
}
