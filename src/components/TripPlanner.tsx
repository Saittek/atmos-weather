import { useMemo, useState } from 'react'
import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import {
  formatPrecip,
  formatTemp,
  formatSpeed,
} from '../utils/format'
import { getWeatherInfo } from '../utils/weatherCodes'
import { clothingTips } from '../utils/tips'

interface Props {
  weather: WeatherData
  units: Units
  placeName: string
}

type Range = 'weekend' | '3day' | '5day'

function localDow(iso: string, tz: string): number {
  try {
    const w = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
    }).format(new Date(iso))
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(w)
  } catch {
    return new Date(iso).getDay()
  }
}

export function TripPlanner({ weather, units, placeName }: Props) {
  const [range, setRange] = useState<Range>('weekend')
  const d = weather.daily
  const tz = weather.timezone

  const indices = useMemo(() => {
    const idxs: number[] = []
    if (range === 'weekend') {
      for (let i = 0; i < Math.min(d.time.length, 8); i++) {
        const wd = localDow(d.time[i], tz)
        if (wd === 0 || wd === 6 || wd === 5) idxs.push(i) // Fri–Sun
      }
      return idxs.slice(0, 3)
    }
    const n = range === '3day' ? 3 : 5
    return Array.from({ length: n }, (_, i) => i).filter((i) => i < d.time.length)
  }, [d.time, range, tz])

  const days = indices.map((i) => {
    const info = getWeatherInfo(d.weather_code[i], true)
    return {
      i,
      date: d.time[i],
      label: new Date(d.time[i]).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: tz,
      }),
      info,
      high: d.temperature_2m_max[i],
      low: d.temperature_2m_min[i],
      pop: d.precipitation_probability_max[i] ?? 0,
      precip: d.precipitation_sum[i] ?? 0,
      wind: d.wind_speed_10m_max[i] ?? 0,
      uv: d.uv_index_max[i] ?? 0,
    }
  })

  const wetDays = days.filter((x) => x.pop >= 40 || x.precip >= 1).length
  const hot = days.some((x) => x.high >= (units === 'metric' ? 30 : 86))
  // clothingTips uses current — still useful baseline
  const pack = clothingTips(weather, units)

  const extras: string[] = []
  if (wetDays > 0) extras.push('Pack a rain shell / compact umbrella')
  if (hot) extras.push('Sunscreen, hat, extra water')
  if (days.some((x) => x.wind >= 40)) extras.push('Windbreaker — gusty stretches')
  if (days.some((x) => x.uv >= 7)) extras.push('High UV — sunglasses + SPF')

  const best = [...days].sort((a, b) => {
    const score = (x: typeof days[0]) =>
      (100 - x.pop) + (x.precip < 1 ? 20 : 0) + (x.high > 10 && x.high < 32 ? 10 : 0)
    return score(b) - score(a)
  })[0]

  return (
    <section className="panel trip-panel">
      <div className="panel-header">
        <h2>🧳 Trip planner</h2>
        <span className="panel-hint">{placeName}</span>
      </div>

      <div className="trip-ranges">
        {(
          [
            ['weekend', 'Weekend'],
            ['3day', '3 days'],
            ['5day', '5 days'],
          ] as const
        ).map(([k, lab]) => (
          <button
            key={k}
            type="button"
            className={`chip-btn ${range === k ? 'active' : ''}`}
            onClick={() => setRange(k)}
          >
            {lab}
          </button>
        ))}
      </div>

      {!days.length ? (
        <p className="muted-center">Not enough forecast days yet.</p>
      ) : (
        <>
          {best && (
            <p className="trip-best">
              Best outdoor window: <strong>{best.label}</strong> — {best.info.label}, high{' '}
              {formatTemp(best.high, units)}, rain chance {best.pop}%.
            </p>
          )}
          <div className="trip-days">
            {days.map((day) => (
              <div className="trip-day" key={day.date}>
                <div className="trip-day-top">
                  <strong>{day.label}</strong>
                  <span>{day.info.icon}</span>
                </div>
                <div>
                  {formatTemp(day.high, units)} / {formatTemp(day.low, units)}
                </div>
                <div className="trip-day-meta">
                  {day.pop}% · {formatPrecip(day.precip, units)}
                  <br />
                  Wind {formatSpeed(day.wind, units)} · UV {day.uv.toFixed(0)}
                </div>
              </div>
            ))}
          </div>
          <div className="trip-pack">
            <strong>Pack list</strong>
            <ul>
              {[...new Set([...pack.slice(0, 3), ...extras])].map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  )
}
