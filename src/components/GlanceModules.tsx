/**
 * Apple Weather / AccuWeather-style at-a-glance modules.
 * Wind · UV · Humidity · Precipitation · Sun · Pressure
 */
import { memo } from 'react'
import type { AirQualityData, WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import {
  formatDistance,
  formatPrecip,
  formatPressure,
  formatSpeed,
  formatTemp,
  formatTime,
  parseWeatherLocal,
} from '../utils/format'
import { aqiLabel, uvLabel, windDirection } from '../utils/weatherCodes'
import { todayDailyIndex } from '../utils/weatherStory'
import { willIGetWet } from '../utils/wetSummary'

interface Props {
  weather: WeatherData
  units: Units
  air?: AirQualityData | null
}

function pressureTrend(
  weather: WeatherData,
): 'Rising' | 'Falling' | 'Steady' {
  const h = weather.hourly
  const tz = weather.timezone
  const now = Date.now()
  let nowI = -1
  let laterI = -1
  for (let i = 0; i < h.time.length; i++) {
    const ms = parseWeatherLocal(h.time[i], tz)
    if (ms >= now - 45 * 60_000 && nowI < 0) nowI = i
    if (ms >= now + 3 * 3600_000 && laterI < 0) {
      laterI = i
      break
    }
  }
  if (nowI < 0 || laterI < 0) return 'Steady'
  const a = h.pressure_msl[nowI]
  const b = h.pressure_msl[laterI]
  if (a == null || b == null) return 'Steady'
  const d = b - a
  if (d > 1.2) return 'Rising'
  if (d < -1.2) return 'Falling'
  return 'Steady'
}

export const GlanceModules = memo(function GlanceModules({ weather, units, air }: Props) {
  const c = weather.current
  const h = weather.hourly
  const tz = weather.timezone
  const ti = todayDailyIndex(weather)
  const now = Date.now()
  const idx = Math.max(
    0,
    h.time.findIndex((t) => parseWeatherLocal(t, tz) >= now - 30 * 60_000),
  )
  const uv = h.uv_index[idx] ?? weather.daily.uv_index_max[ti] ?? 0
  const uvInfo = uvLabel(uv)
  const dew = h.dew_point_2m[idx] ?? c.temperature_2m - 4
  const vis = h.visibility[idx] ?? 10000
  const popMax = weather.daily.precipitation_probability_max[ti] ?? 0
  const precipSum = weather.daily.precipitation_sum[ti] ?? 0
  const wet = willIGetWet(weather)
  const trend = pressureTrend(weather)
  const sunrise = weather.daily.sunrise[ti]
  const sunset = weather.daily.sunset[ti]
  const aqi =
    air?.current?.us_aqi ?? air?.current?.european_aqi ?? null
  const aqiInfo = aqi != null ? aqiLabel(aqi) : null

  const modules = [
    {
      id: 'wind',
      title: 'Wind',
      emoji: '💨',
      value: formatSpeed(c.wind_speed_10m, units),
      sub: `${windDirection(c.wind_direction_10m)} · Gusts ${formatSpeed(c.wind_gusts_10m, units)}`,
      accent: undefined as string | undefined,
      extra: (
        <div
          className="glance-compass"
          style={{ transform: `rotate(${c.wind_direction_10m}deg)` }}
          aria-hidden
        >
          ↑
        </div>
      ),
    },
    {
      id: 'uv',
      title: 'UV Index',
      emoji: '☀️',
      value: uv < 0.5 ? '0' : uv.toFixed(0),
      sub: uvInfo.label,
      accent: uvInfo.color,
      extra: (
        <div className="glance-meter" aria-hidden>
          <div
            className="glance-meter-fill"
            style={{
              width: `${Math.min(100, (uv / 11) * 100)}%`,
              background: uvInfo.color,
            }}
          />
        </div>
      ),
    },
    {
      id: 'humidity',
      title: 'Humidity',
      emoji: '💧',
      value: `${c.relative_humidity_2m}%`,
      sub: `Dew point ${formatTemp(dew, units)}`,
      accent: undefined,
      extra: null,
    },
    {
      id: 'precip',
      title: 'Precipitation',
      emoji: wet.umbrella ? '☔' : '🌦',
      value: wet.level === 'dry' ? 'None' : wet.title.replace(/^./, (c) => c),
      sub:
        popMax > 0
          ? `${Math.round(popMax)}% today · ${formatPrecip(precipSum, units)}`
          : wet.detail.slice(0, 48),
      accent:
        wet.level === 'wet' ? '#38bdf8' : wet.level === 'maybe' ? '#fbbf24' : undefined,
      extra: null,
    },
    {
      id: 'sun',
      title: 'Sunrise · Sunset',
      emoji: '🌅',
      value: sunrise ? formatTime(sunrise, tz) : '—',
      sub: sunset ? `Sunset ${formatTime(sunset, tz)}` : '',
      accent: undefined,
      extra: null,
    },
    {
      id: 'pressure',
      title: 'Pressure',
      emoji: trend === 'Rising' ? '📈' : trend === 'Falling' ? '📉' : '⏱️',
      value: formatPressure(c.pressure_msl, units),
      sub: `${trend}${vis < 10000 ? ` · Vis ${formatDistance(vis, units)}` : ''}`,
      accent: undefined,
      extra: null,
    },
  ]

  if (aqiInfo && aqi != null) {
    modules.push({
      id: 'aqi',
      title: 'Air Quality',
      emoji: '🫁',
      value: String(Math.round(aqi)),
      sub: aqiInfo.label,
      accent: aqiInfo.color,
      extra: (
        <div className="glance-meter" aria-hidden>
          <div
            className="glance-meter-fill"
            style={{
              width: `${Math.min(100, (aqi / 200) * 100)}%`,
              background: aqiInfo.color,
            }}
          />
        </div>
      ),
    })
  }

  return (
    <section className="glance-modules" aria-label="Conditions at a glance">
      <div className="panel-header glance-header">
        <h2>At a glance</h2>
        <span className="panel-hint">Like Apple Weather modules</span>
      </div>
      <div className="glance-grid">
        {modules.map((m) => (
          <article key={m.id} className="glance-card">
            <header className="glance-card-top">
              <span className="glance-emoji" aria-hidden>
                {m.emoji}
              </span>
              <span className="glance-title">{m.title}</span>
            </header>
            <p className="glance-value" style={m.accent ? { color: m.accent } : undefined}>
              {m.value}
            </p>
            <p className="glance-sub">{m.sub}</p>
            {m.extra}
          </article>
        ))}
      </div>
    </section>
  )
})
