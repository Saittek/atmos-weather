/**
 * Simple seasonal target suggestions for casual stargazers / AP.
 * Not a full catalog — “what to shoot tonight” tips.
 */
import { moonPhase } from './moon'

export interface SkyTarget {
  name: string
  kind: 'planet' | 'moon' | 'dso' | 'milkyway' | 'aurora' | 'wide'
  why: string
  emoji: string
}

export function suggestTargets(opts: {
  date?: Date
  moonIllum: number
  tonightScore: number
  bortleClass: number
  lat: number
  auroraLikely?: boolean
}): SkyTarget[] {
  const d = opts.date ?? new Date()
  const month = d.getUTCMonth() + 1 // 1–12
  const north = opts.lat >= 0
  const out: SkyTarget[] = []
  const darkMoon = opts.moonIllum < 35
  const brightMoon = opts.moonIllum > 60
  const goodSky = opts.tonightScore >= 55
  const darkSite = opts.bortleClass <= 4

  if (opts.auroraLikely && Math.abs(opts.lat) > 45) {
    out.push({
      name: 'Aurora watch',
      kind: 'aurora',
      emoji: '🌌',
      why: 'Elevated geomagnetic activity — face poleward, wide lens, high ISO.',
    })
  }

  if (brightMoon) {
    out.push({
      name: 'The Moon',
      kind: 'moon',
      emoji: '🌕',
      why: 'Bright moon night — lunar detail, terminator, or earthshine if crescent.',
    })
    out.push({
      name: 'Bright planets',
      kind: 'planet',
      emoji: '🪐',
      why: 'Jupiter/Saturn/Venus cut through moonlight better than faint DSOs.',
    })
  } else if (darkMoon && goodSky) {
    if (darkSite) {
      out.push({
        name: 'Milky Way core / arches',
        kind: 'milkyway',
        emoji: '🌌',
        why:
          month >= 3 && month <= 10
            ? 'Dark moon — galactic core season (spring–fall evenings).'
            : 'Dark skies — winter MW arch and bright winter DSOs.',
      })
    }
    out.push({
      name: north ? 'Andromeda (M31)' : 'Magellanic Clouds / bright southern DSOs',
      kind: 'dso',
      emoji: '🔭',
      why: 'Classic broadband targets under darker moons.',
    })
  }

  // Seasonal DSO hints
  if (month === 12 || month <= 2) {
    out.push({
      name: 'Orion Nebula (M42)',
      kind: 'dso',
      emoji: '✨',
      why: 'Winter showpiece — bright even from mild suburbs.',
    })
    out.push({
      name: 'Pleiades (M45)',
      kind: 'dso',
      emoji: '💎',
      why: 'Easy wide-field cluster; great with short exposures.',
    })
  } else if (month >= 3 && month <= 5) {
    out.push({
      name: 'Leo galaxies / Virgo cluster',
      kind: 'dso',
      emoji: '🌀',
      why: 'Galaxy season — needs darker skies and longer integration.',
    })
  } else if (month >= 6 && month <= 8) {
    out.push({
      name: 'Sagittarius / Scorpius region',
      kind: 'dso',
      emoji: '🎯',
      why: 'Summer MW — Lagoon, Trifid, and rich star fields (low south from mid-latitudes).',
    })
  } else {
    out.push({
      name: 'Andromeda + autumn MW',
      kind: 'dso',
      emoji: '🍂',
      why: 'Fall favorites — M31, Double Cluster, and rising winter constellations late.',
    })
  }

  if (opts.bortleClass >= 6) {
    out.push({
      name: 'Open clusters & double stars',
      kind: 'wide',
      emoji: '⭐',
      why: 'City/suburb survival kit — avoid faint nebulae unless narrowband.',
    })
  }

  if (opts.tonightScore < 45 && !brightMoon) {
    out.push({
      name: 'Stay flexible',
      kind: 'wide',
      emoji: '☁️',
      why: 'Sky score is modest — keep sessions short or wait for a clearer hour.',
    })
  }

  // Dedupe by name
  const seen = new Set<string>()
  return out.filter((t) => {
    if (seen.has(t.name)) return false
    seen.add(t.name)
    return true
  }).slice(0, 6)
}

export function moonTargetNote(date = new Date()): string {
  const m = moonPhase(date)
  if (m.illumination < 15) return 'Dark moon — prioritize faint DSOs and MW.'
  if (m.illumination > 80) return 'Near full — lunar / planetary night.'
  return `${m.name} · ${m.illumination}% lit`
}
