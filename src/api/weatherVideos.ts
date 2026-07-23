/**
 * Official free weather videos (NOAA / NWS via Solara Worker → YouTube RSS).
 */
import { getApiBase } from '../lib/native'

export interface WeatherVideo {
  id: string
  title: string
  channel: string
  published: string | null
  thumbnail: string | null
  tag: string
  source: string
  embedUrl: string
  watchUrl: string
}

export interface WeatherVideosPayload {
  latest: WeatherVideo[]
  safety: WeatherVideo[]
  attribution: string
  updatedAt: string
}

function apiUrl(path: string): string {
  const p = path.startsWith('/api') ? path : `/api${path}`
  const base = getApiBase()
  return base ? `${base}${p}` : p
}

/** Fallback if Worker/RSS unavailable — still free official embeds */
const FALLBACK_SAFETY: WeatherVideo[] = [
  {
    id: 'lqgtk4ozgsg',
    title: 'We Are the National Weather Service',
    channel: 'National Weather Service (NWS)',
    published: null,
    thumbnail: 'https://i.ytimg.com/vi/lqgtk4ozgsg/hqdefault.jpg',
    tag: 'safety',
    source: 'youtube',
    embedUrl: 'https://www.youtube.com/embed/lqgtk4ozgsg?rel=0',
    watchUrl: 'https://www.youtube.com/watch?v=lqgtk4ozgsg',
  },
  {
    id: '_5TiTfuvotc',
    title: 'Get Weather Ready: During a Tornado',
    channel: 'National Weather Service (NWS)',
    published: null,
    thumbnail: 'https://i.ytimg.com/vi/_5TiTfuvotc/hqdefault.jpg',
    tag: 'tornado',
    source: 'youtube',
    embedUrl: 'https://www.youtube.com/embed/_5TiTfuvotc?rel=0',
    watchUrl: 'https://www.youtube.com/watch?v=_5TiTfuvotc',
  },
  {
    id: 'KvLNySr4Iw4',
    title: 'Get Weather Ready — Before a Tornado',
    channel: 'NOAA',
    published: null,
    thumbnail: 'https://i.ytimg.com/vi/KvLNySr4Iw4/hqdefault.jpg',
    tag: 'tornado',
    source: 'youtube',
    embedUrl: 'https://www.youtube.com/embed/KvLNySr4Iw4?rel=0',
    watchUrl: 'https://www.youtube.com/watch?v=KvLNySr4Iw4',
  },
]

let cache: { at: number; data: WeatherVideosPayload } | null = null
const TTL = 10 * 60_000

export async function fetchWeatherVideos(): Promise<WeatherVideosPayload> {
  if (cache && Date.now() - cache.at < TTL) return cache.data
  try {
    const res = await fetch(apiUrl('/api/weather-videos'))
    if (!res.ok) throw new Error(`videos ${res.status}`)
    const data = (await res.json()) as WeatherVideosPayload
    if (!data.safety?.length && !data.latest?.length) throw new Error('empty')
    cache = { at: Date.now(), data }
    return data
  } catch {
    const fallback: WeatherVideosPayload = {
      latest: [],
      safety: FALLBACK_SAFETY,
      attribution:
        'Videos from NOAA / National Weather Service (U.S. government). Embedded via YouTube.',
      updatedAt: new Date().toISOString(),
    }
    cache = { at: Date.now(), data: fallback }
    return fallback
  }
}
