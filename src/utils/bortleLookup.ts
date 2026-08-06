/**
 * NASA VIIRS-derived 0.5° Bortle grid (same asset as Astroguide).
 * Falls back to city-distance estimate when grid missing/offline.
 */
import { estimateBortle } from './bortleEstimate'

const GRID_URL = '/data/bortle-1deg.bin'
const GRID_W = 720
const GRID_H = 360
const CELL = 0.5

let grid: Uint8Array | null = null
let gridPromise: Promise<Uint8Array | null> | null = null
const lookupCache = new Map<string, number>()

async function loadGrid(): Promise<Uint8Array | null> {
  if (grid) return grid
  if (!gridPromise) {
    gridPromise = fetch(GRID_URL)
      .then((r) => {
        if (!r.ok) return null
        return r.arrayBuffer()
      })
      .then((buf) => {
        if (!buf) return null
        grid = new Uint8Array(buf)
        return grid
      })
      .catch(() => null)
  }
  return gridPromise
}

export function sampleBortleGrid(g: Uint8Array, lat: number, lon: number): number {
  const clampedLat = Math.max(-89.9, Math.min(89.9, lat))
  const x = (lon + 180) / CELL
  const y = (90 - clampedLat) / CELL
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(GRID_W - 1, x0 + 1)
  const y1 = Math.min(GRID_H - 1, y0 + 1)
  const fx = x - x0
  const fy = y - y0
  const v00 = g[y0 * GRID_W + x0] || 1
  const v10 = g[y0 * GRID_W + x1] || 1
  const v01 = g[y1 * GRID_W + x0] || 1
  const v11 = g[y1 * GRID_W + x1] || 1
  const top = v00 * (1 - fx) + v10 * fx
  const bot = v01 * (1 - fx) + v11 * fx
  return Math.max(1, Math.min(9, Math.round(top * (1 - fy) + bot * fy)))
}

export async function lookupBortleAt(lat: number, lon: number): Promise<number> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`
  const cached = lookupCache.get(key)
  if (cached != null) return cached

  const g = await loadGrid()
  const bortle = g
    ? sampleBortleGrid(g, lat, lon)
    : estimateBortle(lat, lon).class
  lookupCache.set(key, bortle)
  return bortle
}

export function preloadBortleGrid(): void {
  void loadGrid()
}

export function bortleClassMeta(cls: number): {
  class: number
  label: string
  sky: string
  tone: 'good' | 'ok' | 'bad'
  detail: string
  source: 'viirs' | 'estimate'
} {
  const c = Math.max(1, Math.min(9, Math.round(cls)))
  const labels: Record<number, { label: string; sky: string }> = {
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
  const meta = labels[c] ?? labels[5]
  return {
    class: c,
    label: meta.label,
    sky: meta.sky,
    tone: c <= 3 ? 'good' : c <= 5 ? 'ok' : 'bad',
    detail: 'From VIIRS light-pollution grid (0.5°).',
    source: 'viirs',
  }
}
