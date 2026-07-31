/**
 * Fri–Sun morning style weekend outlook card.
 */
import { useMemo } from 'react'
import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import {
  convertTemp,
  formatPrecipAmount,
  formatSpeed,
  hasPrecipMm,
  parseWeatherLocal,
  precipUnit,
} from '../utils/format'
import { getWeatherInfo } from '../utils/weatherCodes'
import { todayDailyIndex } from '../utils/weatherStory'

interface Props {
  weather: WeatherData
  units: Units
  placeName: string
}

function weekdayInTz(ms: number, tz: string): number {
  // 0=Sun … 6=Sat
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  }).formatToParts(new Date(ms))
  const w = parts.find((p) => p.type === 'weekday')?.value ?? ''
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  return map[w] ?? new Date(ms).getDay()
}

function shouldShowWeekendBrief(weather: WeatherData): boolean {
  const tz = weather.timezone
  const now = Date.now()
  const dow = weekdayInTz(now, tz)
  // Fri, Sat, Sun
  if (dow !== 5 && dow !== 6 && dow !== 0) return false
  // Prefer morning local (before 14:00) but show all day Fri–Sun
  return true
}

export function WeekendBrief({ weather, units, placeName }: Props) {
  const data = useMemo(() => {
    if (!shouldShowWeekendBrief(weather)) return null
    const tz = weather.timezone
    const ti = todayDailyIndex(weather)
    const days: {
      label: string
      hi: number
      lo: number
      pop: number
      precip: number
      code: number
      wind: number
    }[] = []

    for (let i = ti; i < weather.daily.time.length && days.length < 3; i++) {
      const ms = parseWeatherLocal(weather.daily.time[i], tz)
      const dow = weekdayInTz(ms, tz)
      // From today through weekend: Fri→Sun, Sat→Sun, Sun→Sun only
      if (dow === 5 || dow === 6 || dow === 0) {
        const label = new Intl.DateTimeFormat(undefined, {
          timeZone: tz,
          weekday: 'short',
        }).format(new Date(ms))
        days.push({
          label,
          hi: weather.daily.temperature_2m_max[i],
          lo: weather.daily.temperature_2m_min[i],
          pop: weather.daily.precipitation_probability_max[i] ?? 0,
          precip: weather.daily.precipitation_sum[i] ?? 0,
          code: weather.daily.weather_code[i] ?? 0,
          wind: weather.daily.wind_speed_10m_max[i] ?? 0,
        })
      }
      // Stop after Sunday in the daily array when we started mid-weekend
      if (days.length && dow === 0 && i > ti) break
    }

    if (!days.length) return null

    const wetDays = days.filter((d) => d.pop >= 40 || d.precip >= 1)
    const best = [...days].sort((a, b) => b.hi - a.hi && a.pop - b.pop)[0]
    const tip =
      wetDays.length >= 2
        ? 'Pack a rain layer — wet stretch this weekend.'
        : wetDays.length === 1
          ? `${wetDays[0].label} looks wettest — plan outdoor time around it.`
          : best
            ? `${best.label} looks nicest for being outside.`
            : 'Solid weekend overall.'

    return { days, tip }
  }, [weather])

  if (!data) return null

  return (
    <section className="panel weekend-brief" aria-label="Weekend brief">
      <div className="panel-header">
        <h2>Weekend brief</h2>
        <span className="panel-hint">{placeName}</span>
      </div>
      <p className="weekend-brief-tip">{data.tip}</p>
      <div className="weekend-brief-days">
        {data.days.map((d) => {
          const info = getWeatherInfo(d.code, true)
          return (
            <div key={d.label} className="weekend-day">
              <span className="weekend-day-name">{d.label}</span>
              <span className="weekend-day-icon" aria-hidden>
                {info.icon || '🌤'}
              </span>
              <span className="weekend-day-hl">
                {Math.round(convertTemp(d.hi, units))}° /{' '}
                {Math.round(convertTemp(d.lo, units))}°
              </span>
              <span className="weekend-day-meta">
                💧 {Math.round(d.pop)}%
                {hasPrecipMm(d.precip)
                  ? ` · ${formatPrecipAmount(d.precip, units)}${precipUnit(units)}`
                  : ''}
              </span>
              <span className="weekend-day-meta">💨 {formatSpeed(d.wind, units)}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
