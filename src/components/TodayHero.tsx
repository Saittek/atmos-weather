/**
 * Today at a glance: outlook + wet risk + key stats + full Conditions grid.
 * (Next-hour hero removed — hourly strip covers precip by hour.)
 */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { AirQualityData, WeatherData } from '../api/types'
import { buildStargazeBrief, gradeLabel } from '../utils/stargaze'
import type { Units } from '../utils/format'
import {
  convertTemp,
  formatDistance,
  formatPrecip,
  formatPrecipAmount,
  formatPressure,
  formatSpeed,
  formatTemp,
  formatTime,
  hasPrecipMm,
  parseWeatherLocal,
  precipUnit,
} from '../utils/format'
import { aqiLabel, uvLabel, windDirection } from '../utils/weatherCodes'
import { weatherStory } from '../utils/weatherStory'
import { todayRange } from '../utils/todayRange'
import { willIGetWet } from '../utils/wetSummary'
import { resolvePrecipKind } from '../utils/precipKind'
import { precipTiming } from '../utils/precipTiming'
import { formatWeatherSource } from '../utils/weatherSource'
import { useI18n } from '../i18n/I18nProvider'
import { trAqi, trUv } from '../i18n/messages'

interface Props {
  weather: WeatherData
  units: Units
  placeName: string
  air?: AirQualityData | null
  sourceLine?: string | null
}

