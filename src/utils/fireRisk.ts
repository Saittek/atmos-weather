import type { AirQualityData, WeatherData } from '../api/types'
import { aqiLabel } from './weatherCodes'

export interface FireSmokeInfo {
  fireLevel: 'low' | 'moderate' | 'elevated' | 'high'
  fireLabel: string
  fireDetail: string
  smokeLevel: string
  smokeColor: string
  smokeAdvice: string
  pm25: number | null
}

/** Heuristic fire-weather + smoke snapshot from current conditions + AQI */
export function fireSmokeRisk(
  weather: WeatherData,
  air: AirQualityData | null,
): FireSmokeInfo {
  const t = weather.current.temperature_2m
  const rh = weather.current.relative_humidity_2m
  const wind = weather.current.wind_speed_10m
  const gust = weather.current.wind_gusts_10m
  const precip = weather.current.precipitation
  const code = weather.current.weather_code

  // Simple red-flag-ish score (not an official NWS product)
  let score = 0
  if (t >= 30) score += 2
  else if (t >= 24) score += 1
  if (rh <= 15) score += 3
  else if (rh <= 25) score += 2
  else if (rh <= 35) score += 1
  if (gust >= 50 || wind >= 35) score += 3
  else if (gust >= 35 || wind >= 25) score += 2
  else if (wind >= 18) score += 1
  if (precip > 0.2 || code >= 51) score -= 3
  if ((weather.daily.precipitation_sum?.[0] ?? 0) > 2) score -= 2

  let fireLevel: FireSmokeInfo['fireLevel'] = 'low'
  if (score >= 7) fireLevel = 'high'
  else if (score >= 5) fireLevel = 'elevated'
  else if (score >= 3) fireLevel = 'moderate'

  const fireLabel =
    fireLevel === 'high'
      ? 'High fire-weather risk'
      : fireLevel === 'elevated'
        ? 'Elevated fire-weather risk'
        : fireLevel === 'moderate'
          ? 'Moderate fire-weather concern'
          : 'Low fire-weather risk'

  const fireDetail =
    fireLevel === 'low'
      ? `Humidity ${rh}%, winds ${Math.round(wind)} km/h — not a classic red-flag setup.`
      : `Hot/dry/windy combo: ${Math.round(t)}°C, RH ${rh}%, gusts ${Math.round(gust)} km/h. Avoid open flames; check local burn bans.`

  const pm25 = air?.current?.pm2_5 ?? null
  const aqi = air?.current?.us_aqi ?? 0
  const aqiInfo = aqiLabel(aqi || (pm25 != null ? pm25 * 2 : 0))

  let smokeAdvice = aqiInfo.advice
  if (pm25 != null && pm25 >= 55) {
    smokeAdvice = 'Elevated fine particles — limit outdoor exertion; consider a mask if smoky.'
  } else if (pm25 != null && pm25 >= 35) {
    smokeAdvice = 'Particles a bit high — sensitive groups should take it easy outside.'
  }

  return {
    fireLevel,
    fireLabel,
    fireDetail,
    smokeLevel: aqiInfo.label,
    smokeColor: aqiInfo.color,
    smokeAdvice,
    pm25,
  }
}
