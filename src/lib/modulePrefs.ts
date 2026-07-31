/**
 * Optional dashboard modules — default off so the home scroll stays calm.
 * Power users turn pieces back on in Settings / More.
 */
export type ModuleId =
  | 'dress'
  | 'videos'
  | 'fireMap'
  | 'chat'
  | 'shareCard'
  | 'models'
  | 'planning'

export interface ModulePrefs {
  dress: boolean
  videos: boolean
  /** Always show fire map (otherwise only when smoke/fire risk elevated) */
  fireMap: boolean
  chat: boolean
  shareCard: boolean
  models: boolean
  planning: boolean
}

const KEY = 'solara-module-prefs-v1'

export const DEFAULT_MODULE_PREFS: ModulePrefs = {
  dress: true,
  videos: false,
  fireMap: false,
  chat: false,
  shareCard: false,
  models: false,
  planning: true, // still under collapsed Advanced
}

export function loadModulePrefs(): ModulePrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_MODULE_PREFS }
    const p = JSON.parse(raw) as Partial<ModulePrefs>
    return { ...DEFAULT_MODULE_PREFS, ...p }
  } catch {
    return { ...DEFAULT_MODULE_PREFS }
  }
}

export function saveModulePrefs(prefs: ModulePrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}

export const MODULE_LABELS: { id: ModuleId; label: string; hint: string }[] = [
  { id: 'dress', label: 'Dress for today', hint: 'Clothing tips' },
  { id: 'videos', label: 'Weather videos', hint: 'Safety / explainers' },
  { id: 'fireMap', label: 'Always show fire map', hint: 'Otherwise only when smoky' },
  { id: 'chat', label: 'Area chat', hint: 'Local community' },
  { id: 'shareCard', label: 'Share card panel', hint: 'Big share block' },
  { id: 'models', label: 'Model compare', hint: 'Multi-model detail' },
  { id: 'planning', label: 'Planning tools', hint: 'Trip, snow, climate' },
]
