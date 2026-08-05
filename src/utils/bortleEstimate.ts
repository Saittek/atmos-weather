/**
 * Approximate Bortle class (1–9) without a VIIRS grid.
 * Uses distance to major lit metros + high-latitude rural bonus.
 * Good enough for “suburb vs dark sky drive” guidance — not survey-grade.
 */

export interface BortleEstimate {
  class: number
  label: string
  sky: string
  tone: 'good' | 'ok' | 'bad'
  detail: string
}

/** Major light domes (approx city centers) — North America + a few global */
const METROS: { lat: number; lon: number; power: number; name: string }[] = [
  { lat: 40.71, lon: -74.01, power: 9.5, name: 'NYC' },
  { lat: 34.05, lon: -118.24, power: 9.2, name: 'LA' },
  { lat: 41.88, lon: -87.63, power: 8.8, name: 'Chicago' },
  { lat: 29.76, lon: -95.37, power: 8.5, name: 'Houston' },
  { lat: 33.45, lon: -112.07, power: 8.2, name: 'Phoenix' },
  { lat: 39.95, lon: -75.17, power: 8.3, name: 'Philadelphia' },
  { lat: 29.42, lon: -98.49, power: 7.8, name: 'San Antonio' },
  { lat: 32.78, lon: -96.8, power: 8.0, name: 'Dallas' },
  { lat: 37.77, lon: -122.42, power: 8.4, name: 'SF Bay' },
  { lat: 47.61, lon: -122.33, power: 7.6, name: 'Seattle' },
  { lat: 39.74, lon: -104.99, power: 7.5, name: 'Denver' },
  { lat: 38.91, lon: -77.04, power: 8.1, name: 'DC' },
  { lat: 42.36, lon: -71.06, power: 7.9, name: 'Boston' },
  { lat: 25.76, lon: -80.19, power: 8.0, name: 'Miami' },
  { lat: 33.75, lon: -84.39, power: 7.7, name: 'Atlanta' },
  { lat: 45.5, lon: -73.57, power: 8.0, name: 'Montreal' },
  { lat: 43.65, lon: -79.38, power: 8.3, name: 'Toronto' },
  { lat: 49.28, lon: -123.12, power: 7.4, name: 'Vancouver' },
  { lat: 51.05, lon: -114.07, power: 7.0, name: 'Calgary' },
  { lat: 53.55, lon: -113.49, power: 7.1, name: 'Edmonton' },
  { lat: 49.9, lon: -97.14, power: 6.5, name: 'Winnipeg' },
  { lat: 45.42, lon: -75.7, power: 6.8, name: 'Ottawa' },
  { lat: 46.81, lon: -71.21, power: 6.2, name: 'Quebec City' },
  { lat: 44.65, lon: -63.58, power: 6.0, name: 'Halifax' },
  { lat: 52.13, lon: -106.67, power: 5.8, name: 'Saskatoon' },
  { lat: 50.45, lon: -104.62, power: 5.9, name: 'Regina' },
  { lat: 62.45, lon: -114.37, power: 5.2, name: 'Yellowknife' },
  { lat: 60.72, lon: -135.05, power: 4.8, name: 'Whitehorse' },
  { lat: 19.43, lon: -99.13, power: 9.0, name: 'Mexico City' },
  { lat: 51.51, lon: -0.13, power: 9.0, name: 'London' },
  { lat: 48.86, lon: 2.35, power: 8.8, name: 'Paris' },
  { lat: 52.52, lon: 13.4, power: 8.2, name: 'Berlin' },
  { lat: 35.68, lon: 139.69, power: 9.3, name: 'Tokyo' },
  { lat: -33.87, lon: 151.21, power: 8.0, name: 'Sydney' },
]

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toR = (d: number) => (d * Math.PI) / 180
  const dLat = toR(lat2 - lat1)
  const dLon = toR(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

const LABELS: Record<number, { label: string; sky: string }> = {
  1: { label: 'Bortle 1 · excellent dark', sky: 'Milky Way casts shadows' },
  2: { label: 'Bortle 2 · typical truly dark', sky: 'Milky Way highly structured' },
  3: { label: 'Bortle 3 · rural sky', sky: 'Milky Way obvious' },
  4: { label: 'Bortle 4 · rural/suburban', sky: 'Milky Way visible overhead' },
  5: { label: 'Bortle 5 · suburban', sky: 'Milky Way washed near horizon' },
  6: { label: 'Bortle 6 · bright suburban', sky: 'Only brightest DSOs' },
  7: { label: 'Bortle 7 · suburban/urban', sky: 'Planets & bright clusters' },
  8: { label: 'Bortle 8 · city sky', sky: 'Moon & planets mainly' },
  9: { label: 'Bortle 9 · inner city', sky: 'Few stars beyond Orion' },
}

export function estimateBortle(lat: number, lon: number): BortleEstimate {
  let light = 0
  let nearest = ''
  let nearestKm = Infinity
  for (const m of METROS) {
    const km = haversineKm(lat, lon, m.lat, m.lon)
    if (km < nearestKm) {
      nearestKm = km
      nearest = m.name
    }
    // Light falloff ~ 1/r^1.3 with metro “power”
    const contrib = m.power / Math.pow(Math.max(km, 3) / 25, 1.25)
    light = Math.max(light, contrib)
  }

  // High-latitude / remote rural bonus (e.g. northern Canada)
  if (Math.abs(lat) > 55 && nearestKm > 80) light *= 0.72
  if (Math.abs(lat) > 60 && nearestKm > 40) light *= 0.8
  if (nearestKm > 200) light *= 0.55
  if (nearestKm > 400) light *= 0.4

  let cls = 4
  if (light >= 9) cls = 9
  else if (light >= 7.5) cls = 8
  else if (light >= 6) cls = 7
  else if (light >= 4.5) cls = 6
  else if (light >= 3.2) cls = 5
  else if (light >= 2.2) cls = 4
  else if (light >= 1.4) cls = 3
  else if (light >= 0.8) cls = 2
  else cls = 1

  const meta = LABELS[cls] ?? LABELS[5]
  const tone: BortleEstimate['tone'] = cls <= 3 ? 'good' : cls <= 5 ? 'ok' : 'bad'
  const detail =
    nearestKm < 500
      ? `~${Math.round(nearestKm)} km from ${nearest} light dome (approx).`
      : 'Far from major metros in our list — likely darker sky.'

  return {
    class: cls,
    label: meta.label,
    sky: meta.sky,
    tone,
    detail,
  }
}

/** Soft score penalty 0–28 for deep-sky from Bortle class */
export function bortleScorePenalty(bortleClass: number): number {
  if (bortleClass <= 2) return 0
  if (bortleClass === 3) return 4
  if (bortleClass === 4) return 10
  if (bortleClass === 5) return 16
  if (bortleClass === 6) return 22
  if (bortleClass === 7) return 28
  return 34
}
