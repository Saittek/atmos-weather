import type { AirQualityData, WeatherData } from '../api/types'
import { aqiLabel } from '../utils/weatherCodes'
import { willIGetWet } from '../utils/wetSummary'

interface Props {
  weather: WeatherData
  air: AirQualityData | null
}

function aqiColor(aqi: number): string {
  if (aqi <= 50) return '#4ade80'
  if (aqi <= 100) return '#facc15'
  if (aqi <= 150) return '#fb923c'
  if (aqi <= 200) return '#f87171'
  return '#c026d3'
}

/** Action-focused outdoor air + wetness strip */
export function OutdoorAirStrip({ weather, air }: Props) {
  const wet = willIGetWet(weather)
  const aqi = air?.current?.us_aqi
  const pm = air?.current?.pm2_5
  const uv = weather.hourly.uv_index
  const nowUv = (() => {
    // first upcoming hour uv
    return uv?.[0] ?? weather.daily.uv_index_max?.[0] ?? 0
  })()

  let action = 'Fine for outdoor time'
  if (aqi != null && aqi >= 150) action = 'Limit outdoor exertion — air is unhealthy'
  else if (aqi != null && aqi >= 100) action = 'Sensitive groups: shorter outdoor sessions'
  else if (wet.umbrella) action = 'Outdoor OK with rain gear'
  else if (nowUv >= 7) action = 'Great outdoors — high UV, cover up midday'

  return (
    <section className="panel outdoor-air-strip">
      <div className="panel-header">
        <h2>🌿 Outdoor readiness</h2>
      </div>
      <p className="outdoor-action">{action}</p>
      <div className="outdoor-metrics">
        <div>
          <span className="label">Air</span>
          <strong style={{ color: aqi != null ? aqiColor(aqi) : undefined }}>
            {aqi != null ? `AQI ${aqi}` : '—'}
          </strong>
          <span className="muted">{aqi != null ? aqiLabel(aqi).label : 'No data'}</span>
        </div>
        <div>
          <span className="label">PM2.5</span>
          <strong>{pm != null ? `${Math.round(pm)}` : '—'}</strong>
          <span className="muted">µg/m³</span>
        </div>
        <div>
          <span className="label">Wet?</span>
          <strong className={`wet-${wet.level}`}>{wet.level === 'dry' ? 'Dry' : wet.level === 'wet' ? 'Wet' : 'Maybe'}</strong>
          <span className="muted">{wet.umbrella ? 'Umbrella' : 'Optional'}</span>
        </div>
      </div>
    </section>
  )
}
