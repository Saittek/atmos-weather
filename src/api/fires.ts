import { getApiBase } from '../lib/native'

export interface FireHotspot {
  lat: number
  lon: number
  brightness: number
  frp: number
  sat: string
  acq: string
}

function apiUrl(path: string): string {
  const p = path.startsWith('/api') ? path : `/api${path}`
  const base = getApiBase()
  return base ? `${base}${p}` : p
}

export async function fetchFiresNear(
  lat: number,
  lon: number,
  radius = 2.5,
  limit = 100,
): Promise<FireHotspot[]> {
  const q = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    radius: String(radius),
    limit: String(limit),
  })
  const res = await fetch(apiUrl(`/api/fires?${q}`))
  if (!res.ok) throw new Error('Fire data failed')
  const data = (await res.json()) as { fires?: FireHotspot[] }
  return data.fires ?? []
}
