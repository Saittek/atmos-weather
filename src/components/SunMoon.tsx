import type { WeatherData } from '../api/types'
import { formatDuration, formatTime } from '../utils/format'
import { moonPhase } from '../utils/moon'
import { parseSunTime } from '../utils/daylight'
import { todayDailyIndex } from '../utils/weatherStory'
import { moonGeometry } from '../utils/moonTimes'
import { MoonPhaseIcon } from './MoonPhaseIcon'
import { useI18n } from '../i18n/I18nProvider'

interface Props {
  weather: WeatherData
}

/** Prefer sun times whose local calendar day matches the daily row (guards bad ECCC injects). */
function pickSunPair(
  weather: WeatherData,
  ti: number,
): { sunrise?: string; sunset?: string; riseMs: number | null; setMs: number | null } {
  const d = weather.daily
  const tz = weather.timezone
  const tryIndex = (i: number) => {
    const sunrise = d.sunrise?.[i]
    const sunset = d.sunset?.[i]
    const riseMs = parseSunTime(sunrise, tz)
    const setMs = parseSunTime(sunset, tz)
    if (riseMs == null || setMs == null || setMs <= riseMs) {
      return null
    }
    const rowDay = d.time?.[i]?.slice(0, 10)
    if (rowDay) {
      const riseDay = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz || undefined,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(riseMs))
      if (riseDay !== rowDay) return null
    }
    return { sunrise, sunset, riseMs, setMs }
  }

  // Today first, then neighbors (evening edge cases), then any valid row
  for (const i of [ti, ti - 1, ti + 1]) {
    if (i < 0 || i >= (d.sunrise?.length ?? 0)) continue
    const hit = tryIndex(i)
    if (hit) return hit
  }
  for (let i = 0; i < (d.sunrise?.length ?? 0); i++) {
    const hit = tryIndex(i)
    if (hit) return hit
  }
  // Last resort: raw today strings even if day-mismatch (better than blank)
  const sunrise = d.sunrise?.[ti] ?? d.sunrise?.[0]
  const sunset = d.sunset?.[ti] ?? d.sunset?.[0]
  return {
    sunrise,
    sunset,
    riseMs: parseSunTime(sunrise, tz),
    setMs: parseSunTime(sunset, tz),
  }
}

export function SunMoon({ weather }: Props) {
  const { t, locale } = useI18n()
  const d = weather.daily
  const ti = todayDailyIndex(weather)
  const { sunrise, sunset, riseMs, setMs } = pickSunPair(weather, ti)
  let daylight = d.daylight_duration?.[ti] ?? d.daylight_duration?.[0]
  const sunshine = d.sunshine_duration?.[ti] ?? d.sunshine_duration?.[0]
  const uv = d.uv_index_max?.[ti] ?? d.uv_index_max?.[0]
  const moon = moonPhase(new Date())
  const tz = weather.timezone
  const now = Date.now()

  // If API omitted daylight_duration, derive from rise→set when valid
  if (
    (daylight == null || !Number.isFinite(daylight)) &&
    riseMs != null &&
    setMs != null &&
    setMs > riseMs
  ) {
    daylight = (setMs - riseMs) / 1000
  } else if (
    riseMs != null &&
    setMs != null &&
    setMs > riseMs &&
    Number.isFinite(daylight) &&
    // If duration disagrees with the pair by >45 min, trust the pair
    Math.abs((setMs - riseMs) / 1000 - (daylight as number)) > 45 * 60
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
    sunrise && riseMs != null ? formatTime(sunrise, tz) : '—'
  const setLabel = sunset && setMs != null ? formatTime(sunset, tz) : '—'

  // Moon geometry for this place (approx rise / set)
  const geo =
    Number.isFinite(weather.latitude) && Number.isFinite(weather.longitude)
      ? moonGeometry(weather.latitude, weather.longitude, now)
      : null
  const moonRiseLabel =
    geo?.riseMs != null
      ? new Date(geo.riseMs).toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: tz,
        })
      : null
  const moonSetLabel =
    geo?.setMs != null
      ? new Date(geo.setMs).toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: tz,
        })
      : null

  const fr = locale === 'fr'

  return (
    <section className="panel sun-panel redesign-feed">
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
          {(moonRiseLabel || moonSetLabel) && (
            <p className="moon-times-line">
              {fr ? 'Lune' : 'Moon'}{' '}
              {moonRiseLabel ? `${fr ? 'lever' : 'rise'} ${moonRiseLabel}` : '—'}
              {' · '}
              {moonSetLabel ? `${fr ? 'coucher' : 'set'} ${moonSetLabel}` : '—'}
              {geo?.upNow != null
                ? fr
                  ? geo.upNow
                    ? ' · au-dessus'
                    : ' · sous l’horizon'
                  : geo.upNow
                    ? ' · up'
                    : ' · below'
                : null}
            </p>
          )}
        </div>
      </div>
      {(!sunrise || !sunset || riseMs == null || setMs == null) && (
        <p className="muted-center" style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
          {fr
            ? 'Heures du soleil indisponibles pour ce lieu — réessayez après actualisation.'
            : 'Sun times unavailable for this place — pull to refresh.'}
        </p>
      )}
    </section>
  )
}
