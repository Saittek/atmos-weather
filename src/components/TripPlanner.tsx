/**
 * Polished trip planner: weekend/3/5-day strip for current place + multi-city compare.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LocationResult, WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { formatTemp } from '../utils/format'
import { getWeatherInfo } from '../utils/weatherCodes'
import { clothingTips } from '../utils/tips'
import { fetchWeather, searchLocations } from '../api/weather'

interface Props {
  weather: WeatherData
  units: Units
  placeName: string
  /** Current dashboard place — always destination #1 */
  origin?: LocationResult | null
}

type Range = 'weekend' | '3day' | '5day'

interface DestWeather {
  loc: LocationResult
  weather: WeatherData | null
  error?: string
  loading?: boolean
}

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

function dayIndices(weather: WeatherData, range: Range): number[] {
  const d = weather.daily
  const tz = weather.timezone
  const idxs: number[] = []
  if (range === 'weekend') {
    for (let i = 0; i < Math.min(d.time.length, 8); i++) {
      const wd = localDow(d.time[i], tz)
      if (wd === 0 || wd === 6 || wd === 5) idxs.push(i)
    }
    return idxs.slice(0, 3)
  }
  const n = range === '3day' ? 3 : 5
  return Array.from({ length: n }, (_, i) => i).filter((i) => i < d.time.length)
}

function scoreDay(pop: number, precip: number, high: number, units: Units): number {
  const hotCut = units === 'metric' ? 30 : 86
  return (100 - pop) + (precip < 1 ? 20 : 0) + (high > 10 && high < hotCut ? 10 : 0)
}