export function TodayHero({ weather, units, placeName, air = null, sourceLine }: Props) {
  const { t, locale } = useI18n()
  const story = useMemo(
    () => weatherStory(weather, units, placeName, air),
    [weather, units, placeName, air],
  )
  const wet = useMemo(() => willIGetWet(weather, units), [weather, units])
  const range = todayRange(weather)
  const ti = range.dayIndex
  const c = weather.current
  const h = weather.hourly
  const tz = weather.timezone
  const now = Date.now()
  const idx = Math.max(
    0,
    h.time.findIndex((t) => parseWeatherLocal(t, tz) >= now - 30 * 60_000),
  )
  const uv = h.uv_index[idx] ?? weather.daily.uv_index_max[ti] ?? 0
  const uvInfoRaw = uvLabel(uv)
  const uvInfo = { ...uvInfoRaw, label: trUv(locale, uvInfoRaw.label) }
  const popMax = weather.daily.precipitation_probability_max[ti] ?? 0
  const precipSum = weather.daily.precipitation_sum[ti] ?? 0
  const aqi = air?.current?.us_aqi ?? air?.current?.european_aqi ?? null
  const aqiInfoRaw = aqi != null ? aqiLabel(aqi) : null
  const aqiInfo = aqiInfoRaw
    ? { ...aqiInfoRaw, label: trAqi(locale, aqiInfoRaw.label) }
    : null
  const sunrise = weather.daily.sunrise[ti]
  const sunset = weather.daily.sunset[ti]
  const kind = resolvePrecipKind(c.temperature_2m, c.weather_code, wet.level !== 'dry')
  const vis = h.visibility[idx] ?? 10000
  const dew = h.dew_point_2m[idx] ?? c.temperature_2m - 5

  const high = range.high
  const low = range.low

  const stargaze = useMemo(() => {
    try {
      return buildStargazeBrief(weather, {
        lat: weather.latitude,
        lon: weather.longitude,
        air,
      })
    } catch {
      return null
    }
  }, [weather, air])

  const timing = useMemo(() => precipTiming(weather, units), [weather, units])
  const sourceLineResolved = sourceLine || formatWeatherSource(weather)

  const conditionCards = [
    {
      title: t('cond.wind'),
      value: formatSpeed(c.wind_speed_10m, units),
      sub: `${windDirection(c.wind_direction_10m)} · ${t('cond.gusts', { speed: formatSpeed(c.wind_gusts_10m, units) })}`,
      icon: '💨',
      extra: (
        <div
          className="wind-compass"
          style={{ transform: `rotate(${c.wind_direction_10m}deg)` }}
          aria-hidden
        >
          <span>↑</span>
        </div>
      ),
    },
    {
      title: t('cond.humidity'),
      value: `${c.relative_humidity_2m}%`,
      sub: t('cond.dew', { temp: formatTemp(dew, units) }),
      icon: '💧',
    },
    {
      title: t('cond.pressure'),
      value: formatPressure(c.pressure_msl, units),
      sub: t('cond.msl'),
      icon: '⏱️',
    },
    {
      title: t('cond.uv'),
      value: uv < 0.5 ? '0' : uv.toFixed(1),
      sub: uvInfo.label,
      icon: '☀️',
      accent: uvInfo.color,
    },
    {
      title: t('cond.visibility'),
      value: formatDistance(vis, units),
      sub:
        vis > 10000
          ? t('cond.clear')
          : vis > 5000
            ? t('cond.moderate')
            : t('cond.reduced'),
      icon: '👁️',
    },
    {
      title: t('cond.clouds'),
      value: `${c.cloud_cover}%`,
      sub:
        c.cloud_cover < 25
          ? t('cond.mostlyClear')
          : c.cloud_cover < 60
            ? t('cond.partlyCloudy')
            : t('cond.cloudy'),
      icon: '☁️',
    },
    {
      title: t('cond.precip'),
      value: formatPrecip(c.precipitation, units),
      sub:
        c.snowfall > 0
          ? t('cond.snow', { amount: formatPrecip(c.snowfall * 10, units) })
          : c.rain + c.showers > 0
            ? t('cond.falling')
            : hasPrecipMm(precipSum)
              ? t('cond.todayPrecip', {
                  amount: `${formatPrecipAmount(precipSum, units)} ${precipUnit(units)}`,
                })
              : t('cond.todayDry'),
      icon: '🌧️',
    },
    {
      title: t('cond.feels'),
      value: formatTemp(c.apparent_temperature, units),
      sub: t('cond.actual', { temp: formatTemp(c.temperature_2m, units) }),
      icon: '🌡️',
    },
  ]

  return (
    <section className={`panel today-hero wet-${wet.level}`} aria-label={t('hero.today')}>
      <div className="today-hero-head">
        <div>
          <p className="today-hero-kicker">{t('hero.today')}</p>
          <h2 className="today-hero-title">{placeName}</h2>
        </div>
        <span className={`summary-wet-pill wet-${wet.level}`}>
          {wet.umbrella ? '☔ ' : ''}
          {wet.title}
        </span>
      </div>

      <p className="today-hero-story">{story}</p>
      <p className={`today-hero-precip-timing wet-${timing.level}`}>{timing.sentence}</p>
      <p className="today-hero-wet">{wet.detail}</p>

      <div className="today-hero-chips" aria-label="Key stats">
        <span className="today-chip" title={t('hero.todayHL', { h: '…', l: '…' })}>
          {t('hero.todayHL', {
            h: `${Math.round(convertTemp(high, units))}°`,
            l: `${Math.round(convertTemp(low, units))}°`,
          })}
        </span>
        <span className="today-chip">
          💨 {formatSpeed(c.wind_speed_10m, units)} {windDirection(c.wind_direction_10m)}
        </span>
        {uv >= 0.5 && (
          <span className="today-chip" style={{ borderColor: uvInfo.color }}>
            UV {Math.round(uv)} · {uvInfo.label}
          </span>
        )}
        <span className="today-chip">
          💧 {Math.round(popMax)}% ·{' '}
          {hasPrecipMm(precipSum)
            ? `${formatPrecipAmount(precipSum, units)} ${precipUnit(units)}`
            : kind === 'snow'
              ? 'snow risk'
              : 'little precip'}
        </span>
        {aqiInfo && aqi != null && (
          <span className="today-chip" style={{ borderColor: aqiInfo.color }}>
            AQI {Math.round(aqi)} · {aqiInfo.label}
          </span>
        )}
        {sunrise && sunset && (
          <span className="today-chip">
            ↑ {formatTime(sunrise, tz)} · ↓ {formatTime(sunset, tz)}
          </span>
        )}
        {/* Always offer Stargaze on phone (top-bar ✨ is hidden under 720px) */}
        <Link
          to={`/stargaze?lat=${weather.latitude.toFixed(4)}&lon=${weather.longitude.toFixed(4)}&name=${encodeURIComponent(placeName)}`}
          className="today-chip today-chip-link today-chip-stargaze"
          title="Open Stargaze · night sky & astrophotography planner"
        >
          {stargaze
            ? `✨ Tonight ${stargaze.imagingScore} · ${gradeLabel(stargaze.imagingGrade)}`
            : '✨ Stargaze · plan night sky'}
        </Link>
      </div>

      <div className="today-conditions">
        <h3 className="today-conditions-title">{t('hero.conditions')}</h3>
        <div className="detail-cards today-conditions-grid">
          {conditionCards.map((card) => (
            <article className="detail-card" key={card.title}>
              <div className="detail-card-top">
                <span className="detail-icon" aria-hidden>
                  {card.icon}
                </span>
                <span className="detail-title">{card.title}</span>
                {card.extra}
              </div>
              <p
                className="detail-value"
                style={card.accent ? { color: card.accent } : undefined}
              >
                {card.value}
              </p>
              <p className="detail-sub">{card.sub}</p>
            </article>
          ))}
        </div>
      </div>

      <p className="today-hero-source">
        {sourceLineResolved}
        {weather.current?.time
          ? ` · model time ${formatTime(weather.current.time, tz)}`
          : ''}
      </p>
    </section>
  )
}
