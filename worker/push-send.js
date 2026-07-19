/**
 * Web Push sender for Cloudflare Workers (Web Crypto).
 */
import { buildPushPayload } from '@block65/webcrypto-web-push'

export function getVapidConfig(env) {
  const publicKey = env.VAPID_PUBLIC_KEY
  const privateKey = env.VAPID_PRIVATE_KEY
  const subject = env.VAPID_SUBJECT || 'mailto:support@solaraweather.com'
  if (!publicKey || !privateKey) return null
  return { subject, publicKey, privateKey }
}

/**
 * @param {object} sub - { endpoint, p256dh, auth }
 * @param {object} payload - JSON-serializable notification data
 */
export async function sendWebPush(env, sub, payload) {
  const vapid = getVapidConfig(env)
  if (!vapid) throw new Error('VAPID keys not configured')

  const subscription = {
    endpoint: sub.endpoint,
    expirationTime: null,
    keys: {
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
  }

  const message = {
    data: JSON.stringify(payload),
    options: {
      ttl: 60 * 60,
      urgency: payload.urgency || 'high',
      topic: payload.topic || 'solara-alert',
    },
  }

  const init = await buildPushPayload(message, subscription, vapid)
  const res = await fetch(sub.endpoint, init)
  return { status: res.status, ok: res.status >= 200 && res.status < 300 }
}
