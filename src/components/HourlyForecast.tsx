/**
 * Horizontal hourly strip — time · icon · temp · precip amount · PoP · wind when high
 */
import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import {
  formatHour,
  formatPrecip,
  formatPrecipAmount,
  formatSpeed,
  formatTemp,
  hasPrecipMm,
  parseWeatherLocal,
  precipUnit,
} from '../utils/format'
import { isSunUpAt } from '../utils/daylight'
import { getWeatherInfo } from '../utils/weatherCodes'
import { useI18n } from '../i18n/I18nProvider'
import { localeTag, trWeatherLabel } from '../i18n/messages'
import { WeatherIcon3D } from './WeatherIcon3D'

interface Props {
  weather: WeatherData
  units: Units
}

function hourLabel(
  iso: string,
  timezone: string,
  isNow: boolean,
  nowLabel: string,
  locTag: string,
): string {
  if (isNow) return nowLabel
  const ms = parseWeatherLocal(iso, timezone)
  try {
    return new Date(ms).toLocaleTimeString(locTag, {
      hour: 'numeric',
      timeZone: timezone,
    })
  } catch {
    return formatHour(iso, timezone)
  }
}

/** Compact per-hour amount with unit (always shown). */
function hourPrecipLabel(mm: number, units: Units): string {
  if (!Number.isFinite(mm) || mm < 0.05) return `0 ${precipUnit(units)}`
  return formatPrecip(mm, units)
}

export function HourlyForecast({ weather, units }: Props) {
  const { t, locale } = useI18n()
  const locTag = localeTag(locale)
  const { hourly, timezone } = weather
  const now = Date.now()
  const start = hourly.time.findIndex(
    (tm) => parseWeatherLocal(tm, timezone) >= now - 30 * 60 * 1000,
  )
  const idx = start < 0 ? 0 : start
  const mobile =
    typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches
  const count = mobile ? 24 : 48
  const items = Array.from({ length: count }, (_, i) => i + idx).filter(
    (i) => i < hourly.time.length,
  )

  const maxPrecip = Math.max(
    0.3,
    ...items.map((i) => hourly.precipitation[i] ?? 0),
  )

  const endIso = items.length ? hourly.time[items[items.length - 1]] : null
  const unit = precipUnit(units)
  const nowLbl = t('panel.now')

  return (
    <section className="panel hourly-panel redesign-feed">
      <div className="panel-header">
        <h2>{t('panel.hourly')}</h2>
        <span className="panel-hint">
          {endIso
            ? `${hourLabel(hourly.time[idx], timezone, true, nowLbl, locTag)} → ${hourLabel(endIso, timezone, false, nowLbl, locTag)} · ${unit}`
            : `→ · ${unit}`}
        </span>
      </div>
      <div className="hourly-scroll" role="list" tabIndex={0}>
        {items.map((i) => {
          const temp = hourly.temperature_2m[i]
          const code = hourly.weather_code[i]
          const hourMs = parseWeatherLocal(hourly.time[i], timezone)
          const isDay = isSunUpAt(weather, hourMs)
          const infoRaw = getWeatherInfo(code, isDay)
          const info = {
            ...infoRaw,
            label: trWeatherLabel(locale, infoRaw.label),
            description: trWeatherLabel(locale, infoRaw.description),
          }
          const pop = hourly.precipitation_probability[i] ?? 0
          const precip = hourly.precipitation[i] ?? 0
          const gust = hourly.wind_gusts_10m[i] ?? 0
          const precipH = hasPrecipMm(precip)
            ? Math.max(6, Math.round((precip / maxPrecip) * 36))
            : 0
          const wet = pop >= 30 || hasPrecipMm(precip)
          const rainLabel = hourPrecipLabel(precip, units)
          const timeLbl = hourLabel(hourly.time[i], timezone, i === idx, nowLbl, locTag)

          return (
            <div
              className={`hourly-card ${wet ? 'is-wet' : ''} ${i === idx ? 'is-now' : ''}`}
              key={hourly.time[i]}
              role="listitem"
              aria-current={i === idx ? 'true' : undefined}
              title={`${timeLbl}: ${formatTemp(temp, units)} · ${info.label} · ${rainLabel}`}
            >
              <span className="h-time">{timeLbl}</span>
              <span className="h-icon" title={info.description}>
                <WeatherIcon3D
                  code={code}
                  isDay={isDay}
                  size="sm"
                  forceAnimate={i === idx}
                />
              </span>
              <span className="h-temp">{formatTemp(temp, units)}</span>
              {/* Single blue bar = expected rain amount for this hour */}
              <div className="h-precip-col" aria-hidden>
                {precipH > 0 ? (
                  <div className="h-precip-bar" style={{ height: `${precipH}px` }} />
                ) : (
                  <div className="h-precip-empty" />
                )}
              </div>
              <span
                className={`h-rain-amt ${hasPrecipMm(precip) ? 'has-rain' : ''}`}
                aria-label={`${timeLbl} expected precipitation ${rainLabel}`}
              >
                {hasPrecipMm(precip) ? (
                  <>
                    <em className="h-rain-num">{formatPrecipAmount(precip, units)}</em>
                    <em className="h-rain-unit">{unit}</em>
                  </>
                ) : (
                  <em className="h-rain-dry">0 {unit}</em>
                )}
              </span>
              <span className={`h-pop ${pop >= 30 ? 'wet' : ''}`}>
                {pop > 0 ? `${Math.round(pop)}%` : '—'}
              </span>
              {gust >= 45 ? (
                <span className="h-wind" title="Wind gusts">
                  💨 {formatSpeed(gust, units)}
                </span>
              ) : (
                <span className="h-wind muted" aria-hidden>
                  {' '}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <p className="hourly-legend">
        <span className="hourly-legend-rain">Bar + amount = rain ({unit})</span>
        <span>% chance</span>
      </p>
    </section>
  )
}
