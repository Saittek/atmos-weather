import type { ThemeMode } from '../api/types'

const STORAGE_KEY = 'atmos-weather-prefs-v2'

/** Read theme preference from localStorage (same key as useWeather prefs). */
export function readStoredTheme(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return 'dark'
    const p = JSON.parse(raw) as { theme?: ThemeMode }
    if (p.theme === 'light' || p.theme === 'dark' || p.theme === 'auto') return p.theme
  } catch {
    /* ignore */
  }
  return 'dark'
}

/** Resolve auto → light|dark from system preference. */
export function resolveTheme(theme: ThemeMode): 'dark' | 'light' {
  if (theme === 'light') return 'light'
  if (theme === 'auto') {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light'
    }
    return 'dark'
  }
  return 'dark'
}

/** Apply theme to <html> so every route shares the same light/dark tokens. */
export function applyTheme(theme: ThemeMode): 'dark' | 'light' {
  const mode = resolveTheme(theme)
  const root = document.documentElement
  root.dataset.theme = mode
  root.style.colorScheme = mode
  // Help browser form controls / scrollbars
  try {
    root.style.setProperty('color-scheme', mode)
  } catch {
    /* ignore */
  }
  return mode
}

/** Bootstrap theme as early as possible (App mount + sub-pages). */
export function bootstrapTheme(): 'dark' | 'light' {
  return applyTheme(readStoredTheme())
}
