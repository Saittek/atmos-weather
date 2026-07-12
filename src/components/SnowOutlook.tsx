import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { formatTemp } from '../utils/format'
import { todayDailyIndex } from '../utils/weatherStory'
import { getWeatherInfo } from '../utils/weatherCodes'

interface Props {
  weather: WeatherData
  units: Units
}

export function SnowOutlook({ weather, units }: Props) {
  const ti = todayDailyIndex(weather)
  const d = weather.daily
  // Look at next 5 days from today
  const days = []
  for (let i = ti; i < Math.min(d.time.length, ti + 5); i++) {
    const snow = d.snowfall_sum[i] ?? 0
    const code = d.weather_code[i]
    const wintry = snow > 0.1 || [71, 73, 75, 77, 85, 86].includes(code)
    if (wintry || snow > 0) {
      days.push({
        i,
        date: d.time[i],
        snow,
        code,
        high: d.temperature_2m_max[i],
        low: d.temperature_2m_min[i],
        pop: d.precipitation_probability_max[i] ?? 0,
      })
    }
  }

  // Also current snowfall
  const nowSnow = weather.current.snowfall > 0

  if (!days.length && !nowSnow) {
    return (
      <section className="panel snow-panel quiet">
        <div className="panel-header">
          <h2>❄️ Snow & wintry</h2>
        </div>
        <p className="muted-center">No meaningful snow signal in the next few days.</p>
      </section>
    )
  }

  return (
    <section className="panel snow-panel">
      <div className="panel-header">
        <h2>❄️ Snow & wintry weather</h2>
      </div>
      {nowSnow && (
        <p className="snow-now">Snow reported in current conditions.</p>
      )}
      <ul className="snow-list">
        {days.map((day) => {
          const info = getWeatherInfo(day.code, true)
          // Open-Meteo snowfall_sum is cm
          const cm = day.snow
          const display =
            units === 'metric'
              ? `${cm.toFixed(1)} cm`
              : `${(cm / 2.54).toFixed(1)} in`
          return (
            <li key={day.date}>
              <span className="snow-day">
                {new Date(day.date).toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  timeZone: weather.timezone,
                })}
              </span>
              <span className="snow-icon">{info.icon}</span>
              <span className="snow-amt">{cm > 0 ? display : 'Wintry mix risk'}</span>
              <span className="snow-meta">
                {formatTemp(day.low, units)}–{formatTemp(day.high, units)} · {day.pop}%
              </span>
            </li>
          )
        })}
      </ul>
      <p className="model-note">
        Snow amounts are model estimates (Open-Meteo snowfall in cm; inches when using °F).
      </p>
    </section>
  )
}
