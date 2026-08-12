import type { AirQualityData } from '../api/types'
import { aqiLabel } from '../utils/weatherCodes'

interface Props {
  air: AirQualityData | null
}

export function AirQuality({ air }: Props) {
  if (!air?.current) {
    return (
      <section className="panel aqi-panel redesign-feed">
        <div className="panel-header">
          <h2>Air Quality</h2>
        </div>
        <p className="muted-center">Air quality data unavailable for this location.</p>
      </section>
    )
  }

  const aqi = air.current.us_aqi ?? air.current.european_aqi ?? 0
  const info = aqiLabel(aqi)
  const pct = Math.min(100, (aqi / 300) * 100)

  const pollutants = [
    { name: 'PM2.5', value: air.current.pm2_5, unit: 'µg/m³' },
    { name: 'PM10', value: air.current.pm10, unit: 'µg/m³' },
    { name: 'O₃', value: air.current.ozone, unit: 'µg/m³' },
    { name: 'NO₂', value: air.current.nitrogen_dioxide, unit: 'µg/m³' },
    { name: 'SO₂', value: air.current.sulphur_dioxide, unit: 'µg/m³' },
    { name: 'CO', value: air.current.carbon_monoxide, unit: 'µg/m³' },
  ]

  return (
    <section className="panel aqi-panel redesign-feed" data-aqi-level={info.label}>
      <div className="panel-header">
        <h2>Air Quality</h2>
        <span className="aqi-badge" style={{ background: info.color }}>
          {info.label}
        </span>
      </div>
      <div className="aqi-main">
        <div className="aqi-number" style={{ color: info.color }}>
          {Math.round(aqi)}
        </div>
        <div className="aqi-meta">
          <p className="aqi-scale">US AQI</p>
          <p className="aqi-advice">{info.advice}</p>
          <div className="aqi-bar" style={{ ['--aqi-pct' as string]: `${pct}%` }}>
            <div className="aqi-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="aqi-scale-labels">
            <span>0</span>
            <span>50</span>
            <span>100</span>
            <span>150</span>
            <span>200+</span>
          </div>
        </div>
      </div>
      <div className="pollutant-grid">
        {pollutants.map((p) => (
          <div className="pollutant" key={p.name}>
            <span className="p-name">{p.name}</span>
            <span className="p-val">
              {p.value != null ? Math.round(p.value) : '—'}
              <small> {p.unit}</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
