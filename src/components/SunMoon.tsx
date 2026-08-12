import type { WeatherData } from '../api/types'
import { formatDuration, formatTime } from '../utils/format'
import { moonPhase } from '../utils/moon'
import { parseSunTime } from '../utils/daylight'
import { todayDailyIndex } from '../utils/weatherStory'
import { MoonPhaseIcon } from './MoonPhaseIcon'
import { useI18n } from '../i18n/I18nProvider'

interface Props {
  weather: WeatherData
}

export function SunMoon({ weather }: Props) {
  const { t, locale } = useI18n()
  const d = weather.daily
  const ti = todayDailyIndex(weather)
  const sunrise = d.sunrise?.[ti] ?? d.sunrise?.[0]
  const sunset = d.sunset?.[ti] ?? d.sunset?.[0]
  let daylight = d.daylight_duration?.[ti] ?? d.daylight_duration?.[0]
  const sunshine = d.sunshine_duration?.[ti] ?? d.sunshine_duration?.[0]
  const uv = d.uv_index_max?.[ti] ?? d.uv_index_max?.[0]
  const moon = moonPhase(new Date())
  const tz = weather.timezone

  // parseSunTime handles Open-Meteo wall times + ECCC absolute Z timestamps
  const riseMs = parseSunTime(sunrise, tz)
  const setMs = parseSunTime(sunset, tz)
  const now = Date.now()

  // If API omitted daylight_duration, derive from rise→set when valid
  if (
    (daylight == null || !Number.isFinite(daylight)) &&
    riseMs != null &&
    setMs != null &&
    setMs > riseMs
  ) {
    daylight = (setMs - riseMs) / 1000
  }

  let progress = 0
  let sunUp = false
  if (riseMs != null && setMs != null && setMs > riseMs) {
    sunUp = now >= riseMs && now < setMs
    progress = Math.min(1, Math.max(0, (now - riseMs) / (setMs - riseMs)))
    if (now < riseMs) progress = 0
    if (now >= setMs) progress = 1
  }

  const riseLabel =
    sunrise && riseMs != null
      ? formatTime(sunrise, tz)
      : '—'
  const setLabel =
    sunset && setMs != null
      ? formatTime(sunset, tz)
      : '—'

  const fr = locale === 'fr'

  return (
    <section className="panel sun-panel">
      <div className="panel-header">
        <h2>☀️🌙 {t('panel.sunMoon')}</h2>
      </div>
      <div className="sun-arc-wrap">
        {/*
          Arc: center (100, 88), radius 72 → peak at y=16 so sun marker (r≈8)
          never clips the viewBox top.
        */}
        <svg viewBox="0 0 200 108" className="sun-arc" aria-hidden>
          <defs>
            <linearGradient id="sunGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#f97316" />
            </linearGradient>
          </defs>
          <path
            d="M 28 88 A 72 72 0 0 1 172 88"
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M 28 88 A 72 72 0 0 1 172 88"
            fill="none"
            stroke="url(#sunGrad)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${progress * 226} 226`}
          />
          {(() => {
            const r = 72
            const cx = 100
            const cy = 88
            const angle = Math.PI * (1 - progress)
            const x = cx + r * Math.cos(angle)
            const y = cy - r * Math.sin(angle)
            return (
              <circle
                cx={x}
                cy={y}
                r="7"
                fill={sunUp ? '#fbbf24' : '#94a3b8'}
                stroke="#fff"
                strokeWidth="1.5"
                opacity={sunUp || progress > 0 ? 1 : 0.55}
              />
            )
          })()}
        </svg>
        <div className="sun-times">
          <div>
            <span className="label">{fr ? 'Lever' : 'Sunrise'}</span>
            <span className="value">{riseLabel}</span>
          </div>
          <div>
            <span className="label">{fr ? 'Coucher' : 'Sunset'}</span>
            <span className="value">{setLabel}</span>
          </div>
        </div>
      </div>
      <div className="sun-stats">
        <div>
          <span className="label">{fr ? 'Durée du jour' : 'Day length'}</span>
          <span className="value">{formatDuration(daylight)}</span>
        </div>
        <div>
          <span className="label">{fr ? 'Ensoleillement' : 'Sunshine'}</span>
          <span className="value">{formatDuration(sunshine)}</span>
        </div>
        <div>
          <span className="label">{fr ? 'UV max' : 'UV max today'}</span>
          <span className="value">
            {uv != null && Number.isFinite(Number(uv)) ? Number(uv).toFixed(1) : '—'}
          </span>
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
            {fr
              ? `~${moon.illumination} % illuminée · jour ${Math.round(moon.phase * 29.53)} du cycle`
              : `~${moon.illumination}% illuminated · day ${Math.round(moon.phase * 29.53)} of cycle`}
          </p>
        </div>
      </div>
      {(!sunrise || !sunset) && (
        <p className="muted-center" style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
          {fr
            ? 'Heures du soleil indisponibles pour ce lieu — réessayez après actualisation.'
            : 'Sun times unavailable for this place — pull to refresh.'}
        </p>
      )}
    </section>
  )
}
