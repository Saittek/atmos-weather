import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { LocationResult, WeatherData } from '../api/types'
import { fetchClimateNormal, formatLocationLabel } from '../api/weather'
import type { Units } from '../utils/format'
import { formatSpeed, formatTemp, formatTime } from '../utils/format'
import { getWeatherInfo } from '../utils/weatherCodes'
import { nextPrecipLabel, todayDailyIndex } from '../utils/weatherStory'
import { vsNormalLine } from '../utils/severeTimeline'
import { formatUpdatedAgo } from '../utils/relativeTime'
import { isMobileViewport } from '../utils/device'
import { WeatherIcon3D } from './WeatherIcon3D'

interface Props {
  weather: WeatherData
  location: LocationResult
  units: Units
  isFavorite?: boolean
  onToggleFavorite?: () => void
  updatedAt?: number | null
  refreshing?: boolean
  alertCount?: number
  offline?: boolean
}

export function CurrentWeather({
  weather,
  location,
  units,
  isFavorite,
  onToggleFavorite,
  updatedAt,
  refreshing,
  alertCount = 0,
  offline = false,
}: Props) {
  const c = weather.current
  const info = getWeatherInfo(c.weather_code, c.is_day === 1)
  const ti = todayDailyIndex(weather)
  const today = weather.daily
  const high = today.temperature_2m_max[ti]
  const low = today.temperature_2m_min[ti]
  const rainLabel = nextPrecipLabel(weather)
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
            <h1 className="place-name">{location.name}</h1>
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
          </div>
          <p className="place-meta">
            {[location.admin1, location.country].filter(Boolean).join(' · ') ||
              formatLocationLabel(location)}
          </p>
          <p className="local-time">
            Local {formatTime(c.time, weather.timezone)}
            {weather.timezone_abbreviation ? ` · ${weather.timezone_abbreviation}` : ''}
            {updatedLabel && (
              <span className="updated-at">
                {' '}
                · {refreshing ? 'Refreshing…' : `Updated ${updatedLabel}`}
                {offline ? ' · offline' : ''}
              </span>
            )}
          </p>
        </div>

        <div className="current-3d-wrap" title={info.description}>
          <WeatherIcon3D
            code={c.weather_code}
            isDay={c.is_day === 1}
            size={mobile ? 'lg' : 'xl'}
            forceAnimate
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
            </span>
            <span className="hi-lo">
              H {formatTemp(high, units)} · L {formatTemp(low, units)}
            </span>
            {vsNormal && <span className="vs-normal-line">{vsNormal}</span>}
          </div>
        </div>

        <div className="current-chips" aria-label="Quick stats">
          {offline && <span className="current-chip offline">Offline</span>}
          {alertCount > 0 && (
            <span className="current-chip alert">
              {alertCount} alert{alertCount > 1 ? 's' : ''}
            </span>
          )}
          {rainLabel && <span className="current-chip rain">{rainLabel}</span>}
          <span className="current-chip">{formatSpeed(c.wind_speed_10m, units)}</span>
          <span className="current-chip">{c.relative_humidity_2m}% humidity</span>
          {vsNormal && <span className="current-chip normal hide-sm">{vsNormal}</span>}
          {weather.solara_source?.strategy && (
            <span
              className="current-chip model-chip"
              title={
                [
                  weather.solara_source.shortModel,
                  weather.solara_source.longModel,
                ]
                  .filter(Boolean)
                  .join(' → ') || weather.solara_source.strategy
              }
            >
              {weather.solara_source.strategy}
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
