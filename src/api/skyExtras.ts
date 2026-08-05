/**
 * External sky data: geomagnetic Kp (aurora) + ISS TLE for pass estimates.
 * Fetched via Solara worker proxy when available, with direct SWPC fallback.
 */
import { getApiBase } from '../lib/native'

export interface KpSnapshot {
  kp: number
  label: string
  auroraLikely: boolean
  source: string
  at?: string
}

export interface IssPass {
  riseMs: number
  maxMs: number
  setMs: number
  maxEl: number
  direction: string
}

export interface IssSnapshot {
  passes: IssPass[]
  note: string
}

function kpLabel(kp: number): string {
  if (kp >= 7) return 'Strong storm (G3+)'
  if (kp >= 5) return 'G1+ storm — aurora possible mid-latitudes'
  if (kp >= 4) return 'Active — aurora chance higher latitudes'
  if (kp >= 3) return 'Unsettled'
  return 'Quiet'
}

export async function fetchKpIndex(): Promise<KpSnapshot | null> {
  const base = getApiBase()
  const urls = [
    base ? `${base}/api/sky/kp` : null,
    'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
  ].filter(Boolean) as string[]

  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) continue
      const data = await res.json()

      // Our worker shape
      if (data && typeof data.kp === 'number') {
        return {
          kp: data.kp,
          label: data.label || kpLabel(data.kp),
          auroraLikely: Boolean(data.auroraLikely ?? data.kp >= 4),
          source: data.source || 'SWPC',
          at: data.at,
        }
      }

      // SWPC product: array of [time, kp, a_running, station_count]
      if (Array.isArray(data) && data.length > 1) {
        const last = data[data.length - 1]
        const kp = parseFloat(String(last[1]))
        if (!Number.isFinite(kp)) continue
        return {
          kp,
          label: kpLabel(kp),
          auroraLikely: kp >= 4,
          source: 'NOAA SWPC',
          at: String(last[0] || ''),
        }
      }
    } catch {
      /* try next */
    }
  }
  return null
}

export async function fetchIssPasses(
  lat: number,
  lon: number,
): Promise<IssSnapshot | null> {
  const base = getApiBase()
  if (!base) return null
  try {
    const url = `${base}/api/sky/iss?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) })
    if (!res.ok) return null
    const data = await res.json()
    if (!data || !Array.isArray(data.passes)) return null
    return {
      passes: data.passes.map(
        (p: {
          riseMs: number
          maxMs: number
          setMs: number
          maxEl: number
          direction?: string
        }) => ({
          riseMs: p.riseMs,
          maxMs: p.maxMs,
          setMs: p.setMs,
          maxEl: p.maxEl,
          direction: p.direction || '',
        }),
      ),
      note: data.note || 'Visible ISS passes (approx, elev ≥ 20°).',
    }
  } catch {
    return null
  }
}
