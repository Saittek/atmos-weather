import type { LocationResult } from './types'
import type { DensityMode, ThemeMode } from './types'
import type { Units } from '../utils/format'
import { getApiBase } from '../lib/native'

const TOKEN_KEY = 'solara-auth-token'
const LEGACY_TOKEN_KEY = 'atmos-auth-token'
const SESSION_CACHE_KEY = 'solara-auth-session'
const REMEMBER_EMAIL_KEY = 'solara-auth-email'

export interface AuthUser {
  id: string
  email: string
  name: string
  createdAt: string
}

export interface CloudPrefs {
  units: Units
  theme: ThemeMode
  density: DensityMode
  lastLocation: LocationResult | null
  /** Exact home (full-precision lat/lon) */
  homeLocation?: LocationResult | null
  favorites: LocationResult[]
  severeMode: boolean
  stormMode?: boolean
  notifyAlerts: boolean
}

export interface AuthResponse {
  token: string
  user: AuthUser
  data: CloudPrefs
}

export interface SessionSnapshot {
  user: AuthUser
  data: CloudPrefs
  savedAt: number
}

function apiUrl(path: string): string {
  const p = path.startsWith('/api') ? path : `/api${path}`
  const base = getApiBase()
  return base ? `${base}${p}` : p
}

export function getToken(): string | null {
  try {
    let token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      // Migrate from old Atmos key so existing sessions stay signed in
      token = localStorage.getItem(LEGACY_TOKEN_KEY)
      if (token) {
        localStorage.setItem(TOKEN_KEY, token)
        localStorage.removeItem(LEGACY_TOKEN_KEY)
      }
    }
    return token
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token)
      localStorage.removeItem(LEGACY_TOKEN_KEY)
    } else {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(LEGACY_TOKEN_KEY)
    }
  } catch {
    /* ignore */
  }
}

export function getCachedSession(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY)
    if (!raw) return null
    const snap = JSON.parse(raw) as SessionSnapshot
    if (!snap?.user?.id || !snap.data) return null
    // Soft expiry for offline cache (token may still be valid)
    if (Date.now() - (snap.savedAt || 0) > 45 * 24 * 60 * 60 * 1000) return null
    return snap
  } catch {
    return null
  }
}

export function setCachedSession(user: AuthUser, data: CloudPrefs) {
  try {
    const snap: SessionSnapshot = { user, data, savedAt: Date.now() }
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(snap))
  } catch {
    /* ignore */
  }
}

export function clearCachedSession() {
  try {
    localStorage.removeItem(SESSION_CACHE_KEY)
  } catch {
    /* ignore */
  }
}

export function getRememberedEmail(): string | null {
  try {
    return localStorage.getItem(REMEMBER_EMAIL_KEY)
  } catch {
    return null
  }
}

export function setRememberedEmail(email: string | null) {
  try {
    if (email) localStorage.setItem(REMEMBER_EMAIL_KEY, email.trim().toLowerCase())
    else localStorage.removeItem(REMEMBER_EMAIL_KEY)
  } catch {
    /* ignore */
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let res: Response
  try {
    res = await fetch(apiUrl(path), { ...init, headers })
  } catch {
    throw new Error(
      'Cannot reach Solara server. Online: check the site is fully deployed. Local: run npm run dev (API + web).',
    )
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) {
    const err = new Error(body.error || `Request failed (${res.status})`) as Error & {
      status?: number
    }
    err.status = res.status
    throw err
  }
  return body as T
}

export async function register(
  email: string,
  password: string,
  name: string,
): Promise<AuthResponse> {
  const data = await request<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  })
  setToken(data.token)
  setCachedSession(data.user, data.data)
  setRememberedEmail(data.user.email)
  return data
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const data = await request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  setToken(data.token)
  setCachedSession(data.user, data.data)
  setRememberedEmail(data.user.email)
  return data
}

/**
 * Restore session from stored JWT.
 * - Uses cached profile immediately-friendly via getCachedSession()
 * - Only clears token on true auth failure (401)
 * - Keeps token on network blips and returns cache when possible
 */
export async function fetchMe(): Promise<{ user: AuthUser; data: CloudPrefs } | null> {
  if (!getToken()) {
    clearCachedSession()
    return null
  }
  try {
    const me = await request<{ user: AuthUser; data: CloudPrefs }>('/api/auth/me')
    setCachedSession(me.user, me.data)
    setRememberedEmail(me.user.email)
    return me
  } catch (e) {
    const status = (e as Error & { status?: number }).status
    if (status === 401) {
      setToken(null)
      clearCachedSession()
      return null
    }
    // Offline / server hiccup — stay signed in with last known profile
    const cached = getCachedSession()
    if (cached) return { user: cached.user, data: cached.data }
    return null
  }
}

export async function saveUserData(data: CloudPrefs): Promise<CloudPrefs> {
  const res = await request<{ data: CloudPrefs }>('/api/user/data', {
    method: 'PUT',
    body: JSON.stringify({ data }),
  })
  const cached = getCachedSession()
  if (cached) setCachedSession(cached.user, res.data)
  return res.data
}

export function logout() {
  setToken(null)
  clearCachedSession()
}
