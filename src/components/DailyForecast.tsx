import { useEffect, useMemo, useState } from 'react'
import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import {
  formatDay,
  formatPrecip,
  formatSpeed,
  formatTemp,
  formatWeekday,
  convertTemp,
} from '../utils/format'
import { getWeatherInfo, windDirection } from '../utils/weatherCodes'
import { todayDailyIndex } from '../utils/weatherStory'
import { useI18n } from '../i18n/I18nProvider'
import { trWeatherLabel } from '../i18n/messages'
import { WeatherIcon3D } from './WeatherIcon3D'

const COLLAPSED_DAYS = 7
const EXPANDED_DAYS = 14

interface Props {
  weather: WeatherData
  units: Units
}

export function DailyForecast({ weather, units }: Props) {
  const { t, locale } = useI18n()
  const d = weather.daily
  const todayIdx = todayDailyIndex(weather)
  const [open, setOpen] = useState<number | null>(todayIdx)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setOpen(todayIdx)
    setExpanded(false)
  }, [todayIdx, weather.latitude, weather.longitude])

  const futureIndices = useMemo(() => {
    const all: number[] = []
    for (let i = todayIdx; i < d.time.length; i++) all.push(i)
    return all
  }, [d.time.length, todayIdx])

  const visibleLimit = expanded ? EXPANDED_DAYS : COLLAPSED_DAYS
  const visibleIndices = futureIndices.slice(0, visibleLimit)
  const canExpand = futureIndices.length > COLLAPSED_DAYS
  const hiddenCount = Math.max(0, Math.min(futureIndices.length, EXPANDED_DAYS) - COLLAPSED_DAYS)

  // Scale temp bars from only the days currently shown so the range stays useful
  const temps = visibleIndices.flatMap((i) => [
    convertTemp(d.temperature_2m_min[i], units),
    convertTemp(d.temperature_2m_max[i], units),
  ])
  const minAll = temps.length ? Math.min(...temps) : 0
  const maxAll = temps.length ? Math.max(...temps) : 1
  const span = Math.max(maxAll - minAll, 1)

  const title = expanded ? t('panel.daily') : t('panel.daily7')

  return (
    <section className="panel daily-panel">
      <div className="panel-header">
        <h2>{title}</h2>
        {canExpand && (
          <button
            type="button"
            className="chip-btn daily-expand-btn"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded
              ? t('panel.showLess')
              : `${t('panel.showMore')}${hiddenCount ? ` (+${hiddenCount})` : ''}`}
          </button>
        )}
      </div>
      <ul className="daily-list">
        {visibleIndices.map((i) => {
          const day = d.time[i]
          const infoRaw = getWeatherInfo(d.weather_code[i], true)
          const info = {
            ...infoRaw,
            label: trWeatherLabel(locale, infoRaw.label),
            description: trWeatherLabel(locale, infoRaw.description),
          }
          const lo = convertTemp(d.temperature_2m_min[i], units)
          const hi = convertTemp(d.temperature_2m_max[i], units)
          const left = ((lo - minAll) / span) * 100
          const width = Math.max(((hi - lo) / span) * 100, 6)
          const isOpen = open === i
          const pop = d.precipitation_probability_max[i] ?? 0
          const dayKey = day.slice(0, 10)
          const weekday = formatWeekday(day, weather.timezone)
          const relLabel =
            i === todayIdx
              ? t('panel.today')
              : i === todayIdx + 1
                ? locale === 'fr'
                  ? 'Demain'
                  : 'Tomorrow'
                : i === todayIdx - 1
                  ? locale === 'fr'
                    ? 'Hier'
                    : 'Yesterday'
                  : null

          return (
            <li key={dayKey || `${day}-${i}`} className={isOpen ? 'open' : ''}>
              <button
                type="button"
                className="daily-row"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
              >
                <span className="d-day" title={formatDay(day, weather.timezone)}>
                  {relLabel ?? weekday}
                  {relLabel ? (
                    <span className="d-day-sub">{weekday}</span>
                  ) : null}
                </span>
                <span className="d-icon" title={info.label}>
                  <WeatherIcon3D
                    code={d.weather_code[i]}
                    isDay
                    size="sm"
                    forceAnimate={i === todayIdx}
                  />
                </span>
                <span className={`d-pop ${pop >= 40 ? 'wet' : ''}`}>
                  {pop > 0 ? `${pop}%` : ''}
                </span>
                <span className="d-lo">{formatTemp(d.temperature_2m_min[i], units)}</span>
                <div className="temp-range" aria-hidden>
                  <div className="temp-range-track">
                    <div
                      className="temp-range-fill"
                      style={{ left: `${left}%`, width: `${width}%` }}
                    />
                  </div>
                </div>
                <span className="d-hi">{formatTemp(d.temperature_2m_max[i], units)}</span>
              </button>
              {isOpen && (
                <div className="daily-detail">
                  <div className="detail-grid mini">
                    <div>
                      <span className="label">Condition</span>
                      <span className="value">{info.description}</span>
                    </div>
                    <div>
                      <span className="label">Date</span>
                      <span className="value">{formatDay(day, weather.timezone)}</span>
                    </div>
                    <div>
                      <span className="label">Precip</span>
                      <span className="value">
                        {formatPrecip(d.precipitation_sum[i], units)}
                        {d.snowfall_sum[i] > 0 &&
                          ` · snow ${formatPrecip(d.snowfall_sum[i] * 10, units)}`}
                      </span>
                    </div>
                    <div>
                      <span className="label">Wind</span>
                      <span className="value">
                        {formatSpeed(d.wind_speed_10m_max[i], units)}{' '}
                        {windDirection(d.wind_direction_10m_dominant[i])}
                        <span className="muted">
                          {' '}
                          gust {formatSpeed(d.wind_gusts_10m_max[i], units)}
                        </span>
                      </span>
                    </div>
                    <div>
                      <span className="label">UV max</span>
                      <span className="value">{d.uv_index_max[i]?.toFixed(1) ?? '—'}</span>
                    </div>
                    <div>
                      <span className="label">Sun</span>
                      <span className="value">
                        ↑{' '}
                        {new Date(d.sunrise[i]).toLocaleTimeString(undefined, {
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: weather.timezone,
                        })}{' '}
                        · ↓{' '}
                        {new Date(d.sunset[i]).toLocaleTimeString(undefined, {
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: weather.timezone,
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {canExpand && !expanded && (
        <div className="daily-expand-footer">
          <button
            type="button"
            className="chip-btn daily-expand-btn daily-expand-btn-wide"
            onClick={() => setExpanded(true)}
          >
            Show full 14-day outlook
          </button>
        </div>
      )}
    </section>
  )
}
