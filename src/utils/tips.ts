import type { WeatherData } from '../api/types'
import type { Units } from './format'
import { convertSpeed, convertTemp, parseWeatherLocal } from './format'
import { isDaytimeNow } from './daylight'
import { getWeatherInfo } from './weatherCodes'

export interface ActivityTip {
  icon: string
  title: string
  detail: string
  score: 'great' | 'ok' | 'poor'
}

export function clothingTips(weather: WeatherData, units: Units): string[] {
  const t = convertTemp(weather.current.temperature_2m, units)
  const feels = convertTemp(weather.current.apparent_temperature, units)
  const wind = convertSpeed(weather.current.wind_speed_10m, units)
  const precip = weather.current.precipitation
  const code = weather.current.weather_code
  const unit = units === 'metric' ? 'C' : 'F'
  const cold = units === 'metric' ? 5 : 40
  const cool = units === 'metric' ? 15 : 60
  const warm = units === 'metric' ? 24 : 75
  const hot = units === 'metric' ? 30 : 86

  const tips: string[] = []

  if (feels <= cold) tips.push('Heavy coat, layers, and warm footwear')
  else if (feels <= cool) tips.push('Light jacket or sweater recommended')
  else if (feels <= warm) tips.push('Comfortable in a t-shirt or light layers')
  else if (feels <= hot) tips.push('Light breathable clothes; sun hat helps')
  else tips.push('Heat alert: light clothes, hydrate, limit midday sun')

  if (precip > 0.1 || [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) {
    tips.push('Bring a rain jacket or umbrella')
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    tips.push('Snow expected — waterproof boots and gloves')
  }
  if (wind > (units === 'metric' ? 30 : 18)) {
    tips.push('Windy — secure loose layers and hats')
  }

  const uv = weather.hourly.uv_index?.[0] ?? 0
  if (uv >= 6) tips.push('Strong UV — sunscreen and sunglasses')

  tips.push(`Feels like ${Math.round(feels)}°${unit} (air ${Math.round(t)}°${unit})`)
  return tips
}

export function activityTips(weather: WeatherData, units: Units): ActivityTip[] {
  const feels = convertTemp(weather.current.apparent_temperature, units)
  const wind = convertSpeed(weather.current.wind_speed_10m, units)
  const precip = weather.current.precipitation
  const pop =
    weather.hourly.precipitation_probability?.[
      Math.max(
        0,
        weather.hourly.time.findIndex(
          (t) => parseWeatherLocal(t, weather.timezone) >= Date.now() - 1800000,
        ),
      )
    ] ?? 0
  const code = weather.current.weather_code
  const storm = code >= 95
  const info = getWeatherInfo(code, isDaytimeNow(weather))

  const mildLow = units === 'metric' ? 8 : 46
  const mildHigh = units === 'metric' ? 28 : 82
  const runOk = feels >= mildLow && feels <= mildHigh && precip < 0.5 && !storm && pop < 70
  const outdoorOk = !storm && precip < 1 && pop < 60
  const photoOk = weather.current.cloud_cover < 70 && precip < 0.2

  return [
    {
      icon: '🏃',
      title: 'Running / walk',
      detail: runOk
        ? `Good conditions — ${info.label.toLowerCase()}`
        : storm
          ? 'Skip outdoor cardio — thunderstorm risk'
          : pop >= 60 || precip > 0.5
            ? 'Wet — treadmill or covered route'
            : 'Bundle up or cool down as needed',
      score: runOk ? 'great' : storm || precip > 1 ? 'poor' : 'ok',
    },
    {
      icon: '🚲',
      title: 'Cycling',
      detail:
        wind > (units === 'metric' ? 35 : 22)
          ? 'Strong wind — careful on exposed roads'
          : outdoorOk && feels > mildLow
            ? 'Decent for a ride'
            : 'Not ideal — wet or rough conditions',
      score:
        outdoorOk && feels > mildLow && wind < (units === 'metric' ? 35 : 22)
          ? 'great'
          : storm
            ? 'poor'
            : 'ok',
    },
    {
      icon: '🧺',
      title: 'Outdoor plans',
      detail: outdoorOk
        ? `Alright for outdoor time (${info.label})`
        : 'Better as an indoor day',
      score: outdoorOk ? (pop < 30 ? 'great' : 'ok') : 'poor',
    },
    {
      icon: '📷',
      title: 'Photography',
      detail: photoOk
        ? weather.current.cloud_cover < 30
          ? 'Clear light — golden hour will pop'
          : 'Soft cloud light — good for portraits'
        : 'Flat or wet light — wait it out',
      score: photoOk ? 'great' : 'ok',
    },
  ]
}
