/**
 * Web Push + native device registration for Solara alert notifications.
 */
import { getToken } from './auth'
import { getApiBase, isNativeApp } from '../lib/native'

function apiUrl(path: string): string {
  const p = path.startsWith('/api') ? path : `/api${path}`
  const base = getApiBase()
  return base ? `${base}${p}` : p
}

async function authHeaders(): Promise<HeadersInit> {
  const token = getToken()
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function fetchVapidPublicKey(): Promise<string | null> {
  const fromEnv = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
  if (fromEnv) return fromEnv
  try {
    const res = await fetch(apiUrl('/api/push/vapid-public-key'))
    if (!res.ok) return null
    const data = (await res.json()) as { publicKey?: string }
    return data.publicKey || null
  } catch {
    return null
  }
}

/** Subscribe browser/PWA to Web Push (requires signed-in account for server delivery). */
export async function subscribeWebPush(): Promise<{ ok: boolean; reason?: string }> {
  if (isNativeApp()) {
    return subscribeNativePush()
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'Push not supported in this browser' }
  }
  if (!getToken()) {
    return { ok: false, reason: 'Sign in to receive alert notifications when the app is closed' }
  }

  try {
    if (Notification.permission === 'denied') {
      return { ok: false, reason: 'Notifications blocked in browser settings' }
    }
    if (Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return { ok: false, reason: 'Permission denied' }
    }

    const publicKey = await fetchVapidPublicKey()
    if (!publicKey) return { ok: false, reason: 'Push server not configured' }

    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })
    }

    const json = sub.toJSON()
    const res = await fetch(apiUrl('/api/push/subscribe'), {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent: navigator.userAgent,
      }),
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string }
      return { ok: false, reason: err.error || 'Could not save subscription' }
    }
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : 'Push subscribe failed',
    }
  }
}

export async function unsubscribeWebPush(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const endpoint = sub.endpoint
        await sub.unsubscribe().catch(() => {})
        if (getToken()) {
          await fetch(apiUrl('/api/push/unsubscribe'), {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify({ endpoint }),
          }).catch(() => {})
        }
      }
    }
  } catch {
    /* ignore */
  }
}

async function subscribeNativePush(): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return { ok: false, reason: 'Permission denied' }
    }

    // Capacitor Push Notifications (remote) — token stored for APNs/FCM later
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications')
      const perm = await PushNotifications.requestPermissions()
      if (perm.receive !== 'granted') {
        // Fall through to local notifications only
      } else {
        await PushNotifications.register()
        PushNotifications.addListener('registration', (token) => {
          if (!getToken() || !token?.value) return
          void fetch(apiUrl('/api/push/device'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
            body: JSON.stringify({
              token: token.value,
              platform: /android/i.test(navigator.userAgent) ? 'android' : 'ios',
            }),
          }).catch(() => {})
        })
      }
    } catch {
      /* plugin may be missing until cap sync */
    }

    // Local notifications — works offline for immediate in-app triggers
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      await LocalNotifications.requestPermissions()
    } catch {
      /* optional */
    }

    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : 'Native push failed',
    }
  }
}

/** Fire a local native notification (Capacitor) or browser Notification */
export async function showLocalAlert(title: string, body: string, id?: string) {
  if (isNativeApp()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      const nid = Math.abs(
        Array.from(id || title + body).reduce((a, c) => a + c.charCodeAt(0), 0),
      ) % 100000
      await LocalNotifications.schedule({
        notifications: [
          {
            id: nid,
            title,
            body,
            schedule: { at: new Date(Date.now() + 500) },
            extra: { solara: true },
          },
        ],
      })
      return
    } catch {
      /* fall through */
    }
  }
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: '/icons/icon-192.png', tag: id })
    } catch {
      /* ignore */
    }
  }
}
