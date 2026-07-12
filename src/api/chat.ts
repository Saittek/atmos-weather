import { getToken } from './auth'
import { getApiBase } from '../lib/native'

export interface ChatMessage {
  id: string
  userId: string
  userName: string
  text: string
  createdAt: string
}

export interface ChatRoom {
  id: string
  label: string
  lat: number
  lon: number
  messageCount?: number
  activeNearby?: number
}

function apiUrl(path: string): string {
  const p = path.startsWith('/api') ? path : `/api${path}`
  const base = getApiBase()
  return base ? `${base}${p}` : p
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
    throw new Error('Chat server offline — run npm run dev')
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error || `Chat failed (${res.status})`)
  return body as T
}

export async function fetchChatRoom(
  lat: number,
  lon: number,
  name?: string,
): Promise<ChatRoom> {
  const q = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
  })
  if (name) q.set('name', name)
  return request<ChatRoom>(`/api/chat/room?${q}`)
}

export async function fetchChatMessages(
  roomId: string,
  opts?: { after?: string; limit?: number },
): Promise<{ messages: ChatMessage[]; onlineHint: number; label: string }> {
  const q = new URLSearchParams()
  if (opts?.after) q.set('after', opts.after)
  if (opts?.limit) q.set('limit', String(opts.limit))
  const qs = q.toString()
  return request(`/api/chat/${encodeURIComponent(roomId)}/messages${qs ? `?${qs}` : ''}`)
}

export async function sendChatMessage(
  roomId: string,
  body: { text: string; lat: number; lon: number; placeLabel?: string },
): Promise<ChatMessage> {
  const res = await request<{ message: ChatMessage }>(
    `/api/chat/${encodeURIComponent(roomId)}/messages`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )
  return res.message
}
