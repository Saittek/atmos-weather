/**
 * APNs HTTP/2 sender for Cloudflare Workers.
 * Requires secrets:
 *   APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_PRIVATE_KEY (p8 PEM body)
 * Optional: APNS_PRODUCTION=true for App Store builds (default sandbox).
 */

function pemToArrayBuffer(pem) {
  const b64 = String(pem)
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/-----BEGIN EC PRIVATE KEY-----/g, '')
    .replace(/-----END EC PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

function b64url(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function textToB64url(text) {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

let jwtCache = { token: null, exp: 0 }

export function isApnsConfigured(env) {
  return Boolean(
    env.APNS_KEY_ID &&
      env.APNS_TEAM_ID &&
      env.APNS_BUNDLE_ID &&
      env.APNS_PRIVATE_KEY,
  )
}

async function getApnsJwt(env) {
  const now = Math.floor(Date.now() / 1000)
  if (jwtCache.token && jwtCache.exp > now + 60) return jwtCache.token

  const header = textToB64url(JSON.stringify({ alg: 'ES256', kid: env.APNS_KEY_ID }))
  const claims = textToB64url(
    JSON.stringify({ iss: env.APNS_TEAM_ID, iat: now }),
  )
  const unsigned = `${header}.${claims}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(env.APNS_PRIVATE_KEY),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsigned),
  )
  // WebCrypto returns IEEE P1363; APNs expects that for ES256 in JWT
  const token = `${unsigned}.${b64url(sig)}`
  jwtCache = { token, exp: now + 50 * 60 }
  return token
}

/**
 * @param {any} env
 * @param {string} deviceToken
 * @param {{ title: string, body: string, url?: string, tag?: string }} payload
 */
export async function sendApns(env, deviceToken, payload) {
  if (!isApnsConfigured(env)) {
    return { ok: false, status: 0, skipped: true, reason: 'apns not configured' }
  }
  const token = deviceToken.replace(/\s+/g, '')
  if (!/^[0-9a-fA-F]{64}$/.test(token) && token.length < 32) {
    return { ok: false, status: 400, reason: 'invalid token' }
  }

  const jwt = await getApnsJwt(env)
  const host =
    env.APNS_PRODUCTION === 'true' || env.APNS_PRODUCTION === '1'
      ? 'https://api.push.apple.com'
      : 'https://api.sandbox.push.apple.com'

  const body = {
    aps: {
      alert: {
        title: payload.title,
        body: payload.body,
      },
      sound: 'default',
      'thread-id': payload.tag || 'solara-alert',
      'mutable-content': 1,
    },
    url: payload.url || 'https://solaraweather.com/chase',
    solara: true,
  }

  try {
    const res = await fetch(`${host}/3/device/${token}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${jwt}`,
        'apns-topic': env.APNS_BUNDLE_ID,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': '0',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    return {
      ok: res.status === 200,
      status: res.status,
      reason: res.status === 200 ? undefined : await res.text().catch(() => ''),
    }
  } catch (e) {
    return {
      ok: false,
      status: 0,
      reason: e instanceof Error ? e.message : 'apns fetch failed',
    }
  }
}
