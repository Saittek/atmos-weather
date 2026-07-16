/** Lightweight device helpers for mobile performance modes */

export function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(max-width: 720px)').matches
}

export function prefersReducedData(): boolean {
  if (typeof navigator === 'undefined') return false
  const conn = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string }
    }
  ).connection
  if (conn?.saveData) return true
  if (conn?.effectiveType === 'slow-2g' || conn?.effectiveType === '2g') return true
  return false
}

/** Phones, low cores, or data-saver — use lite radar / fewer network jobs */
export function isConstrainedDevice(): boolean {
  if (typeof window === 'undefined') return false
  if (isMobileViewport()) return true
  if (prefersReducedData()) return true
  const cores = navigator.hardwareConcurrency ?? 8
  return cores <= 4
}

/** Apply once on boot so CSS can drop expensive effects */
export function applyMobilePerfClass(): void {
  if (typeof document === 'undefined') return
  const on = isMobileViewport() || prefersReducedData()
  document.documentElement.dataset.mobile = on ? '1' : '0'
  if (on) document.documentElement.classList.add('mobile-perf')
  else document.documentElement.classList.remove('mobile-perf')
}
