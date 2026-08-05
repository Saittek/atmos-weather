/**
 * Privacy-light usage analytics.
 * Sends only a coarse page path (no lat/lon, query strings, or user ids).
 * Opt-out: localStorage solara-analytics=0
 */

import { getApiBase } from './native'

const OPT_OUT_KEY = 'solara-analytics'
const SESSION_KEY = 'solara-analytics-session'
const THROTTLE_MS = 8_000

let lastPath = ''
let lastAt = 0

function optedOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === '0'
  } catch {
    return false
  }
}

/** Normalize to a short allow-listed path bucket. */
export function normalizePagePath(pathname: string): string {
  const p = (pathname || '/').split('?')[0].split('#')[0] || '/'
  if (p === '/' || p === '/w') return '/'
  if (p.startsWith('/radar')) return '/radar'
  if (p.startsWith('/globe') || p.startsWith('/earth')) return '/globe'
  if (p.startsWith('/chase') || p.startsWith('/storm')) return '/chase'
  return '/other'
}

function sessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY)
    if (!id) {
      id = crypto.randomUUID?.() ?? String(Date.now())
      sessionStorage.setItem(SESSION_KEY, id)
    }
    return id.slice(0, 36)
  } catch {
    return 'anon'
  }
}

/**
 * Fire-and-forget page view. Safe to call on every route change.
 */
export function trackPageView(pathname: string): void {
  if (typeof window === 'undefined') return
  if (optedOut()) return
  if (!import.meta.env.PROD && !import.meta.env.VITE_ANALYTICS_DEV) return

  const path = normalizePagePath(pathname)
  const now = Date.now()
  if (path === lastPath && now - lastAt < THROTTLE_MS) return
  lastPath = path
  lastAt = now

  const base = getApiBase()
  const url = `${base || ''}/api/metrics/page`
  const body = JSON.stringify({ path, sid: sessionId() })

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      navigator.sendBeacon(url, blob)
      return
    }
  } catch {
    /* fall through */
  }

  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {})
}

export function setAnalyticsOptOut(optOut: boolean) {
  try {
    localStorage.setItem(OPT_OUT_KEY, optOut ? '0' : '1')
  } catch {
    /* ignore */
  }
}

export function isAnalyticsOptedOut(): boolean {
  return optedOut()
}

/**
 * Privacy-light client error ping (no stack, no coords).
 * Used for ops signal only — never PII.
 */
export function trackClientError(message: string, context?: string): void {
  if (typeof window === 'undefined') return
  if (optedOut()) return
  if (!import.meta.env.PROD && !import.meta.env.VITE_ANALYTICS_DEV) return

  const base = getApiBase()
  const url = `${base || ''}/api/metrics/error`
  const body = JSON.stringify({
    msg: String(message || 'error').slice(0, 160),
    ctx: String(context || '').slice(0, 64),
    path: normalizePagePath(window.location.pathname),
  })

  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
      return
    }
  } catch {
    /* fall through */
  }
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {})
}
