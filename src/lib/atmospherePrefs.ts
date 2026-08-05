/**
 * Full-page weather atmosphere (rain/snow/lightning wash).
 * Default on; users can turn off in Settings for battery/clarity.
 */
const KEY = 'solara-atmosphere-v1'

export function loadAtmosphereEnabled(): boolean {
  try {
    const v = localStorage.getItem(KEY)
    if (v === '0') return false
    if (v === '1') return true
  } catch {
    /* ignore */
  }
  return true
}

export function saveAtmosphereEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}
