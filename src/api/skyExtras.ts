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

/** Parse one SWPC row (object or array). Handles kp:"0Z", estimated_kp, Kp. */
function parseKpFromRow(row: unknown): { kp: number; at?: string } | null {
  if (row == null) return null
  if (Array.isArray(row)) {
    const kp = parseFloat(String(row[1]))
    if (!Number.isFinite(kp)) return null
    return { kp, at: String(row[0] ?? '') }
  }
  if (typeof row === 'object') {
    const o = row as Record<string, unknown>
    const candidates = [o.Kp, o.estimated_kp, o.kp_index, o.kp]
    for (const c of candidates) {
      if (typeof c === 'number' && Number.isFinite(c)) {
        return { kp: c, at: String(o.time_tag ?? o.time ?? '') }
      }
      if (typeof c === 'string') {
        const m = c.match(/-?[\d.]+/)
        if (m) {
          const kp = parseFloat(m[0])
          if (Number.isFinite(kp)) return { kp, at: String(o.time_tag ?? o.time ?? '') }
        }
      }
    }
  }
  return null
}

export async function fetchKpIndex(): Promise<KpSnapshot | null> {
  const base = getApiBase()
  // Prefer browser→SWPC (CORS open). Worker may be blocked by SWPC edge.
  const urls = [
    'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json',
    'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
    base ? `${base}/api/sky/kp` : null,
  ].filter(Boolean) as string[]

  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) continue
      const data = await res.json()

      // Our worker shape
      if (data && typeof data.kp === 'number' && Number.isFinite(data.kp)) {
        return {
          kp: data.kp,
          label: data.label || kpLabel(data.kp),
          auroraLikely: Boolean(data.auroraLikely ?? data.kp >= 4),
          source: data.source || 'SWPC',
          at: data.at,
        }
      }

      if (Array.isArray(data) && data.length > 0) {
        for (let i = data.length - 1; i >= 0; i--) {
          const parsed = parseKpFromRow(data[i])
          if (parsed) {
            return {
              kp: parsed.kp,
              label: kpLabel(parsed.kp),
              auroraLikely: parsed.kp >= 4,
              source: 'NOAA SWPC',
              at: parsed.at,
            }
          }
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
