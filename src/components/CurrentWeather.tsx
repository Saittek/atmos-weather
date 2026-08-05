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
  const c = weather.current
  const condOpts = displayOptsFromWeather(weather, air)
  const displayCode = effectiveWeatherCode(c.weather_code, condOpts)
  // Sunrise/sunset at this location — never trust API is_day alone
  const isDay = isDaytimeNow(weather)
  const info = getWeatherInfo(displayCode, isDay)
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
  const rainLabel = nextPrecipLabel(weather)
  const h = weather.hourly
  const now = Date.now()
  const hIdx = Math.max(
    0,
    h.time.findIndex(
      (t) => parseWeatherLocal(t, weather.timezone) >= now - 30 * 60_000,
    ),
  )
  const uv = h.uv_index[hIdx] ?? today.uv_index_max[ti] ?? 0
  const uvInfo = uvLabel(uv)
  const aqi = air?.current?.us_aqi ?? air?.current?.european_aqi
  const aqiInfo = aqi != null ? aqiLabel(aqi) : null
  const sunrise = today.sunrise[ti]
  const sunset = today.sunset[ti]
  const feelDiff = c.apparent_temperature - c.temperature_2m
  const feelNote =
    Math.abs(feelDiff) >= 2
      ? feelDiff > 0
        ? 'warmer than air'
        : 'cooler than air'
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
    updatedAt != null ? formatUpdatedAgo(updatedAt, nowTick) : null
  const stale = isWeatherStale(updatedAt, nowTick)

  const sourceLine = (() => {
    const s = weather.solara_source
    if (s?.strategy) {
      const short = s.shortModel ? ` · ${s.shortModel}` : ''
      return `Sources · Solara blend (${s.strategy}${short}) · Open-Meteo`
    }
    return 'Sources · Open-Meteo'
  })()

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
          <p className="hero-kicker">Right now</p>
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
                title={
                  isHome
                    ? 'This is your exact home pin'
                    : 'Set this place as exact home'
                }
                aria-label={isHome ? 'Home location' : 'Set as home'}
              >
                {isHome ? '🏡' : '🏠'}
              </button>
            )}
            {onToggleFavorite && (
              <button
                type="button"
                className={`fav-inline ${isFavorite ? 'on' : ''}`}
                onClick={onToggleFavorite}
                title={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
                aria-label={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
              >
                {isFavorite ? '★' : '☆'}
              </button>
            )}
            {onShare && (
              <button
                type="button"
                className="fav-inline share-inline"
                onClick={onShare}
                title="Copy share link"
                aria-label="Share this place"
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
            Local {formatTime(c.time, weather.timezone)}
            {weather.timezone_abbreviation ? ` · ${weather.timezone_abbreviation}` : ''}
            {updatedLabel && (
              <span className={`updated-at${stale ? ' is-stale' : ''}`}>
                {' '}
                · {refreshing ? 'Refreshing…' : `Updated ${updatedLabel}`}
                {offline ? ' · offline' : ''}
                {stale && !refreshing ? ' · may be outdated' : ''}
              </span>
            )}
          </p>
          <p className="current-source-line">
            {sourceLine}
            {updatedLabel ? ` · ${refreshing ? 'refreshing' : updatedLabel}` : ''}
          </p>
          {rainLabel && (
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
              Feels like {formatTemp(c.apparent_temperature, units)}
              {feelNote ? ` · ${feelNote}` : ''}
            </span>
            <span className="hi-lo">
              H {formatTemp(high, units)} · L {formatTemp(low, units)}
            </span>
            {vsNormal && <span className="vs-normal-line">{vsNormal}</span>}
          </div>
        </div>

        <div className="current-chips" aria-label="Quick stats">
          {offline && <span className="current-chip offline">Offline · last saved</span>}
          {stale && !offline && (
            <span className="current-chip stale" title="Pull down to refresh">
              Data aging
            </span>
          )}
          {alertCount > 0 && (
            <span className="current-chip alert">
              {alertCount} alert{alertCount > 1 ? 's' : ''}
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
