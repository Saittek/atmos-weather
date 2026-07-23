import { useEffect, useState } from 'react'
import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import {
  formatDay,
  formatPrecip,
  formatSpeed,
  formatTemp,
  formatWeekday,
  convertTemp,
} from '../utils/format'
import { getWeatherInfo, windDirection } from '../utils/weatherCodes'
import { todayDailyIndex } from '../utils/weatherStory'
import { WeatherIcon3D } from './WeatherIcon3D'

interface Props {
  weather: WeatherData
  units: Units
}

export function DailyForecast({ weather, units }: Props) {
  const d = weather.daily
  const todayIdx = todayDailyIndex(weather)
  const [open, setOpen] = useState<number | null>(todayIdx)

  useEffect(() => {
    setOpen(todayIdx)
  }, [todayIdx, weather.latitude, weather.longitude])

  const temps = [...d.temperature_2m_min, ...d.temperature_2m_max].map((t) =>
    convertTemp(t, units),
  )
  const minAll = Math.min(...temps)
  const maxAll = Math.max(...temps)
  const span = Math.max(maxAll - minAll, 1)

  return (
    <section className="panel daily-panel">
      <div className="panel-header">
        <h2>14-Day Outlook</h2>
      </div>
      <ul className="daily-list">
        {d.time.map((day, i) => {
          // past_days=1 prepends yesterday — keep it, but label from calendar date
          const info = getWeatherInfo(d.weather_code[i], true)
          const lo = convertTemp(d.temperature_2m_min[i], units)
          const hi = convertTemp(d.temperature_2m_max[i], units)
          const left = ((lo - minAll) / span) * 100
          const width = Math.max(((hi - lo) / span) * 100, 6)
          const isOpen = open === i
          const pop = d.precipitation_probability_max[i] ?? 0
          const dayKey = day.slice(0, 10)
          const weekday = formatWeekday(day, weather.timezone)
          const relLabel =
            i === todayIdx
              ? 'Today'
              : i === todayIdx + 1
                ? 'Tomorrow'
                : i === todayIdx - 1
                  ? 'Yesterday'
                  : null

          return (
            <li key={dayKey || `${day}-${i}`} className={isOpen ? 'open' : ''}>
              <button
                type="button"
                className="daily-row"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
              >
                <span className="d-day" title={formatDay(day, weather.timezone)}>
                  {relLabel ?? weekday}
                  {relLabel ? (
                    <span className="d-day-sub">{weekday}</span>
                  ) : null}
                </span>
                <span className="d-icon" title={info.label}>
                  <WeatherIcon3D code={d.weather_code[i]} isDay size="sm" forceAnimate />
                </span>
                <span className={`d-pop ${pop >= 40 ? 'wet' : ''}`}>
                  {pop > 0 ? `${pop}%` : ''}
                </span>
                <span className="d-lo">{formatTemp(d.temperature_2m_min[i], units)}</span>
                <div className="temp-range" aria-hidden>
                  <div className="temp-range-track">
                    <div
                      className="temp-range-fill"
                      style={{ left: `${left}%`, width: `${width}%` }}
                    />
                  </div>
                </div>
                <span className="d-hi">{formatTemp(d.temperature_2m_max[i], units)}</span>
              </button>
              {isOpen && (
                <div className="daily-detail">
                  <div className="detail-grid mini">
                    <div>
                      <span className="label">Condition</span>
                      <span className="value">{info.description}</span>
                    </div>
                    <div>
                      <span className="label">Date</span>
                      <span className="value">{formatDay(day, weather.timezone)}</span>
                    </div>
                    <div>
                      <span className="label">Precip</span>
                      <span className="value">
                        {formatPrecip(d.precipitation_sum[i], units)}
                        {d.snowfall_sum[i] > 0 &&
                          ` · snow ${formatPrecip(d.snowfall_sum[i] * 10, units)}`}
                      </span>
                    </div>
                    <div>
                      <span className="label">Wind</span>
                      <span className="value">
                        {formatSpeed(d.wind_speed_10m_max[i], units)}{' '}
                        {windDirection(d.wind_direction_10m_dominant[i])}
                        <span className="muted">
                          {' '}
                          gust {formatSpeed(d.wind_gusts_10m_max[i], units)}
                        </span>
                      </span>
                    </div>
                    <div>
                      <span className="label">UV max</span>
                      <span className="value">{d.uv_index_max[i]?.toFixed(1) ?? '—'}</span>
                    </div>
                    <div>
                      <span className="label">Sun</span>
                      <span className="value">
                        ↑{' '}
                        {new Date(d.sunrise[i]).toLocaleTimeString(undefined, {
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: weather.timezone,
                        })}{' '}
                        · ↓{' '}
                        {new Date(d.sunset[i]).toLocaleTimeString(undefined, {
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: weather.timezone,
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
