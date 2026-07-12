import { useEffect, useState } from 'react'
import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { convertTemp, formatPrecip, formatTemp } from '../utils/format'
import { fetchClimateNormal } from '../api/weather'
import { todayDailyIndex, yesterdayDailyIndex } from '../utils/weatherStory'

interface Props {
  weather: WeatherData
  units: Units
  lat: number
  lon: number
}

export function ClimateCompare({ weather, units, lat, lon }: Props) {
  const [normal, setNormal] = useState<{
    avgHigh: number
    avgLow: number
    avgPrecip: number
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetchClimateNormal(lat, lon).then((n) => {
      if (!cancelled) {
        setNormal(n)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [lat, lon])

  const ti = todayDailyIndex(weather)
  const yi = yesterdayDailyIndex(weather)
  const d = weather.daily
  const todayHi = d.temperature_2m_max[ti]
  const todayLo = d.temperature_2m_min[ti]
  const todayPrecip = d.precipitation_sum[ti] ?? 0

  let vsNormal = ''
  if (normal) {
    const diff = Math.round(convertTemp(todayHi, units) - convertTemp(normal.avgHigh, units))
    if (Math.abs(diff) < 2) vsNormal = 'Near normal for this date'
    else if (diff > 0) vsNormal = `About ${diff}° above the recent multi-year average high`
    else vsNormal = `About ${Math.abs(diff)}° below the recent multi-year average high`
  }

  return (
    <section className="panel climate-panel">
      <div className="panel-header">
        <h2>📊 Today vs normal</h2>
      </div>
      <div className="climate-grid">
        <div>
          <span className="label">Today</span>
          <strong>
            {formatTemp(todayHi, units)} / {formatTemp(todayLo, units)}
          </strong>
          <span className="sub">Precip {formatPrecip(todayPrecip, units)}</span>
        </div>
        {yi != null && (
          <div>
            <span className="label">Yesterday</span>
            <strong>
              {formatTemp(d.temperature_2m_max[yi], units)} /{' '}
              {formatTemp(d.temperature_2m_min[yi], units)}
            </strong>
            <span className="sub">
              Precip {formatPrecip(d.precipitation_sum[yi] ?? 0, units)}
            </span>
          </div>
        )}
        <div>
          <span className="label">Typical (10-yr sample)</span>
          {loading && <strong>…</strong>}
          {!loading && normal && (
            <>
              <strong>
                {formatTemp(normal.avgHigh, units)} / {formatTemp(normal.avgLow, units)}
              </strong>
              <span className="sub">
                Avg precip {formatPrecip(normal.avgPrecip, units)}
              </span>
            </>
          )}
          {!loading && !normal && <strong className="sub">Unavailable</strong>}
        </div>
      </div>
      {vsNormal && <p className="climate-note">{vsNormal}</p>}
      <p className="model-note">
        “Normal” is a multi-year archive average for this calendar date — not official climate
        normals.
      </p>
    </section>
  )
}
