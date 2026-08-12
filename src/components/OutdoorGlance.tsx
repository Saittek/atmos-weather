/**
 * One “Go outside?” card — UV, wind, air, short activity cues.
 * Replaces separate HazardBadges + UvWindPanel + OutdoorAirStrip + ActivityModes on main path.
 */
import { useMemo } from 'react'
import type { AirQualityData, WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { formatSpeed, parseWeatherLocal } from '../utils/format'
import { aqiLabel, uvLabel, windDirection } from '../utils/weatherCodes'
import { todayDailyIndex } from '../utils/weatherStory'
import { adviseActivityMode } from '../utils/activityModes'
import { willIGetWet } from '../utils/wetSummary'

interface Props {
  weather: WeatherData
  units: Units
  air?: AirQualityData | null
}

export function OutdoorGlance({ weather, units, air = null }: Props) {
  const ti = todayDailyIndex(weather)
  const c = weather.current
  const h = weather.hourly
  const tz = weather.timezone
  const now = Date.now()
  const idx = Math.max(
    0,
    h.time.findIndex((t) => parseWeatherLocal(t, tz) >= now - 30 * 60_000),
  )
  const uv = h.uv_index[idx] ?? weather.daily.uv_index_max[ti] ?? 0
  const uvInfo = uvLabel(uv)
  const aqi = air?.current?.us_aqi ?? air?.current?.european_aqi ?? null
  const aqiInfo = aqi != null ? aqiLabel(aqi) : null
  const wet = useMemo(() => willIGetWet(weather), [weather])
  const outdoor = useMemo(
    () => adviseActivityMode('outdoor', weather, units, air),
    [weather, units, air],
  )
  const commute = useMemo(
    () => adviseActivityMode('commute', weather, units, air),
    [weather, units, air],
  )

  const hazards: string[] = []
  if (uv >= 6) hazards.push(`High UV (${Math.round(uv)}) — sunscreen / shade`)
  if (c.wind_gusts_10m >= 50 || c.wind_speed_10m >= 40) {
    hazards.push(`Strong wind · gusts ${formatSpeed(c.wind_gusts_10m, units)}`)
  }
  if (aqi != null && aqi >= 100) hazards.push(`Unhealthy air (AQI ${Math.round(aqi)})`)
  if (wet.umbrella) hazards.push(wet.title)
  if (c.weather_code >= 95) hazards.push('Thunderstorm risk nearby')

  const verdictClass =
    outdoor.verdict === 'go' ? 'go' : outdoor.verdict === 'caution' ? 'caution' : 'avoid'

  return (
    <section className="panel outdoor-glance redesign-feed" aria-label="Go outside">
      <div className="panel-header outdoor-glance-head">
        <h2>Go outside?</h2>
        <span className={`outdoor-verdict outdoor-verdict-${verdictClass}`}>
          {outdoor.verdict === 'go' ? 'Good to go' : outdoor.verdict === 'caution' ? 'Caution' : 'Skip if you can'}
        </span>
      </div>

      <div className="outdoor-glance-grid">
        <div className="outdoor-stat">
          <span className="outdoor-stat-label">UV</span>
          <span className="outdoor-stat-value" style={{ color: uvInfo.color }}>
            {uv < 0.5 ? '0' : Math.round(uv)}
          </span>
          <span className="outdoor-stat-sub">{uvInfo.label}</span>
        </div>
        <div className="outdoor-stat">
          <span className="outdoor-stat-label">Wind</span>
          <span className="outdoor-stat-value">{formatSpeed(c.wind_speed_10m, units)}</span>
          <span className="outdoor-stat-sub">
            {windDirection(c.wind_direction_10m)} · gust {formatSpeed(c.wind_gusts_10m, units)}
          </span>
        </div>
        <div className="outdoor-stat">
          <span className="outdoor-stat-label">Air</span>
          <span
            className="outdoor-stat-value"
            style={aqiInfo ? { color: aqiInfo.color } : undefined}
          >
            {aqi != null ? Math.round(aqi) : '—'}
          </span>
          <span className="outdoor-stat-sub">{aqiInfo?.label ?? 'No AQI yet'}</span>
        </div>
        <div className="outdoor-stat">
          <span className="outdoor-stat-label">Wet risk</span>
          <span className="outdoor-stat-value outdoor-stat-wet">{wet.level}</span>
          <span className="outdoor-stat-sub">{wet.umbrella ? 'Bring cover' : 'Stay dry-ish'}</span>
        </div>
      </div>

      <ul className="outdoor-glance-tips">
        <li>
          <strong>{outdoor.mode.emoji} Next 3h</strong> — {outdoor.title}
          {outdoor.points[0] ? `: ${outdoor.points[0]}` : ''}
        </li>
        <li>
          <strong>{commute.mode.emoji} Commute</strong> — {commute.title}
        </li>
        {hazards.slice(0, 2).map((hz) => (
          <li key={hz} className="outdoor-hazard">
            {hz}
          </li>
        ))}
      </ul>
    </section>
  )
}
