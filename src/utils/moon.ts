/** Simple astronomical moon phase from date (0 = new, 0.5 = full) */
export function moonPhase(date = new Date()): {
  phase: number
  name: string
  emoji: string
  illumination: number
} {
  // Known new moon: 2000-01-06 18:14 UTC
  const synodic = 29.530588853
  const ref = Date.UTC(2000, 0, 6, 18, 14)
  const days = (date.getTime() - ref) / 86400000
  let phase = (days % synodic) / synodic
  if (phase < 0) phase += 1

  const illumination = Math.round((1 - Math.cos(phase * 2 * Math.PI)) * 50)

  let name = 'New Moon'
  let emoji = '🌑'
  if (phase < 0.03 || phase >= 0.97) {
    name = 'New Moon'
    emoji = '🌑'
  } else if (phase < 0.22) {
    name = 'Waxing Crescent'
    emoji = '🌒'
  } else if (phase < 0.28) {
    name = 'First Quarter'
    emoji = '🌓'
  } else if (phase < 0.47) {
    name = 'Waxing Gibbous'
    emoji = '🌔'
  } else if (phase < 0.53) {
    name = 'Full Moon'
    emoji = '🌕'
  } else if (phase < 0.72) {
    name = 'Waning Gibbous'
    emoji = '🌖'
  } else if (phase < 0.78) {
    name = 'Last Quarter'
    emoji = '🌗'
  } else {
    name = 'Waning Crescent'
    emoji = '🌘'
  }

  return { phase, name, emoji, illumination }
}
