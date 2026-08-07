import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { AirQualityData, LocationResult, WeatherData } from '../api/types'
import { fetchClimateNormal, formatLocationLabel } from '../api/weather'
import type { Units } from '../utils/format'
import {
  formatSpeed,
  formatTemp,
  formatTime,
  parseWeatherLocal,
} from '../utils/format'
import {
  aqiLabel,
  displayOptsFromWeather,
  effectiveWeatherCode,
  getWeatherInfo,
  uvLabel,
  windDirection,
} from '../utils/weatherCodes'
import { isDaytimeNow } from '../utils/daylight'
import { nextPrecipLabel, todayDailyIndex } from '../utils/weatherStory'
import { vsNormalLine } from '../utils/severeTimeline'
import { formatUpdatedAgo, isWeatherStale } from '../utils/relativeTime'
import { isMobileViewport } from '../utils/device'
import { precipTiming } from '../utils/precipTiming'
import { formatWeatherSource, todayRangeHint } from '../utils/weatherSource'
import { useI18n } from '../i18n/I18nProvider'
import { trAqi, trUv, trWeatherLabel } from '../i18n/messages'
import { WeatherIcon3D } from './WeatherIcon3D'

interface Props {
  weather: WeatherData
  location: LocationResult
  units: Units
  isFavorite?: boolean
  onToggleFavorite?: () => void
  isHome?: boolean
  onSetHome?: () => void
  updatedAt?: number | null
  refreshing?: boolean
  alertCount?: number
  offline?: boolean
  air?: AirQualityData | null
  onShare?: () => void
}

