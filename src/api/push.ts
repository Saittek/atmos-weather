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

/**
 * Ensure push subscription is registered with the server.
 * Always re-POSTs the current browser subscription (idempotent upsert) so
 * VAPID rotation / expired endpoints recover without toggling Notify off/on.
 */
export async function ensurePushSubscription(): Promise<{ ok: boolean; reason?: string }> {
  return subscribeWebPush({ forceServerSync: true })
}

const PUSH_STATUS_KEY = 'solara-push-status-v1'

export interface PushStatus {
  lastOkAt?: number
  lastError?: string
  lastTestAt?: number
  platform?: string
}

export function loadPushStatus(): PushStatus {
  try {
    const raw = localStorage.getItem(PUSH_STATUS_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as PushStatus
  } catch {
    return {}
  }
}

function savePushStatus(patch: PushStatus) {
  try {
    const next = { ...loadPushStatus(), ...patch }
    localStorage.setItem(PUSH_STATUS_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

/** Local test notification so users can verify permission without waiting for weather. */
export async function sendTestNotification(): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (isNativeApp()) {
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications')
        const perm = await LocalNotifications.requestPermissions()
        if (perm.display !== 'granted') {
          return { ok: false, reason: 'Notification permission denied' }
        }
        await LocalNotifications.schedule({
          notifications: [
            {
              id: Math.floor(Date.now() % 1_000_000),
              title: 'Solara test',
              body: 'Alerts will look like this when weather risks appear.',
              schedule: { at: new Date(Date.now() + 500) },
            },
          ],
        })
        savePushStatus({ lastTestAt: Date.now(), lastOkAt: Date.now(), platform: 'native' })
        return { ok: true }
      } catch {
        /* fall through to web */
      }
    }

    if (!('Notification' in window)) {
      return { ok: false, reason: 'Notifications not supported' }
    }
    if (Notification.permission !== 'granted') {
      const p = await Notification.requestPermission()
      if (p !== 'granted') return { ok: false, reason: 'Permission denied' }
    }
    // Prefer SW showNotification when available (works more like real push)
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready
      await reg.showNotification('Solara test', {
        body: 'Alerts will look like this when the app is closed.',
        icon: '/icons/icon-192.png',
        tag: 'solara-test',
        data: { url: '/' },
      })
    } else {
      new Notification('Solara test', {
        body: 'Alerts will look like this when the app is closed.',
        icon: '/icons/icon-192.png',
        tag: 'solara-test',
      })
    }
    savePushStatus({ lastTestAt: Date.now(), lastOkAt: Date.now(), platform: 'web' })
    // Also re-sync subscription if signed in
    const sub = await ensurePushSubscription()
    if (!sub.ok && sub.reason) {
      savePushStatus({ lastError: sub.reason })
    } else {
      savePushStatus({ lastOkAt: Date.now(), lastError: undefined })
    }
    return { ok: true }
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'Test failed'
    savePushStatus({ lastError: reason })
    return { ok: false, reason }
  }
}

export function recordPushSyncResult(ok: boolean, reason?: string) {
  if (ok) savePushStatus({ lastOkAt: Date.now(), lastError: undefined })
  else if (reason) savePushStatus({ lastError: reason })
}

/** Subscribe browser/PWA to Web Push (requires signed-in account for server delivery). */
export async function subscribeWebPush(opts?: {
  forceServerSync?: boolean
}): Promise<{ ok: boolean; reason?: string }> {
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

    // Always sync to server (forceServerSync default true via ensurePushSubscription)
    const json = sub.toJSON()
    if (!json.endpoint) {
      return { ok: false, reason: 'Invalid push subscription' }
    }
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
      // VAPID key rotation: drop old sub and create a new one
      if (res.status === 400 || res.status === 410 || opts?.forceServerSync) {
        try {
          await sub.unsubscribe()
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
          })
          const json2 = sub.toJSON()
          const res2 = await fetch(apiUrl('/api/push/subscribe'), {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify({
              endpoint: json2.endpoint,
              keys: json2.keys,
              userAgent: navigator.userAgent,
            }),
          })
          if (res2.ok) return { ok: true }
        } catch {
          /* fall through */
        }
      }
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
    let remoteOk = false

    // Capacitor Push Notifications (remote) — token stored for APNs send when secrets set
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications')
      const perm = await PushNotifications.requestPermissions()
      if (perm.receive === 'granted') {
        // Avoid duplicate listeners across re-subscribe
        try {
          await PushNotifications.removeAllListeners()
        } catch {
          /* ignore */
        }
        await PushNotifications.addListener('registration', (token) => {
          if (!token?.value) return
          const auth = getToken()
          if (!auth) return
          void fetch(apiUrl('/api/push/device'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${auth}`,
            },
            body: JSON.stringify({
              token: token.value,
              platform: isNativeApp() && /android/i.test(navigator.userAgent)
                ? 'android'
                : 'ios',
            }),
          }).catch(() => {})
        })
        await PushNotifications.addListener('registrationError', (err) => {
          console.warn('Solara APNs registration error', err)
        })
        await PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (action) => {
            const data = action.notification?.data as { url?: string } | undefined
            const path = data?.url
            if (path && typeof path === 'string') {
              try {
                const u = path.startsWith('http')
                  ? new URL(path)
                  : new URL(path, window.location.origin)
                window.location.assign(u.pathname + u.search)
              } catch {
                /* ignore */
              }
            }
          },
        )
        await PushNotifications.register()
        remoteOk = true
      }
    } catch {
      /* plugin may be missing until cap sync */
    }

    // Local notifications — proximity threats + offline triggers
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      await LocalNotifications.requestPermissions()
    } catch {
      /* optional */
    }

    if (!getToken()) {
      return {
        ok: remoteOk,
        reason: remoteOk
          ? 'Signed out — device token not saved to server'
          : 'Sign in to register for remote push',
      }
    }
    return {
      ok: true,
      reason: remoteOk
        ? undefined
        : 'Local alerts on; remote APNs needs permission + Apple keys on server',
    }
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
