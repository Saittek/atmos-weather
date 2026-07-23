/**
 * Horizontal hourly strip — Apple / AccuWeather style:
 * time · icon · temp · precip bar · PoP · light wind when elevated
 */
import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import {
  convertTemp,
  formatHour,
  formatPrecipAmount,
  formatSpeed,
  formatTemp,
  hasPrecipMm,
  parseWeatherLocal,
} from '../utils/format'
import { isSunUpAt } from '../utils/daylight'
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
  const mobile =
    typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches
  // Competitors typically show 24–48h scroll
  const count = mobile ? 24 : 48
  const items = Array.from({ length: count }, (_, i) => i + idx).filter(
    (i) => i < hourly.time.length,
  )

  const temps = items.map((i) => convertTemp(hourly.temperature_2m[i], units))
  const minT = Math.min(...temps)
  const maxT = Math.max(...temps)
  const range = Math.max(maxT - minT, 1)
  const maxPrecip = Math.max(
    0.3,
    ...items.map((i) => hourly.precipitation[i] ?? 0),
  )

  const endIso = items.length ? hourly.time[items[items.length - 1]] : null

  return (
    <section className="panel hourly-panel">
      <div className="panel-header">
        <h2>Hourly</h2>
        <span className="panel-hint">
          {endIso
            ? `${hourLabel(hourly.time[idx], timezone, true)} → ${hourLabel(endIso, timezone, false)}`
            : 'Scroll →'}
        </span>
      </div>
      <div className="hourly-scroll" role="list">
        {items.map((i) => {
          const t = hourly.temperature_2m[i]
          const code = hourly.weather_code[i]
          const hourMs = parseWeatherLocal(hourly.time[i], timezone)
          const isDay = isSunUpAt(weather, hourMs)
          const info = getWeatherInfo(code, isDay)
          const pop = hourly.precipitation_probability[i] ?? 0
          const precip = hourly.precipitation[i] ?? 0
          const gust = hourly.wind_gusts_10m[i] ?? 0
          const feel = hourly.apparent_temperature[i]
          const tempN = convertTemp(t, units)
          const barH = 16 + ((tempN - minT) / range) * 44
          const precipH = hasPrecipMm(precip)
            ? Math.max(4, Math.round((precip / maxPrecip) * 28))
            : 0
          const wet = pop >= 30 || hasPrecipMm(precip)

          return (
            <div
              className={`hourly-card ${wet ? 'is-wet' : ''} ${i === idx ? 'is-now' : ''}`}
              key={hourly.time[i]}
              role="listitem"
              title={`${hourLabel(hourly.time[i], timezone, i === idx)}: ${formatTemp(t, units)} (feels ${formatTemp(feel, units)}) · ${info.label}${pop ? ` · ${pop}%` : ''}${hasPrecipMm(precip) ? ` · ${formatPrecipAmount(precip, units)}` : ''}${gust >= 40 ? ` · gusts ${formatSpeed(gust, units)}` : ''}`}
            >
              <span className="h-time">
                {hourLabel(hourly.time[i], timezone, i === idx)}
              </span>
              <span className="h-icon" title={info.description}>
                <WeatherIcon3D code={code} isDay={isDay} size="sm" forceAnimate />
              </span>
              <span className="h-temp">{formatTemp(t, units)}</span>
              <div className="h-temp-track" aria-hidden>
                <div className="h-bar" style={{ height: `${barH}px` }} />
              </div>
              <div className="h-precip-col" aria-hidden>
                {precipH > 0 ? (
                  <div className="h-precip-bar" style={{ height: `${precipH}px` }} />
                ) : (
                  <div className="h-precip-empty" />
                )}
              </div>
              <span className={`h-pop ${pop >= 30 ? 'wet' : ''}`}>
                {pop > 0 ? `${Math.round(pop)}%` : '—'}
              </span>
              {gust >= 45 ? (
                <span className="h-wind">{formatSpeed(gust, units)}</span>
              ) : (
                <span className="h-wind muted">
                  {hasPrecipMm(precip) ? formatPrecipAmount(precip, units) : ''}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <p className="hourly-legend">
        <span>Temp bars</span>
        <span className="hourly-legend-rain">Rain amount</span>
        <span>% chance</span>
      </p>
    </section>
  )
}
