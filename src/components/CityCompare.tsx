import { useState } from 'react'
import { fetchWeather, searchLocations, formatLocationLabel } from '../api/weather'
import type { LocationResult, WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import {
  formatTemp,
  formatPrecip,
  formatSpeed,
} from '../utils/format'
import { isDaytimeNow } from '../utils/daylight'
import { getWeatherInfo } from '../utils/weatherCodes'
import { willIGetWet } from '../utils/wetSummary'

interface Props {
  units: Units
  home: LocationResult | null
  homeWeather: WeatherData | null
}

interface Side {
  loc: LocationResult
  weather: WeatherData
}

export function CityCompare({ units, home, homeWeather }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LocationResult[]>([])
  const [b, setB] = useState<Side | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const a: Side | null =
    home && homeWeather ? { loc: home, weather: homeWeather } : null

  const search = async (q: string) => {
    setQuery(q)
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    try {
      setResults(await searchLocations(q))
    } catch {
      setResults([])
    }
  }

  const pick = async (loc: LocationResult) => {
    setBusy(true)
    setErr(null)
    setResults([])
    setQuery(loc.name)
    try {
      const weather = await fetchWeather(loc.latitude, loc.longitude)
      setB({ loc, weather })
    } catch {
      setErr('Could not load comparison location')
    } finally {
      setBusy(false)
    }
  }

  const card = (side: Side, label: string) => {
    const c = side.weather.current
    const info = getWeatherInfo(c.weather_code, isDaytimeNow(side.weather))
    const wet = willIGetWet(side.weather)
    const d = side.weather.daily
    return (
      <div className="compare-card">
        <span className="compare-tag">{label}</span>
        <h3>{side.loc.name}</h3>
        <p className="compare-meta">
          {formatLocationLabel(side.loc).replace(`${side.loc.name}, `, '')}
        </p>
        <div className="compare-main">
          <span className="compare-icon">{info.icon}</span>
          <span className="compare-temp">{formatTemp(c.temperature_2m, units)}</span>
        </div>
        <p>{info.label}</p>
        <ul className="compare-stats">
          <li>
            Today H/L {formatTemp(d.temperature_2m_max[0], units)} /{' '}
            {formatTemp(d.temperature_2m_min[0], units)}
          </li>
          <li>
            Precip today {formatPrecip(d.precipitation_sum[0], units)} · pop{' '}
            {d.precipitation_probability_max[0] ?? 0}%
          </li>
          <li>Wind {formatSpeed(c.wind_speed_10m, units)}</li>
          <li className={`wet-line ${wet.level}`}>{wet.title}</li>
        </ul>
      </div>
    )
  }

  return (
    <section className="panel compare-panel">
      <div className="panel-header">
        <h2>⚖️ Compare cities</h2>
      </div>
      <p className="compare-intro">
        Side-by-side with your current place. Search a second city for travel planning.
      </p>
      <div className="compare-search">
        <input
          type="search"
          placeholder="Compare with city…"
          value={query}
          onChange={(e) => void search(e.target.value)}
          aria-label="Compare location search"
        />
        {busy && <span className="search-spinner" />}
      </div>
      {results.length > 0 && (
        <ul className="compare-results">
          {results.slice(0, 6).map((r) => (
            <li key={`${r.id}-${r.latitude}`}>
              <button type="button" onClick={() => void pick(r)}>
                {formatLocationLabel(r)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {err && <p className="auth-error">{err}</p>}
      <div className="compare-grid">
        {a ? card(a, 'Here') : <div className="compare-card empty">Load a location first</div>}
        {b ? (
          card(b, 'There')
        ) : (
          <div className="compare-card empty">Pick a city above to compare</div>
        )}
      </div>
    </section>
  )
}
