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
  if (conn?.effectiveType === '3g') return true
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

export function isPageVisible(): boolean {
  if (typeof document === 'undefined') return true
  return document.visibilityState === 'visible'
}

/** Run work when the browser is idle (or after fallbackMs). */
export function scheduleIdle(fn: () => void, fallbackMs = 2000): () => void {
  if (typeof window === 'undefined') {
    fn()
    return () => {}
  }
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    cancelIdleCallback?: (id: number) => void
  }
  if (typeof w.requestIdleCallback === 'function') {
    const id = w.requestIdleCallback(fn, { timeout: fallbackMs })
    return () => w.cancelIdleCallback?.(id)
  }
  const id = window.setTimeout(fn, Math.min(fallbackMs, 800))
  return () => window.clearTimeout(id)
}

/** Apply once on boot so CSS can drop expensive effects */
export function applyMobilePerfClass(): void {
  if (typeof document === 'undefined') return
  const on = isMobileViewport() || prefersReducedData()
  document.documentElement.dataset.mobile = on ? '1' : '0'
  if (on) {
    document.documentElement.classList.add('mobile-perf')
    // Prefer system fonts on phones — skips multi-hundred KB Google Fonts
    document.documentElement.classList.add('system-fonts')
  } else {
    document.documentElement.classList.remove('mobile-perf')
    document.documentElement.classList.remove('system-fonts')
  }
}

/** Load AdSense only after first paint / idle (saves main-thread on mobile). */
export function loadAdSenseDeferred(client = 'ca-pub-3200072038162515'): void {
  if (typeof document === 'undefined') return
  if (document.querySelector('script[data-solara-adsense]')) return

  const inject = () => {
    if (document.querySelector('script[data-solara-adsense]')) return
    const s = document.createElement('script')
    s.async = true
    s.dataset.solaraAdsense = '1'
    s.crossOrigin = 'anonymous'
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`
    document.head.appendChild(s)
  }

  // Wait for load + idle; also on first user gesture as a fallback
  const start = () => scheduleIdle(inject, 4500)
  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start, { once: true })

  const onInteract = () => {
    inject()
    window.removeEventListener('pointerdown', onInteract)
    window.removeEventListener('keydown', onInteract)
  }
  window.addEventListener('pointerdown', onInteract, { once: true, passive: true })
  window.addEventListener('keydown', onInteract, { once: true })
}
