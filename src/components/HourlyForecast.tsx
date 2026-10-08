/**
 * Horizontal hourly strip — time · icon · temp · precip amount · PoP · wind when high
 */
import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import {
  formatHour,
  formatPrecip,
  formatPrecipAmount,
  formatSnow,
  formatSnowAmount,
  formatSpeed,
  formatTemp,
  hasPrecipMm,
  hasSnowCm,
  parseWeatherLocal,
  precipUnit,
  snowUnit,
} from '../utils/format'
import { resolvePrecipKind } from '../utils/precipKind'
import { isSunUpAt } from '../utils/daylight'
import { getWeatherInfo } from '../utils/weatherCodes'
import { useI18n } from '../i18n/I18nProvider'
import { localeTag, trWeatherLabel } from '../i18n/messages'
import { WeatherIcon3D } from './WeatherIcon3D'

interface Props {
  weather: WeatherData
  units: Units
  /** YYYY-MM-DD — show that calendar day instead of rolling next hours */
  selectedDay?: string | null
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

function hourIsSnow(tempC: number, code: number, precipMm: number, snowCm: number): boolean {
  if (hasSnowCm(snowCm)) return true
  const kind = resolvePrecipKind(tempC, code, hasPrecipMm(precipMm) || hasSnowCm(snowCm))
  return kind === 'snow'
}

/** Compact per-hour amount with unit (always shown). Snow is centimetres. */
function hourPrecipLabel(
  precipMm: number,
  snowCm: number,
  snowy: boolean,
  units: Units,
): string {
  if (snowy) return formatSnow(snowCm > 0 ? snowCm : precipMm, units)
  if (!Number.isFinite(precipMm) || precipMm < 0.05) return `0 ${precipUnit(units)}`
  return formatPrecip(precipMm, units)
}

export function HourlyForecast({ weather, units, selectedDay = null }: Props) {
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
  const rolling = Array.from({ length: count }, (_, i) => i + idx).filter(
    (i) => i < hourly.time.length,
  )
  const dayItems =
    selectedDay && selectedDay.length >= 10
      ? hourly.time
          .map((_, i) => i)
          .filter((i) => String(hourly.time[i]).slice(0, 10) === selectedDay.slice(0, 10))
      : null
  const dayMissing = Boolean(selectedDay && selectedDay.length >= 10 && !(dayItems && dayItems.length))
  const items = dayMissing ? [] : dayItems && dayItems.length ? dayItems : rolling

  const maxPrecip = Math.max(
    0.3,
    ...items.map((i) =>
      Math.max(hourly.precipitation[i] ?? 0, hourly.snowfall[i] ?? 0),
    ),
  )

  const endIso = items.length ? hourly.time[items[items.length - 1]] : null
  const unit = precipUnit(units)
  const nowLbl = t('panel.now')

  return (
    <section className="panel hourly-panel redesign-feed">
      <div className="panel-header">
        <h2>{t('panel.hourly')}</h2>
        <span className="panel-hint">
          {dayMissing
            ? t('panel.hourlyBeyond')
            : selectedDay && dayItems?.length
              ? `${selectedDay} · ${unit}`
              : endIso
                ? `${hourLabel(hourly.time[idx], timezone, true, nowLbl, locTag)} → ${hourLabel(endIso, timezone, false, nowLbl, locTag)} · ${unit}`
                : `→ · ${unit}`}
        </span>
      </div>
      {dayMissing && (
        <p className="muted-center">{t('panel.hourlyBeyondHint')}</p>
      )}
      {items.length > 2 && (
        <div className="hourly-graph-wrap">
          <svg
            className="hourly-graph"
            viewBox={`0 0 ${Math.max(items.length * 8, 80)} 72`}
            preserveAspectRatio="none"
            role="img"
            aria-label={t('panel.hourlyGraphAria', { unit })}
          >
            {(() => {
              const temps = items.map((i) => hourly.temperature_2m[i] ?? 0)
              const precs = items.map((i) =>
                Math.max(hourly.precipitation[i] ?? 0, hourly.snowfall[i] ?? 0),
              )
              const tMin = Math.min(...temps)
              const tMax = Math.max(...temps)
              const span = Math.max(tMax - tMin, 1)
              const pMax = Math.max(0.4, ...precs)
              const w = Math.max(items.length * 8, 80)
              const barW = Math.max(2, w / items.length - 1.5)
              const pts = temps
                .map((v, n) => {
                  const x = (n + 0.5) * (w / items.length)
                  const y = 10 + (1 - (v - tMin) / span) * 50
                  return `${x.toFixed(1)},${y.toFixed(1)}`
                })
                .join(' ')
              return (
                <>
                  {precs.map((p, n) => {
                    const h = (p / pMax) * 40
                    if (h < 1) return null
                    const x = n * (w / items.length) + 0.5
                    return (
                      <rect
                        key={hourly.time[items[n]]}
                        className="hg-bar"
                        x={x}
                        y={68 - h}
                        width={barW}
                        height={h}
                        rx="1"
                      />
                    )
                  })}
                  <polyline className="hg-line" points={pts} />
                </>
              )
            })()}
          </svg>
          <p className="hourly-graph-legend">
            <span>
              <i className="hg-key-line" aria-hidden />
              {t('panel.hourlyLineTemp')}
            </span>
            <span>
              <i className="hg-key-bar" aria-hidden />
              {t('panel.hourlyLineRain', { unit })}
            </span>
          </p>
        </div>
      )}
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
          const snowCm = hourly.snowfall[i] ?? 0
          const snowy = hourIsSnow(temp, code, precip, snowCm)
          const amount = snowy ? (snowCm > 0 ? snowCm : precip) : precip
          const amountUnit = snowy ? snowUnit(units) : unit
          const gust = hourly.wind_gusts_10m[i] ?? 0
          const precipH = hasPrecipMm(precip) || hasSnowCm(snowCm)
            ? Math.max(6, Math.round(((snowy ? amount : precip) / maxPrecip) * 36))
            : 0
          const wet = pop >= 30 || hasPrecipMm(precip) || hasSnowCm(snowCm)
          const rainLabel = hourPrecipLabel(precip, snowCm, snowy, units)
          const timeLbl = hourLabel(hourly.time[i], timezone, i === idx, nowLbl, locTag)
          const hasAmt = snowy ? hasSnowCm(amount) : hasPrecipMm(precip)

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
                className={`h-rain-amt ${hasAmt ? 'has-rain' : ''}`}
                aria-label={`${timeLbl} expected precipitation ${rainLabel}`}
              >
                {hasAmt ? (
                  <>
                    <em className="h-rain-num">
                      {snowy
                        ? formatSnowAmount(amount, units)
                        : formatPrecipAmount(precip, units)}
                    </em>
                    <em className="h-rain-unit">{amountUnit}</em>
                  </>
                ) : (
                  <em className="h-rain-dry">0 {amountUnit}</em>
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
        <span className="hourly-legend-rain">{t('panel.hourlyCardRain', { unit })}</span>
        <span>{t('panel.hourlyChance')}</span>
      </p>
    </section>
  )
}
