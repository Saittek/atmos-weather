/** Open-Meteo air-quality samples for smoke / haze map */

export interface SmokePoint {
  lat: number
  lon: number
  pm25: number
  aqi: number | null
}

const AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality'

async function fetchBatch(
  lats: number[],
  lons: number[],
): Promise<SmokePoint[]> {
  if (!lats.length) return []
  const params = new URLSearchParams({
    latitude: lats.map((v) => v.toFixed(3)).join(','),
    longitude: lons.map((v) => v.toFixed(3)).join(','),
    current: 'pm2_5,us_aqi',
    timezone: 'auto',
  })
  const res = await fetch(`${AIR}?${params}`)
  if (!res.ok) throw new Error(`Smoke grid failed (${res.status})`)
  const data = await res.json()
  const results = Array.isArray(data) ? data : [data]
  const points: SmokePoint[] = []
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const pm = r?.current?.pm2_5
    if (pm == null || Number.isNaN(Number(pm))) continue
    points.push({
      lat: Number(r.latitude ?? lats[i]),
      lon: Number(r.longitude ?? lons[i]),
      pm25: Number(pm),
      aqi: r.current?.us_aqi != null ? Number(r.current.us_aqi) : null,
    })
  }
  return points
}

/**
 * Sample PM2.5 around a point. Uses batched multi-location Open-Meteo requests.
 * @param span degrees across the square
 * @param steps grid size (steps×steps points)
 */
export async function fetchSmokeGrid(
  lat: number,
  lon: number,
  span = 2.4,
  steps = 6,
): Promise<SmokePoint[]> {
  const n = Math.max(2, Math.min(8, steps))
  const half = span / 2
  const lats: number[] = []
  const lons: number[] = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      lats.push(lat - half + (span * i) / (n - 1))
      lons.push(lon - half + (span * j) / (n - 1))
    }
  }

  // Open-Meteo is happiest with modest multi-location batches
  const BATCH = 12
  const all: SmokePoint[] = []
  for (let i = 0; i < lats.length; i += BATCH) {
    const batchLats = lats.slice(i, i + BATCH)
    const batchLons = lons.slice(i, i + BATCH)
    try {
      const pts = await fetchBatch(batchLats, batchLons)
      all.push(...pts)
    } catch {
      // fall back to single-point requests for this batch
      for (let k = 0; k < batchLats.length; k++) {
        try {
          const pts = await fetchBatch([batchLats[k]], [batchLons[k]])
          all.push(...pts)
        } catch {
          /* skip cell */
        }
      }
    }
  }

  // Always include center sample so the layer is never empty when API works
  if (!all.length) {
    const center = await fetchBatch([lat], [lon])
    all.push(...center)
  }

  return all
}

export function pm25Color(pm: number): string {
  if (pm < 12) return 'rgba(74, 222, 128, 0.45)'
  if (pm < 35) return 'rgba(250, 204, 21, 0.55)'
  if (pm < 55) return 'rgba(249, 115, 22, 0.62)'
  if (pm < 150) return 'rgba(239, 68, 68, 0.68)'
  return 'rgba(127, 29, 29, 0.78)'
}

export function pm25Radius(pm: number, zoom = 7): number {
  const base = zoom >= 8 ? 18 : zoom >= 6 ? 22 : 28
  return base + Math.min(28, pm / 4)
}
