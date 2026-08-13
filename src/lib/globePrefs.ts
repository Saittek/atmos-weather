/** Persisted Earth globe prefs (mode + a few layer choices). */

export type GlobeMode = 'radar' | 'storms' | 'eclipse' | 'space'

export type GlobeBasemapId = 'satellite' | 'voyager' | 'light' | 'dark'

export interface GlobePrefs {
  mode: GlobeMode
  basemapId: GlobeBasemapId
  showIR: boolean
  showLabels: boolean
  opacity: number
  spinning: boolean
}

const KEY = 'solara-globe-prefs-v1'

const DEFAULTS: GlobePrefs = {
  mode: 'radar',
  basemapId: 'satellite',
  showIR: false,
  showLabels: true,
  opacity: 0.78,
  spinning: false,
}

export function loadGlobePrefs(): GlobePrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const p = JSON.parse(raw) as Partial<GlobePrefs>
    const mode = (['radar', 'storms', 'eclipse', 'space'] as const).includes(p.mode as GlobeMode)
      ? (p.mode as GlobeMode)
      : DEFAULTS.mode
    const basemapId = (['satellite', 'voyager', 'light', 'dark'] as const).includes(
      p.basemapId as GlobeBasemapId,
    )
      ? (p.basemapId as GlobeBasemapId)
      : DEFAULTS.basemapId
    return {
      mode,
      basemapId,
      showIR: Boolean(p.showIR),
      showLabels: p.showLabels !== false,
      opacity:
        typeof p.opacity === 'number' && Number.isFinite(p.opacity)
          ? Math.min(1, Math.max(0.2, p.opacity))
          : DEFAULTS.opacity,
      spinning: Boolean(p.spinning),
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveGlobePrefs(partial: Partial<GlobePrefs>): void {
  try {
    const next = { ...loadGlobePrefs(), ...partial }
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

/** True when HTML has mobile-perf class (phones / save-data). */
export function isGlobePerfLite(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.classList.contains('mobile-perf')
}

/** Layer preset when switching mission modes */
export function layersForMode(mode: GlobeMode): {
  showRadar: boolean
  showDayNight: boolean
  showBodies: boolean
  showEclipses: boolean
  showTropical: boolean
  spinning: boolean
  /** Force IR off on constrained devices */
  showIR: boolean
} {
  const lite = isGlobePerfLite()
  switch (mode) {
    case 'storms':
      return {
        showRadar: true,
        showDayNight: true,
        showBodies: false,
        showEclipses: false,
        showTropical: true,
        spinning: false,
        showIR: false,
      }
    case 'eclipse':
      return {
        showRadar: false,
        showDayNight: true,
        showBodies: false,
        showEclipses: true,
        showTropical: false,
        spinning: false,
        showIR: false,
      }
    case 'space':
      return {
        showRadar: false,
        showDayNight: true,
        showBodies: true,
        showEclipses: false,
        showTropical: false,
        // Auto-spin is expensive on phones
        spinning: !lite,
        showIR: false,
      }
    case 'radar':
    default:
      return {
        showRadar: true,
        showDayNight: !lite, // day/night canvas is costly while panning on mobile
        showBodies: false,
        showEclipses: false,
        showTropical: true,
        spinning: false,
        showIR: false,
      }
  }
}
