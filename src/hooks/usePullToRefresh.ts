import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Pull-to-refresh when the user swipes down at the top of the page.
 * Works on touch devices (phones, tablets, Capacitor) — not mouse-only desktop.
 */
export function usePullToRefresh(onRefresh: () => void | Promise<void>, enabled = true) {
  const [pulling, setPulling] = useState(false)
  const [distance, setDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const armed = useRef(false)
  const distanceRef = useRef(0)
  const refreshingRef = useRef(false)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  const THRESHOLD = 68
  const MAX = 130

  const getScrollTop = () => {
    if (typeof window === 'undefined') return 0
    return (
      window.scrollY ||
      window.pageYOffset ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0
    )
  }

  const runRefresh = useCallback(async () => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    setRefreshing(true)
    setPulling(false)
    distanceRef.current = 0
    setDistance(0)
    try {
      // Light haptic on native if available
      try {
        const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
        await Haptics.impact({ style: ImpactStyle.Light })
      } catch {
        /* web / no plugin */
      }
      await onRefreshRef.current()
    } finally {
      refreshingRef.current = false
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return

    // Touch-only: phones, tablets, Capacitor WebView
    const canTouch =
      'ontouchstart' in window ||
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
    if (!canTouch) return

    /** Block only maps, form fields, and horizontal carousels — not the top bar. */
    const isBlockedTarget = (t: EventTarget | null) => {
      if (!(t instanceof Element)) return false
      return Boolean(
        t.closest(
          [
            'input',
            'textarea',
            'select',
            '[contenteditable="true"]',
            '.leaflet-container',
            '.radar-panel',
            '.map-chunk-fallback',
            '.hourly-scroll',
            '.week-strip-row',
            '.globe-stage',
            '.globe-page',
            '.maplibregl-map',
            '.maplibregl-canvas-container',
            '.globe-options-menu',
            '[data-no-ptr]',
          ].join(', '),
        ),
      )
    }

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current) return
      if (getScrollTop() > 6) {
        startY.current = null
        armed.current = false
        return
      }
      if (isBlockedTarget(e.target)) {
        startY.current = null
        armed.current = false
        return
      }
      startY.current = e.touches[0]?.clientY ?? null
      armed.current = true
      distanceRef.current = 0
    }

    const onMove = (e: TouchEvent) => {
      if (!armed.current || startY.current == null || refreshingRef.current) return
      if (getScrollTop() > 6) {
        armed.current = false
        setPulling(false)
        distanceRef.current = 0
        setDistance(0)
        return
      }
      const y = e.touches[0]?.clientY ?? startY.current
      const dy = y - startY.current
      if (dy <= 4) {
        if (dy <= 0) {
          setPulling(false)
          distanceRef.current = 0
          setDistance(0)
        }
        return
      }
      // Rubber-band feel
      const d = Math.min(MAX, dy * 0.5)
      distanceRef.current = d
      setPulling(true)
      setDistance(d)
      // Stop browser/WebView overscroll so our gesture wins (iOS/Capacitor)
      if (d > 8 && e.cancelable) e.preventDefault()
    }

    const onEnd = () => {
      if (!armed.current) return
      armed.current = false
      startY.current = null
      if (distanceRef.current >= THRESHOLD && !refreshingRef.current) {
        void runRefresh()
      } else {
        setPulling(false)
        distanceRef.current = 0
        setDistance(0)
      }
    }

    window.addEventListener('touchstart', onStart, { passive: true, capture: true })
    window.addEventListener('touchmove', onMove, { passive: false, capture: true })
    window.addEventListener('touchend', onEnd, { passive: true, capture: true })
    window.addEventListener('touchcancel', onEnd, { passive: true, capture: true })
    return () => {
      window.removeEventListener('touchstart', onStart, true)
      window.removeEventListener('touchmove', onMove, true)
      window.removeEventListener('touchend', onEnd, true)
      window.removeEventListener('touchcancel', onEnd, true)
    }
  }, [enabled, runRefresh])

  return {
    pulling,
    distance,
    refreshing,
    progress: Math.min(1, distance / THRESHOLD),
  }
}
