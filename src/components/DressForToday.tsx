import type { AirQualityData, WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { dressForToday } from '../utils/dressForToday'

interface Props {
  weather: WeatherData
  units: Units
  air: AirQualityData | null
}

export function DressForToday({ weather, units, air }: Props) {
  const d = dressForToday(weather, units, air)

  return (
    <section className={`panel dress-panel layers-${d.layers}`} aria-label="Dress for today">
      <div className="dress-row">
        <div className="dress-emoji" aria-hidden>
          {d.emoji}
        </div>
        <div className="dress-copy">
          <p className="dress-kicker">Dress for today</p>
          <h2 className="dress-title">{d.title}</h2>
          <p className="dress-summary">{d.summary}</p>
        </div>
      </div>
      <ul className="dress-list">
        {d.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}
