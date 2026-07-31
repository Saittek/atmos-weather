/**
 * “What’s changed since last open” strip under Today.
 */
import { useEffect, useMemo, useState } from 'react'
import type { LocationResult, WeatherAlert, WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import {
  computeWeatherDelta,
  savePlaceSnapshot,
  type WeatherDelta,
} from '../utils/weatherDelta'

interface Props {
  location: LocationResult
  weather: WeatherData
  alerts: WeatherAlert[]
  units: Units
}

export function WhatChanged({ location, weather, alerts, units }: Props) {
  const [delta, setDelta] = useState<WeatherDelta | null>(null)

  // Compute once against previous snapshot, then save current for next visit
  useEffect(() => {
    const d = computeWeatherDelta(location, weather, alerts, units)
    setDelta(d)
    // Persist after paint so next open can compare
    const t = window.setTimeout(() => {
      savePlaceSnapshot(location, weather, alerts)
    }, 800)
    return () => window.clearTimeout(t)
  }, [
    location.latitude,
    location.longitude,
    weather.current?.time,
    weather.current?.temperature_2m,
    alerts.length,
    units,
  ])

  const body = useMemo(() => {
    if (!delta) return null
    return delta
  }, [delta])

  if (!body) return null

  return (
    <section
      className={`panel what-changed ${body.significant ? 'is-significant' : 'is-quiet'}`}
      aria-label="What changed since last open"
    >
      <div className="what-changed-head">
        <strong>What changed</strong>
        <span>vs last open · {body.ageLabel}</span>
      </div>
      <ul className="what-changed-list">
        {body.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  )
}
