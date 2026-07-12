import type { WeatherData } from '../api/types'
import { formatDuration, formatTime, parseWeatherLocal } from '../utils/format'
import { moonPhase } from '../utils/moon'
import { todayDailyIndex } from '../utils/weatherStory'
import { MoonPhaseIcon } from './MoonPhaseIcon'

interface Props {
  weather: WeatherData
}

export function SunMoon({ weather }: Props) {
  const d = weather.daily
  const ti = todayDailyIndex(weather)
  const sunrise = d.sunrise[ti] ?? d.sunrise[0]
  const sunset = d.sunset[ti] ?? d.sunset[0]
  const daylight = d.daylight_duration[ti] ?? d.daylight_duration[0]
  const sunshine = d.sunshine_duration[ti] ?? d.sunshine_duration[0]
  const uv = d.uv_index_max[ti] ?? d.uv_index_max[0]
  const moon = moonPhase(new Date())
  const tz = weather.timezone

  const riseMs = parseWeatherLocal(sunrise, tz)
  const setMs = parseWeatherLocal(sunset, tz)
  const now = Date.now()
  const progress =
    setMs <= riseMs ? 0 : Math.min(1, Math.max(0, (now - riseMs) / (setMs - riseMs)))

  return (
    <section className="panel sun-panel">
      <div className="panel-header">
        <h2>☀️🌙 Sun, moon & daylight</h2>
      </div>
      <div className="sun-arc-wrap">
        <svg viewBox="0 0 200 90" className="sun-arc" aria-hidden>
          <path
            d="M 20 80 A 80 80 0 0 1 180 80"
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="3"
          />
          <path
            d="M 20 80 A 80 80 0 0 1 180 80"
            fill="none"
            stroke="url(#sunGrad)"
            strokeWidth="3"
            strokeDasharray={`${progress * 251} 251`}
          />
          <defs>
            <linearGradient id="sunGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#f97316" />
            </linearGradient>
          </defs>
          {(() => {
            const angle = Math.PI * (1 - progress)
            const x = 100 + 80 * Math.cos(angle)
            const y = 80 - 80 * Math.sin(angle)
            return (
              <circle cx={x} cy={y} r="7" fill="#fbbf24" stroke="#fff" strokeWidth="1.5" />
            )
          })()}
        </svg>
        <div className="sun-times">
          <div>
            <span className="label">Sunrise</span>
            <span className="value">{formatTime(sunrise, tz)}</span>
          </div>
          <div>
            <span className="label">Sunset</span>
            <span className="value">{formatTime(sunset, tz)}</span>
          </div>
        </div>
      </div>
      <div className="sun-stats">
        <div>
          <span className="label">Day length</span>
          <span className="value">{formatDuration(daylight)}</span>
        </div>
        <div>
          <span className="label">Sunshine</span>
          <span className="value">{formatDuration(sunshine)}</span>
        </div>
        <div>
          <span className="label">UV max today</span>
          <span className="value">{uv != null ? Number(uv).toFixed(1) : '—'}</span>
        </div>
      </div>
      <div className="moon-row">
        <MoonPhaseIcon
          phase={moon.phase}
          size={56}
          title={moon.name}
          className="moon-phase-visual"
        />
        <div>
          <strong>{moon.name}</strong>
          <p>
            ~{moon.illumination}% illuminated · day {Math.round(moon.phase * 29.53)} of cycle
          </p>
        </div>
      </div>
    </section>
  )
}
