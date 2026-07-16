import type { LocationResult } from './types'
import type { DensityMode, ThemeMode } from './types'
import type { Units } from '../utils/format'
import { getApiBase } from '../lib/native'

const TOKEN_KEY = 'atmos-auth-token'

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

function apiUrl(path: string): string {
  const p = path.startsWith('/api') ? path : `/api${path}`
  const base = getApiBase()
  return base ? `${base}${p}` : p
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
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
      'Cannot reach Atmos server. Online: check the site is fully deployed. Local: run npm run dev (API + web).',
    )
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) {
    throw new Error(body.error || `Request failed (${res.status})`)
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
  return data
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const data = await request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  setToken(data.token)
  return data
}

export async function fetchMe(): Promise<{ user: AuthUser; data: CloudPrefs } | null> {
  if (!getToken()) return null
  try {
    return await request<{ user: AuthUser; data: CloudPrefs }>('/api/auth/me')
  } catch {
    setToken(null)
    return null
  }
}

export async function saveUserData(data: CloudPrefs): Promise<CloudPrefs> {
  const res = await request<{ data: CloudPrefs }>('/api/user/data', {
    method: 'PUT',
    body: JSON.stringify({ data }),
  })
  return res.data
}

export function logout() {
  setToken(null)
}