export function CurrentWeather({
  weather,
  location,
  units,
  isFavorite,
  onToggleFavorite,
  isHome,
  onSetHome,
  updatedAt,
  refreshing,
  alertCount = 0,
  offline = false,
  air = null,
  onShare,
}: Props) {
  const { t, locale } = useI18n()
  const c = weather.current
  const condOpts = displayOptsFromWeather(weather, air)
  const displayCode = effectiveWeatherCode(c.weather_code, condOpts)
  // Sunrise/sunset at this location — never trust API is_day alone
  const isDay = isDaytimeNow(weather)
  const infoRaw = getWeatherInfo(displayCode, isDay)
  const info = {
    ...infoRaw,
    label: trWeatherLabel(locale, infoRaw.label),
    description: trWeatherLabel(locale, infoRaw.description),
  }
  const ti = todayDailyIndex(weather)
  const today = weather.daily
  // If actual now exceeds the forecast max (or a mis-aligned daily slot), show a sensible high
  const highRaw = today.temperature_2m_max[ti]
  const lowRaw = today.temperature_2m_min[ti]
  const high =
    highRaw != null && Number.isFinite(highRaw)
      ? Math.max(highRaw, c.temperature_2m)
      : c.temperature_2m
  const low =
    lowRaw != null && Number.isFinite(lowRaw)
      ? Math.min(lowRaw, c.temperature_2m)
      : c.temperature_2m
  const timing = precipTiming(weather, units)
  const rainLabel = timing.level === 'dry' && timing.next3hMm < 0.15
    ? nextPrecipLabel(weather)
    : timing.short
  const precipSentence = timing.sentence
  const h = weather.hourly
  const now = Date.now()
  const hIdx = Math.max(
    0,
    h.time.findIndex(
      (t) => parseWeatherLocal(t, weather.timezone) >= now - 30 * 60_000,
    ),
  )
  const uv = h.uv_index[hIdx] ?? today.uv_index_max[ti] ?? 0
  const uvInfoRaw = uvLabel(uv)
  const uvInfo = { ...uvInfoRaw, label: trUv(locale, uvInfoRaw.label) }
  const aqi = air?.current?.us_aqi ?? air?.current?.european_aqi
  const aqiInfoRaw = aqi != null ? aqiLabel(aqi) : null
  const aqiInfo = aqiInfoRaw
    ? { ...aqiInfoRaw, label: trAqi(locale, aqiInfoRaw.label) }
    : null
  const sunrise = today.sunrise[ti]
  const sunset = today.sunset[ti]
  const feelDiff = c.apparent_temperature - c.temperature_2m
  const feelNote =
    Math.abs(feelDiff) >= 2
      ? feelDiff > 0
        ? t('hero.warmer')
        : t('hero.cooler')
      : null
  const cardRef = useRef<HTMLElement>(null)
  const [vsNormal, setVsNormal] = useState<string | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const mobile = isMobileViewport()

  useEffect(() => {
    let cancelled = false
    void fetchClimateNormal(location.latitude, location.longitude).then((n) => {
      if (cancelled || !n) return
      setVsNormal(vsNormalLine(high, n.avgHigh, units))
    })
    return () => {
      cancelled = true
    }
  }, [location.latitude, location.longitude, high, units])

  // Keep “Updated Xm ago” fresh without heavy re-renders
  useEffect(() => {
    if (updatedAt == null) return
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [updatedAt])

  const updatedLabel =
    updatedAt != null ? formatUpdatedAgo(updatedAt, nowTick, locale) : null
  const stale = isWeatherStale(updatedAt, nowTick)

  const sourceLine = formatWeatherSource(weather)

  const onMove = (e: MouseEvent<HTMLElement>) => {
    if (mobile) return
    const el = cardRef.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    el.style.setProperty('--tilt-x', `${(-y * 6).toFixed(2)}deg`)
    el.style.setProperty('--tilt-y', `${(x * 8).toFixed(2)}deg`)
    el.style.setProperty('--glow-x', `${50 + x * 30}%`)
    el.style.setProperty('--glow-y', `${50 + y * 30}%`)
  }

  const onLeave = () => {
    const el = cardRef.current
    if (!el) return
    el.style.setProperty('--tilt-x', '0deg')
    el.style.setProperty('--tilt-y', '0deg')
    el.style.setProperty('--glow-x', '50%')
    el.style.setProperty('--glow-y', '40%')
  }

  return (
    <section
      className="panel current-weather current-hero"
      ref={cardRef}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <div className="hero-glow" aria-hidden />
      <div className="hero-grid" aria-hidden />

      <div className="current-top">
        <div className="current-place">
          <p className="hero-kicker">{t('hero.rightNow')}</p>
          <div className="place-row">
            <h1 className="place-name">
              {isHome ? '🏠 ' : ''}
              {location.name}
            </h1>
            {onSetHome && (
              <button
                type="button"
                className={`fav-inline home-inline ${isHome ? 'on' : ''}`}
                onClick={onSetHome}
                title={isHome ? t('hero.isHome') : t('hero.setHome')}
                aria-label={isHome ? t('hero.isHome') : t('hero.setHome')}
              >
                {isHome ? '🏡' : '🏠'}
              </button>
            )}
            {onToggleFavorite && (
              <button
                type="button"
                className={`fav-inline ${isFavorite ? 'on' : ''}`}
                onClick={onToggleFavorite}
                title={isFavorite ? t('hero.removeFav') : t('hero.saveFav')}
                aria-label={isFavorite ? t('hero.removeFav') : t('hero.saveFav')}
              >
                {isFavorite ? '★' : '☆'}
              </button>
            )}
            {onShare && (
              <button
                type="button"
                className="fav-inline share-inline"
                onClick={onShare}
                title={t('hero.copyLink')}
                aria-label={t('hero.share')}
              >
                ↗
              </button>
            )}
          </div>
          <p className="place-meta">
            {[location.admin1, location.country].filter(Boolean).join(' · ') ||
              formatLocationLabel(location)}
            {` · ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`}
          </p>
          <p className="local-time">
            {t('app.local')} {formatTime(c.time, weather.timezone)}
            {weather.timezone_abbreviation ? ` · ${weather.timezone_abbreviation}` : ''}
            {updatedLabel && (
              <span className={`updated-at${stale ? ' is-stale' : ''}`}>
                {' '}
                ·{' '}
                {refreshing
                  ? t('app.refreshing')
                  : t('app.updated', { ago: updatedLabel })}
                {offline ? ` · ${t('app.offline')}` : ''}
              </span>
            )}
          </p>
          <p className="current-source-line" title={todayRangeHint()}>
            {sourceLine}
            {updatedLabel ? ` · ${refreshing ? t('app.refreshing') : updatedLabel}` : ''}
          </p>
          <p
            className={`current-precip-timing wet-${timing.level}`}
            role="status"
            title="Near-term precip from 15‑min / hourly forecast"
          >
            {precipSentence}
          </p>
          {rainLabel && rainLabel !== precipSentence && (
            <p className="current-next-precip" role="status">
              {rainLabel}
            </p>
          )}
        </div>

        <div className="current-3d-wrap" title={info.description}>
          <WeatherIcon3D
            code={displayCode}
            isDay={isDay}
            size={mobile ? 'lg' : 'xl'}
            forceAnimate
            windSpeed={c.wind_speed_10m}
            windDir={c.wind_direction_10m}
          />
        </div>
      </div>

      <div className="current-main">
        <div className="temp-block">
          <span className="temp-big">{formatTemp(c.temperature_2m, units)}</span>
          <div className="temp-side">
            <span className="condition">{info.label}</span>
            <span className="feels">
              {t('hero.feelsLike', { temp: formatTemp(c.apparent_temperature, units) })}
              {feelNote ? ` · ${feelNote}` : ''}
            </span>
            <span className="hi-lo" title={todayRangeHint()}>
              {t('hero.todayHL', {
                h: formatTemp(high, units),
                l: formatTemp(low, units),
              })}
            </span>
            {vsNormal && <span className="vs-normal-line">{vsNormal}</span>}
          </div>
        </div>

        {(offline || (stale && !refreshing)) && (
          <div
            className={`current-freshness-banner ${offline ? 'is-offline' : 'is-stale'}`}
            role="status"
          >
            {offline
              ? t('hero.offlineBanner')
              : t('hero.staleBanner', { ago: updatedLabel || '—' })}
          </div>
        )}

        <div className="current-chips" aria-label={t('hero.quickStats')}>
          {offline && <span className="current-chip offline">{t('hero.offlineChip')}</span>}
          {stale && !offline && (
            <span className="current-chip stale" title={t('app.pullRefresh')}>
              {t('hero.staleChip')}
            </span>
          )}
          {alertCount > 0 && (
            <span className="current-chip alert">
              {alertCount > 1
                ? t('hero.alerts_plural', { n: alertCount })
                : t('hero.alerts', { n: alertCount })}
            </span>
          )}
          {rainLabel && <span className="current-chip rain">{rainLabel}</span>}
          <span className="current-chip">
            {formatSpeed(c.wind_speed_10m, units)} {windDirection(c.wind_direction_10m)}
          </span>
          <span className="current-chip">{c.relative_humidity_2m}% humidity</span>
          {uv >= 0.5 && (
            <span className="current-chip" style={{ borderColor: uvInfo.color }}>
              UV {uv.toFixed(0)} · {uvInfo.label}
            </span>
          )}
          {aqiInfo && aqi != null && (
            <span className="current-chip" style={{ borderColor: aqiInfo.color }}>
              AQI {Math.round(aqi)} · {aqiInfo.label}
            </span>
          )}
          {sunrise && sunset && (
            <span className="current-chip">
              ☀ {formatTime(sunrise, weather.timezone)} ·{' '}
              {formatTime(sunset, weather.timezone)}
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
