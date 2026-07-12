import type { WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { convertTemp, convertSpeed } from '../utils/format'
import { willIGetWet } from '../utils/wetSummary'
import { parseWeatherLocal } from '../utils/format'

interface Props {
  weather: WeatherData
  units: Units
}

type Score = 'great' | 'ok' | 'poor'

interface Row {
  icon: string
  title: string
  score: Score
  detail: string
}

function scoreDriving(weather: WeatherData): Row {
  const c = weather.current
  const wet = willIGetWet(weather)
  const visIdx = Math.max(
    0,
    weather.hourly.time.findIndex(
      (t) => parseWeatherLocal(t, weather.timezone) >= Date.now() - 1800000,
    ),
  )
  const vis = weather.hourly.visibility?.[visIdx] ?? 15000
  const wind = c.wind_gusts_10m
  const code = c.weather_code

  if (code >= 95 || wind >= 70 || vis < 1000 || wet.level === 'wet' && c.precipitation > 2) {
    return {
      icon: '🚗',
      title: 'Driving',
      score: 'poor',
      detail: 'Hazardous — storms, wind, or low visibility',
    }
  }
  if (wet.level !== 'dry' || wind >= 45 || vis < 4000 || code >= 61) {
    return {
      icon: '🚗',
      title: 'Driving',
      score: 'ok',
      detail: 'Use caution — wet roads or reduced visibility possible',
    }
  }
  return {
    icon: '🚗',
    title: 'Driving',
    score: 'great',
    detail: 'Generally favorable road weather',
  }
}

export function LifestyleScores({ weather, units }: Props) {
  const c = weather.current
  const wet = willIGetWet(weather)
  const t = convertTemp(c.apparent_temperature, units)
  const wind = convertSpeed(c.wind_speed_10m, units)
  const uv =
    weather.hourly.uv_index[
      Math.max(
        0,
        weather.hourly.time.findIndex(
          (x) => parseWeatherLocal(x, weather.timezone) >= Date.now() - 1800000,
        ),
      )
    ] ?? 0

  const mildLow = units === 'metric' ? 8 : 46
  const mildHigh = units === 'metric' ? 28 : 82

  const rows: Row[] = [
    scoreDriving(weather),
    {
      icon: '🏃',
      title: 'Exercise outdoors',
      score:
        wet.level === 'wet' || t < mildLow - 5 || t > mildHigh + 5
          ? 'poor'
          : wet.level === 'maybe' || t < mildLow || t > mildHigh
            ? 'ok'
            : 'great',
      detail:
        wet.level === 'wet'
          ? 'Wet — consider indoor workout'
          : t > mildHigh
            ? 'Heat stress risk — ease off midday'
            : t < mildLow
              ? 'Cold — warm up well'
              : 'Solid conditions for a run or walk',
    },
    {
      icon: '🐶',
      title: 'Dog walk',
      score: wet.level === 'wet' || c.weather_code >= 95 ? 'poor' : wet.level === 'maybe' ? 'ok' : 'great',
      detail:
        wet.level === 'dry'
          ? 'Good stretch of the legs weather'
          : 'Maybe a shorter loop or raincoat',
    },
    {
      icon: '🧺',
      title: 'Laundry outside',
      score:
        (weather.daily.precipitation_probability_max[0] ?? 0) >= 40 || wet.umbrella
          ? 'poor'
          : wind > (units === 'metric' ? 35 : 22)
            ? 'ok'
            : 'great',
      detail:
        wet.umbrella || (weather.daily.precipitation_probability_max[0] ?? 0) >= 40
          ? 'Rain risk — dry indoors'
          : 'Decent drying weather',
    },
    {
      icon: '🌞',
      title: 'Patio / park',
      score:
        wet.level === 'wet' || c.weather_code >= 95
          ? 'poor'
          : uv >= 8 && t > mildHigh
            ? 'ok'
            : wet.level === 'maybe'
              ? 'ok'
              : 'great',
      detail:
        wet.level === 'wet'
          ? 'Better as an indoor day'
          : uv >= 8
            ? 'Nice but strong sun — shade helps'
            : 'Enjoy being outside',
    },
    {
      icon: '✈️',
      title: 'Travel day',
      score:
        c.weather_code >= 95 || wind >= 60 || wet.level === 'wet'
          ? 'poor'
          : wet.level === 'maybe' || wind >= 40
            ? 'ok'
            : 'great',
      detail:
        c.weather_code >= 95
          ? 'Storm risk — check flight/road alerts'
          : 'Weather looks manageable for travel',
    },
  ]

  return (
    <section className="panel lifestyle-panel">
      <div className="panel-header">
        <h2>🎯 Lifestyle scores</h2>
      </div>
      <div className="activity-grid">
        {rows.map((a) => (
          <article key={a.title} className={`activity-card score-${a.score}`}>
            <span className="act-icon">{a.icon}</span>
            <div>
              <strong>{a.title}</strong>
              <p>{a.detail}</p>
            </div>
            <span className="act-score">{a.score}</span>
          </article>
        ))}
      </div>
    </section>
  )
}