export function TripPlanner({ weather, units, placeName, origin }: Props) {
  const [range, setRange] = useState<Range>('weekend')
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [hits, setHits] = useState<LocationResult[]>([])
  const [dests, setDests] = useState<DestWeather[]>([])

  // Seed with current place weather
  useEffect(() => {
    if (!origin) {
      setDests([
        {
          loc: {
            id: 0,
            name: placeName,
            latitude: weather.latitude,
            longitude: weather.longitude,
          },
          weather,
        },
      ])
      return
    }
    setDests((prev) => {
      const others = prev.filter(
        (d) =>
          Math.abs(d.loc.latitude - origin.latitude) > 0.01 ||
          Math.abs(d.loc.longitude - origin.longitude) > 0.01,
      )
      return [{ loc: origin, weather }, ...others]
    })
  }, [origin, placeName, weather])

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([])
      return
    }
    let cancelled = false
    setSearching(true)
    const t = window.setTimeout(() => {
      void searchLocations(q)
        .then((r) => {
          if (!cancelled) setHits(r.slice(0, 6))
        })
        .catch(() => {
          if (!cancelled) setHits([])
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 280)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [q])

  const addDest = useCallback(async (loc: LocationResult) => {
    setQ('')
    setHits([])
    setDests((prev) => {
      if (
        prev.some(
          (d) =>
            Math.abs(d.loc.latitude - loc.latitude) < 0.05 &&
            Math.abs(d.loc.longitude - loc.longitude) < 0.05,
        )
      ) {
        return prev
      }
      return [...prev, { loc, weather: null, loading: true }].slice(0, 4)
    })
    try {
      const w = await fetchWeather(loc.latitude, loc.longitude, { lite: true })
      setDests((prev) =>
        prev.map((d) =>
          d.loc.latitude === loc.latitude && d.loc.longitude === loc.longitude
            ? { loc, weather: w, loading: false }
            : d,
        ),
      )
    } catch {
      setDests((prev) =>
        prev.map((d) =>
          d.loc.latitude === loc.latitude && d.loc.longitude === loc.longitude
            ? { ...d, loading: false, error: 'Forecast failed' }
            : d,
        ),
      )
    }
  }, [])

  const removeDest = (loc: LocationResult) => {
    setDests((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter(
        (d) =>
          d.loc.latitude !== loc.latitude || d.loc.longitude !== loc.longitude,
      )
    })
  }

  const primary = dests[0]?.weather || weather
  const indices = useMemo(() => dayIndices(primary, range), [primary, range])
  const pack = clothingTips(weather, units)

  const cityDays = dests.map((d) => {
    const w = d.weather
    if (!w) {
      return { dest: d, days: [] as ReturnType<typeof buildDays> }
    }
    return { dest: d, days: buildDays(w, indices, units) }
  })

  function buildDays(w: WeatherData, idxs: number[], u: Units) {
    const d = w.daily
    const tz = w.timezone
    return idxs.map((i) => {
      const info = getWeatherInfo(d.weather_code[i], true)
      return {
        i,
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
        score: scoreDay(
          d.precipitation_probability_max[i] ?? 0,
          d.precipitation_sum[i] ?? 0,
          d.temperature_2m_max[i],
          u,
        ),
      }
    })
  }

  // Best city×day for outdoor
  let best: { city: string; day: string; score: number } | null = null
  for (const row of cityDays) {
    for (const day of row.days) {
      if (!best || day.score > best.score) {
        best = {
          city: row.dest.loc.name,
          day: day.label,
          score: day.score,
        }
      }
    }
  }

  return (
    <section className="panel trip-panel">
      <div className="panel-header">
        <h2>🧳 Trip planner</h2>
        <span className="panel-hint">Weekend & multi-city</span>
      </div>

      <div className="trip-ranges" role="group" aria-label="Trip length">
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

      <div className="trip-add-city">
        <label className="sr-only" htmlFor="trip-city-search">
          Add a city to compare
        </label>
        <input
          id="trip-city-search"
          type="search"
          placeholder="Add another city to compare…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
        {searching && <span className="trip-searching">Searching…</span>}
        {hits.length > 0 && (
          <ul className="trip-city-hits">
            {hits.map((h) => (
              <li key={`${h.latitude}-${h.longitude}`}>
                <button type="button" onClick={() => void addDest(h)}>
                  {h.name}
                  <span>
                    {[h.admin1, h.country].filter(Boolean).join(', ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {best && (
        <p className="trip-best">
          Best outdoor window: <strong>{best.day}</strong>
          {dests.length > 1 ? (
            <>
              {' '}
              in <strong>{best.city}</strong>
            </>
          ) : null}
        </p>
      )}

      <div className={`trip-cities ${dests.length > 1 ? 'multi' : ''}`}>
        {cityDays.map(({ dest, days }) => (
          <article key={`${dest.loc.latitude}-${dest.loc.longitude}`} className="trip-city-card">
            <header className="trip-city-head">
              <h3>{dest.loc.name}</h3>
              {dests.length > 1 && (
                <button
                  type="button"
                  className="chip-btn"
                  onClick={() => removeDest(dest.loc)}
                  aria-label={`Remove ${dest.loc.name}`}
                >
                  ✕
                </button>
              )}
            </header>
            {dest.loading && <p className="muted-center">Loading forecast…</p>}
            {dest.error && <p className="muted-center">{dest.error}</p>}
            {!dest.loading && !dest.error && days.length > 0 && (
              <ul className="trip-day-strip">
                {days.map((day) => (
                  <li key={day.label} className={day.score >= 90 ? 'is-best' : ''}>
                    <span className="trip-day-label">{day.label}</span>
                    <span className="trip-day-icon" aria-hidden>
                      {day.info.icon || '🌤'}
                    </span>
                    <span className="trip-day-hi">
                      {formatTemp(day.high, units)}
                      <em>/{formatTemp(day.low, units)}</em>
                    </span>
                    <span className="trip-day-pop">{Math.round(day.pop)}%</span>
                    <span className="trip-day-wx">{day.info.label}</span>
                  </li>
                ))}
              </ul>
            )}
            {!dest.loading && !days.length && !dest.error && (
              <p className="muted-center">Not enough forecast days yet.</p>
            )}
          </article>
        ))}
      </div>

      <div className="trip-pack">
        <strong>Pack list</strong>
        <ul>
          {pack.slice(0, 5).map((t) => (
            <li key={t}>{t}</li>
          ))}
          {cityDays.some((c) => c.days.some((d) => d.pop >= 40)) && (
            <li>Pack a rain shell / compact umbrella</li>
          )}
          {cityDays.some((c) =>
            c.days.some((d) => d.high >= (units === 'metric' ? 30 : 86)),
          ) && <li>Sunscreen, hat, extra water</li>}
          {cityDays.some((c) => c.days.some((d) => d.wind >= 40)) && (
            <li>Windbreaker — gusty stretches</li>
          )}
        </ul>
      </div>
    </section>
  )
}
