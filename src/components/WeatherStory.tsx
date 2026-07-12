import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { weatherStory } from '../utils/weatherStory'

interface Props {
  weather: WeatherData
  units: Units
  placeName: string
}

export function WeatherStory({ weather, units, placeName }: Props) {
  const story = weatherStory(weather, units, placeName)
  return (
    <section className="panel story-panel">
      <div className="panel-header">
        <h2>📰 Today’s weather story</h2>
      </div>
      <p className="story-text">{story}</p>
    </section>
  )
}
