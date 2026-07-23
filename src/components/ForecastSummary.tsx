/**
 * Plain-language day summary — competitors lead with this (Apple, AccuWeather, Carrot).
 */
import type { AirQualityData, WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { weatherStory } from '../utils/weatherStory'
import { willIGetWet } from '../utils/wetSummary'

interface Props {
  weather: WeatherData
  units: Units
  placeName: string
  air?: AirQualityData | null
}

export function ForecastSummary({ weather, units, placeName, air = null }: Props) {
  const story = weatherStory(weather, units, placeName, air)
  const wet = willIGetWet(weather)

  return (
    <section className={`panel forecast-summary wet-${wet.level}`} aria-label="Today’s summary">
      <div className="panel-header">
        <h2>Today’s outlook</h2>
        <span className={`summary-wet-pill wet-${wet.level}`}>
          {wet.umbrella ? '☔ ' : ''}
          {wet.title}
        </span>
      </div>
      <p className="forecast-summary-text">{story}</p>
      <p className="forecast-summary-wet">{wet.detail}</p>
    </section>
  )
}
