/**
 * Multi-model cloud cover agreement for stargazing nights.
 */
const FORECAST = 'https://api.open-meteo.com/v1/forecast'

const MODELS: { id: string; label: string; param?: string }[] = [
  { id: 'best', label: 'Best match' },
  { id: 'gfs', label: 'GFS', param: 'gfs_seamless' },
  { id: 'icon', label: 'ICON', param: 'icon_seamless' },
  { id: 'gem', label: 'GEM', param: 'gem_seamless' },
  { id: 'ecmwf', label: 'ECMWF', param: 'ecmwf_ifs025' },
]

export interface CloudModelRow {
  id: string
  label: string
  /** Mean cloud % for next 18 night-ish hours (or all hours if unknown) */
  meanCloud: number | null
  error?: string
}

export interface CloudAgreement {
  models: CloudModelRow[]
  /** 0–100: higher = models agree more */
  agreement: number
  meanCloud: number
  label: string
  detail: string
}

export async function fetchCloudModelAgreement(
  lat: number,
  lon: number,
): Promise<CloudAgreement | null> {
  const results = await Promise.all(
    MODELS.map(async (m) => {
      try {
        const params = new URLSearchParams({
          latitude: String(lat),
          longitude: String(lon),
          hourly: 'cloud_cover,is_day',
          forecast_hours: '36',
          timezone: 'auto',
        })
        if (m.param) params.set('models', m.param)
        const res = await fetch(`${FORECAST}?${params}`, {
          signal: AbortSignal.timeout(12_000),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const clouds: number[] = data.hourly?.cloud_cover ?? []
        const isDay: number[] = data.hourly?.is_day ?? []
        const nightClouds: number[] = []
        for (let i = 0; i < clouds.length; i++) {
          if (isDay[i] === 0 || isDay[i] == null) nightClouds.push(clouds[i] ?? 50)
        }
        const sample = nightClouds.length ? nightClouds : clouds
        if (!sample.length) throw new Error('no data')
        const mean = sample.reduce((a, b) => a + b, 0) / sample.length
        return { id: m.id, label: m.label, meanCloud: Math.round(mean) } satisfies CloudModelRow
      } catch (e) {
        return {
          id: m.id,
          label: m.label,
          meanCloud: null,
          error: e instanceof Error ? e.message : 'failed',
        } satisfies CloudModelRow
      }
    }),
  )

  const ok = results.filter((r) => r.meanCloud != null) as (CloudModelRow & { meanCloud: number })[]
  if (ok.length < 2) return null

  const mean = ok.reduce((s, r) => s + r.meanCloud, 0) / ok.length
  const variance =
    ok.reduce((s, r) => s + (r.meanCloud - mean) ** 2, 0) / ok.length
  const std = Math.sqrt(variance)
  // agreement: low std → high agreement
  const agreement = Math.max(0, Math.min(100, Math.round(100 - std * 2.2)))

  let label = 'Models mixed'
  if (agreement >= 75 && mean <= 35) label = 'Models agree: clear-ish'
  else if (agreement >= 75 && mean >= 70) label = 'Models agree: cloudy'
  else if (agreement >= 75) label = 'Models agree: mixed clouds'
  else if (std >= 25) label = 'Models disagree — wait for update'
  else label = 'Moderate model agreement'

  return {
    models: results,
    agreement,
    meanCloud: Math.round(mean),
    label,
    detail: `Avg cloud ~${Math.round(mean)}% · spread ±${Math.round(std)}% across ${ok.length} models`,
  }
}
