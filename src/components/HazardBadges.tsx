import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { formatPressure, formatTemp } from '../utils/format'
import {
  currentDewPoint,
  dewPointComfort,
  hazardBadges,
  vsYesterday,
} from '../utils/coreWeather'
import { pressureTrend } from '../utils/weatherStory'

interface Props {
  weather: WeatherData
  units: Units
}

/** Hazards + vs yesterday + pressure + dew point — core situational awareness */
export function HazardBadges({ weather, units }: Props) {
  const hazards = hazardBadges(weather, units)
  const vs = vsYesterday(weather, units)
  const pressure = pressureTrend(weather)
  const dew = currentDewPoint(weather)
  const dewInfo = dew != null ? dewPointComfort(dew) : null

  return (
    <section className="panel hazard-panel" aria-label="Conditions and hazards">
      <div className="panel-header">
        <h2>Conditions & risks</h2>
      </div>

      <div className="condition-stats">
        {vs && (
          <div className="condition-stat">
            <span className="label">Vs yesterday</span>
            <strong>
              {vs.highDiff > 0 ? '+' : ''}
              {vs.highDiff}° high
            </strong>
            <span className="muted">{vs.summary}</span>
          </div>
        )}
        <div className="condition-stat">
          <span className="label">Pressure</span>
          <strong>
            {pressure.dir === 'up' ? '↑ ' : pressure.dir === 'down' ? '↓ ' : '→ '}
            {pressure.label}
          </strong>
          <span className="muted">{formatPressure(weather.current.pressure_msl, units)}</span>
        </div>
        {dew != null && dewInfo && (
          <div className="condition-stat">
            <span className="label">Dew point</span>
            <strong>{formatTemp(dew, units)}</strong>
            <span className={`muted dew-${dewInfo.level}`}>{dewInfo.label}</span>
          </div>
        )}
        <div className="condition-stat">
          <span className="label">Humidity</span>
          <strong>{weather.current.relative_humidity_2m}%</strong>
          <span className="muted">Clouds {weather.current.cloud_cover}%</span>
        </div>
      </div>

      {hazards.length > 0 ? (
        <ul className="hazard-list">
          {hazards.map((h) => (
            <li key={h.id} className={`hazard-badge level-${h.level}`}>
              <strong>{h.label}</strong>
              <span>{h.detail}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hazard-clear">No major weather risks flagged for right now.</p>
      )}
    </section>
  )
}
