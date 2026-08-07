import type { WeatherData } from '../api/types'
import { detectLocale } from '../i18n/messages'
import { parseWeatherLocal } from './format'

export interface WetSummary {
  title: string
  detail: string
  umbrella: boolean
  level: 'dry' | 'maybe' | 'wet'
}

/** Plain-language “will I get wet?” for the next ~12 hours (EN / FR) */
export function willIGetWet(weather: WeatherData): WetSummary {
  const fr = detectLocale() === 'fr'
  const h = weather.hourly
  const tz = weather.timezone
  const now = Date.now()

  type Slot = { ms: number; mm: number; pop: number; label: string }
  const slots: Slot[] = []

  for (let i = 0; i < h.time.length && slots.length < 12; i++) {
    const ms = parseWeatherLocal(h.time[i], tz)
    if (ms + 60 * 60 * 1000 < now) continue
    const label = new Date(ms).toLocaleTimeString(undefined, {
      hour: 'numeric',
      timeZone: tz,
    })
    slots.push({
      ms,
      mm: h.precipitation[i] ?? 0,
      pop: h.precipitation_probability[i] ?? 0,
      label,
    })
  }

  if (!slots.length) {
    return {
      title: fr ? 'Difficile à dire' : 'Hard to say',
      detail: fr
        ? 'Pas assez de données horaires pour un risque d’humidité.'
        : 'Not enough hourly data for a wetness forecast yet.',
      umbrella: false,
      level: 'maybe',
    }
  }

  const wetIdx = slots.findIndex((s) => s.mm >= 0.2 || s.pop >= 50)
  const heavyIdx = slots.findIndex((s) => s.mm >= 1.5 || s.pop >= 70)
  const maxPop = Math.max(...slots.map((s) => s.pop))
  const totalMm = slots.reduce((a, s) => a + s.mm, 0)
  const first = slots[0]

  if (wetIdx < 0 && maxPop < 30 && totalMm < 0.3) {
    return {
      title: fr ? 'Vous devriez rester au sec' : 'You should stay dry',
      detail: fr
        ? `Semble sec jusqu’à environ ${slots[slots.length - 1].label}. Risque max seulement ${maxPop} %. Laissez le parapluie.`
        : `Looks dry through about ${slots[slots.length - 1].label}. Max rain chance only ${maxPop}%. Leave the umbrella.`,
      umbrella: false,
      level: 'dry',
    }
  }

  if (wetIdx === 0 || first.mm >= 0.2) {
    return {
      title: fr
        ? heavyIdx === 0
          ? 'Vous vous mouillez maintenant'
          : 'Risque de vous mouiller bientôt'
        : heavyIdx === 0
          ? 'Getting wet now'
          : 'You might get wet soon',
      detail:
        first.mm >= 0.2
          ? fr
            ? `Précipitations dans l’heure (~${first.mm.toFixed(1)} mm). Prenez un manteau ou un parapluie.`
            : `Precipitation is in the next hour (~${first.mm.toFixed(1)} mm). Grab a jacket or umbrella.`
          : fr
            ? `${first.pop} % de risque dans l’heure — gardez un petit parapluie.`
            : `${first.pop}% chance in the next hour — keep a compact umbrella handy.`,
      umbrella: true,
      level: first.mm >= 1 || first.pop >= 60 ? 'wet' : 'maybe',
    }
  }

  if (wetIdx > 0) {
    const when = slots[wetIdx]
    const hours = Math.max(1, Math.round((when.ms - now) / 3600000))
    const dryUntil = when.label
    return {
      title: fr
        ? `Sec ~${hours} h, puis attention`
        : `Dry for ~${hours}h, then watch it`,
      detail: fr
        ? `Restez au sec jusqu’à environ ${dryUntil}, puis ${
            when.mm >= 0.5 ? 'attendez-vous à de la pluie' : `${when.pop} % de risque d’averses`
          }. Parapluie ensuite si vous êtes encore dehors.`
        : `Stay dry until around ${dryUntil}, then ${
            when.mm >= 0.5 ? 'expect rain' : `${when.pop}% chance of showers`
          }. Umbrella after that if you’re still out.`,
      umbrella: hours <= 4,
      level: heavyIdx >= 0 ? 'wet' : 'maybe',
    }
  }

  return {
    title: fr ? 'Surtout sec, faible risque' : 'Mostly dry, small chance',
    detail: fr
      ? `Pas de signal fort, mais le risque culmine vers ${maxPop} %. Parapluie optionnel.`
      : `No solid rain signal, but chances peak around ${maxPop}%. Optional umbrella if you hate surprises.`,
    umbrella: maxPop >= 40,
    level: 'maybe',
  }
}
