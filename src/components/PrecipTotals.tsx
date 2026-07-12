import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { formatPrecip, parseWeatherLocal } from '../utils/format'
import { todayDailyIndex } from '../utils/weatherStory'

interface Props {
  weather: WeatherData
  units: Units
}

/** Past ~24h rain + today expected + next 24h — classic complete-app totals */
export function PrecipTotals({ weather, units }: Props) {
  const h = weather.hourly
  const tz = weather.timezone
  const now = Date.now()
  let past24 = 0
  let next24 = 0
  for (let i = 0; i < h.time.length; i++) {
    const ms = parseWeatherLocal(h.time[i], tz)
    const mm = h.precipitation[i] ?? 0
    if (ms >= now - 24 * 3600_000 && ms < now) past24 += mm
    if (ms >= now && ms < now + 24 * 3600_000) next24 += mm
  }

  const ti = todayDailyIndex(weather)
  const today = weather.daily.precipitation_sum[ti] ?? 0
  const tomorrow = weather.daily.precipitation_sum[ti + 1] ?? 0
  const snowToday = weather.daily.snowfall_sum[ti] ?? 0

  return (
    <section className="panel precip-totals" aria-label="Precipitation totals">
      <div className="panel-header">
        <h2>Precipitation totals</h2>
      </div>
      <div className="precip-total-grid">
        <div>
          <span className="label">Past 24h</span>
          <strong>{formatPrecip(past24, units)}</strong>
        </div>
        <div>
          <span className="label">Today (forecast)</span>
          <strong>{formatPrecip(today, units)}</strong>
        </div>
        <div>
          <span className="label">Next 24h</span>
          <strong>{formatPrecip(next24, units)}</strong>
        </div>
        <div>
          <span className="label">Tomorrow</span>
          <strong>{formatPrecip(tomorrow, units)}</strong>
        </div>
      </div>
      {snowToday > 0 && (
        <p className="snow-total-note">Snow today: ~{snowToday.toFixed(1)} cm</p>
      )}
    </section>
  )
}
