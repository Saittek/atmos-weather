import { useMemo } from 'react'
import type { ModelSeries, WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { summarizeModelConfidence } from '../utils/modelConfidence'

interface Props {
  models: ModelSeries[]
  weather: WeatherData | null
  units: Units
}

export function ModelConfidence({ models, weather, units }: Props) {
  const summary = useMemo(
    () => summarizeModelConfidence(models, weather, units),
    [models, weather, units],
  )
  if (!summary) return null

  const highRange =
    summary.highTemp.values.length >= 2
      ? `${Math.round(Math.min(...summary.highTemp.values.map((v) => v.value)))}–${Math.round(
          Math.max(...summary.highTemp.values.map((v) => v.value)),
        )}${summary.highTemp.unit}`
      : null

  const precipRange =
    summary.precip.values.length >= 2
      ? `${Math.min(...summary.precip.values.map((v) => v.value)).toFixed(1)}–${Math.max(
          ...summary.precip.values.map((v) => v.value),
        ).toFixed(1)} mm`
      : null

  return (
    <section
      className={`model-confidence conf-${summary.overall}`}
      aria-label="Model confidence"
    >
      <div className="mc-top">
        <span className="mc-badge" aria-hidden>
          {summary.overall === 'high' ? '✓' : summary.overall === 'moderate' ? '~' : '!'}
        </span>
        <div>
          <p className="mc-kicker">Model check</p>
          <h2 className="mc-headline">{summary.headline}</h2>
        </div>
      </div>
      <ul className="mc-list">
        <li className={`mc-item conf-${summary.highTemp.level}`}>
          <strong>High temp</strong>
          <span>{summary.highTemp.label}</span>
          {highRange && <em>Spread {highRange}</em>}
        </li>
        <li className={`mc-item conf-${summary.precip.level}`}>
          <strong>Precip total</strong>
          <span>{summary.precip.label}</span>
          {precipRange && <em>Spread {precipRange}</em>}
        </li>
      </ul>
    </section>
  )
}
