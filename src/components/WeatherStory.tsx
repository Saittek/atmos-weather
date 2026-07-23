import type { AirQualityData, WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { weatherStory } from '../utils/weatherStory'

interface Props {
  weather: WeatherData
  units: Units
  placeName: string
  air?: AirQualityData | null
}

export function WeatherStory({ weather, units, placeName, air = null }: Props) {
  const story = weatherStory(weather, units, placeName, air)
  return (
    <section className="panel story-panel">
      <div className="panel-header">
        <h2>📰 Today’s weather story</h2>
      </div>
      <p className="story-text">{story}</p>
    </section>
  )
}
