import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { formatHour, formatTemp, convertTemp, parseWeatherLocal } from '../utils/format'
import { getWeatherInfo } from '../utils/weatherCodes'
import { WeatherIcon3D } from './WeatherIcon3D'

interface Props {
  weather: WeatherData
  units: Units
}

function hourLabel(iso: string, timezone: string, isNow: boolean): string {
  if (isNow) return 'Now'
  const ms = parseWeatherLocal(iso, timezone)
  try {
    return new Date(ms).toLocaleTimeString(undefined, {
      hour: 'numeric',
      timeZone: timezone,
    })
  } catch {
    return formatHour(iso, timezone)
  }
}

export function HourlyForecast({ weather, units }: Props) {
  const { hourly, timezone } = weather
  const now = Date.now()
  const start = hourly.time.findIndex(
    (t) => parseWeatherLocal(t, timezone) >= now - 30 * 60 * 1000,
  )
  const idx = start < 0 ? 0 : start
  const count = 48
  const items = Array.from({ length: count }, (_, i) => i + idx).filter(
    (i) => i < hourly.time.length,
  )

  const temps = items.map((i) => convertTemp(hourly.temperature_2m[i], units))
  const minT = Math.min(...temps)
  const maxT = Math.max(...temps)
  const range = Math.max(maxT - minT, 1)

  const endIso = items.length ? hourly.time[items[items.length - 1]] : null

  return (
    <section className="panel hourly-panel">
      <div className="panel-header">
        <h2>48-Hour Forecast</h2>
        <span className="panel-hint">
          {endIso
            ? `${hourLabel(hourly.time[idx], timezone, true)} → ${hourLabel(endIso, timezone, false)}`
            : 'Scroll for more →'}
        </span>
      </div>
      <div className="hourly-scroll">
        {items.map((i) => {
          const t = hourly.temperature_2m[i]
          const code = hourly.weather_code[i]
          const isDay = hourly.is_day[i] === 1
          const info = getWeatherInfo(code, isDay)
          const pop = hourly.precipitation_probability[i] ?? 0
          const tempN = convertTemp(t, units)
          const barH = 20 + ((tempN - minT) / range) * 48

          return (
            <div className="hourly-card" key={hourly.time[i]}>
              <span className="h-time">
                {hourLabel(hourly.time[i], timezone, i === idx)}
              </span>
              <span className="h-icon" title={info.description}>
                <WeatherIcon3D code={code} isDay={isDay} size="sm" forceAnimate />
              </span>
              <span className="h-temp">{formatTemp(t, units)}</span>
              <div className="h-bar-wrap" aria-hidden>
                <div className="h-bar" style={{ height: `${barH}px` }} />
              </div>
              <span className={`h-pop ${pop >= 30 ? 'wet' : ''}`}>
                {pop > 0 ? `${pop}%` : '—'}
              </span>
              <span className="h-label">rain</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
