import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Mobile pull-to-refresh from the top of the page.
 * Skips when the user is mid-scroll or interacting with a map/input.
 */
export function usePullToRefresh(onRefresh: () => void | Promise<void>, enabled = true) {
  const [pulling, setPulling] = useState(false)
  const [distance, setDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const armed = useRef(false)
  const distanceRef = useRef(0)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  const THRESHOLD = 72
  const MAX = 120

  const runRefresh = useCallback(async () => {
    setRefreshing(true)
    setPulling(false)
    distanceRef.current = 0
    setDistance(0)
    try {
      await onRefreshRef.current()
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return

    const isBlockedTarget = (t: EventTarget | null) => {
      if (!(t instanceof Element)) return false
      return Boolean(
        t.closest(
          'input, textarea, select, button, a, .leaflet-container, .radar-panel, .map-chunk-fallback, .hourly-scroll, .week-strip-row',
        ),
      )
    }

    const onStart = (e: TouchEvent) => {
      if (refreshing) return
      if (window.scrollY > 4) {
        startY.current = null
        armed.current = false
        return
      }
      if (isBlockedTarget(e.target)) {
        startY.current = null
        return
      }
      startY.current = e.touches[0]?.clientY ?? null
      armed.current = true
    }

    const onMove = (e: TouchEvent) => {
      if (!armed.current || startY.current == null || refreshing) return
      if (window.scrollY > 4) {
        setPulling(false)
        distanceRef.current = 0
        setDistance(0)
        return
      }
      const y = e.touches[0]?.clientY ?? startY.current
      const dy = y - startY.current
      if (dy <= 0) {
        setPulling(false)
        distanceRef.current = 0
        setDistance(0)
        return
      }
      const d = Math.min(MAX, dy * 0.55)
      distanceRef.current = d
      setPulling(true)
      setDistance(d)
      if (d > 12 && e.cancelable) e.preventDefault()
    }

    const onEnd = () => {
      if (!armed.current) return
      armed.current = false
      startY.current = null
      if (distanceRef.current >= THRESHOLD && !refreshing) {
        void runRefresh()
      } else {
        setPulling(false)
        distanceRef.current = 0
        setDistance(0)
      }
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled, refreshing, runRefresh])

  return {
    pulling,
    distance,
    refreshing,
    progress: Math.min(1, distance / THRESHOLD),
  }
}
