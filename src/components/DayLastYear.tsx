import { useEffect, useState } from 'react'
import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { formatPrecip, formatTemp } from '../utils/format'
import { todayDailyIndex } from '../utils/weatherStory'

interface Props {
  weather: WeatherData
  units: Units
  lat: number
  lon: number
}

interface HistDay {
  high: number
  low: number
  precip: number
  year: number
}

export function DayLastYear({ weather, units, lat, lon }: Props) {
  const [hist, setHist] = useState<HistDay | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const now = new Date()
    const year = now.getUTCFullYear() - 1
    const month = String(now.getUTCMonth() + 1).padStart(2, '0')
    const day = String(now.getUTCDate()).padStart(2, '0')
    const date = `${year}-${month}-${day}`
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`

    setLoading(true)
    void fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.daily) return
        setHist({
          high: data.daily.temperature_2m_max?.[0],
          low: data.daily.temperature_2m_min?.[0],
          precip: data.daily.precipitation_sum?.[0] ?? 0,
          year,
        })
      })
      .catch(() => {
        if (!cancelled) setHist(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [lat, lon])

  const ti = todayDailyIndex(weather)
  const todayHi = weather.daily.temperature_2m_max[ti]
  const todayLo = weather.daily.temperature_2m_min[ti]

  return (
    <section className="panel day-last-year-panel">
      <div className="panel-header">
        <h2>📅 This day last year</h2>
      </div>
      {loading && <p className="muted-center">Loading archive…</p>}
      {!loading && !hist && (
        <p className="muted-center">Archive unavailable for this date.</p>
      )}
      {!loading && hist && hist.high != null && (
        <div className="last-year-grid">
          <div>
            <span className="label">Today</span>
            <strong>
              {formatTemp(todayHi, units)} / {formatTemp(todayLo, units)}
            </strong>
          </div>
          <div>
            <span className="label">{hist.year}</span>
            <strong>
              {formatTemp(hist.high, units)} / {formatTemp(hist.low, units)}
            </strong>
            <span className="muted">Precip {formatPrecip(hist.precip, units)}</span>
          </div>
        </div>
      )}
    </section>
  )
}
