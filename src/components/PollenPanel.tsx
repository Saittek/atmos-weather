/**
 * Back-compat wrapper — full UI lives in AllergySection.
 */
import type { AirQualityData, WeatherData } from '../api/types'
import { AllergySection } from './AllergySection'

interface Props {
  air: AirQualityData | null
  weather?: WeatherData | null
  compact?: boolean
}

export function PollenPanel({ air, weather = null, compact = false }: Props) {
  return <AllergySection air={air} weather={weather} compact={compact} />
}
