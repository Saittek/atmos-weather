/**
 * Solara API — Cloudflare Worker (auth, prefs sync, area chat, FIRMS fires, push)
 * Serves /api/*; static SPA assets handled by Workers Static Assets.
 */

import { runAlertPushCron } from './push-cron.js'
import { getVapidConfig } from './push-send.js'
import { getWeatherVideos } from './weather-videos.js'
import { getTropicalGlobeData } from './tropical.js'
import { computeIssPasses } from './iss-passes.js'

const TOKEN_DAYS = 30
const CELL = 0.2
const MAX_TEXT = 280
const MAX_PER_ROOM = 200
const PBKDF2_ITERS = 100_000
const DEV_JWT_FALLBACK = 'atmos-dev-secret-change-me'

// ── Auth rate limiting (per isolate + Cache API; best-effort edge protection) ──
/** @type {Map<string, { count: number, resetAt: number }>} */
const authHits = new Map()

function clientIp(request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

/**
 * Sliding fixed window rate limit.
 * @returns {Response|null} 429 response if limited, else null
 */
function rateLimitAuth(request, bucket, limit = 12, windowMs = 15 * 60 * 1000) {
  const ip = clientIp(request)
  const key = `${bucket}:${ip}`
  const now = Date.now()
  let entry = authHits.get(key)
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs }
    authHits.set(key, entry)
  }
  entry.count += 1
  // Opportunistic cleanup
  if (authHits.size > 5000) {
    for (const [k, v] of authHits) {
      if (v.resetAt <= now) authHits.delete(k)
    }
  }
  if (entry.count > limit) {
    const retry = Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
    return err('Too many attempts — try again later', 429, {
      'Retry-After': String(retry),
    })
  }
  return null
}

/** Coarse path buckets for privacy-light metrics (no lat/lon/query). */
function sanitizeMetricPath(raw) {
  const p = String(raw || '/')
    .split('?')[0]
    .split('#')[0]
    .slice(0, 64)
  if (p === '/' || p === '/w' || p === '/smoke') return p === '/smoke' ? '/smoke' : '/'
  if (p.startsWith('/radar')) return '/radar'
  if (p.startsWith('/globe') || p.startsWith('/earth')) return '/globe'
  if (p.startsWith('/chase') || p.startsWith('/storm')) return '/chase'
  if (p.startsWith('/stargaze') || p.startsWith('/astro') || p.startsWith('/stars')) return '/stargaze'
  if (p.startsWith('/other')) return '/other'
  return '/other'
}

function getJwtSecret(env) {
  const s = env.JWT_SECRET
  if (typeof s === 'string' && s.length >= 16 && s !== DEV_JWT_FALLBACK) return s
  return null
}

// ── helpers ──────────────────────────────────────────────────────────

/** CORS for web + Capacitor iOS (capacitor:// / ionic:// / https) */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-cron-secret',
  'Access-Control-Max-Age': '86400',
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS,
      ...extra,
    },
  })
}

function err(message, status = 400, extraHeaders = {}) {
  return json({ error: message }, status, extraHeaders)
}

function b64url(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlToBytes(str) {
  const pad = '='.repeat((4 - (str.length % 4)) % 4)
  const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function defaultUserData() {
  return {
    units: 'imperial',
    theme: 'dark',
    density: 'comfortable',
    lastLocation: null,
    homeLocation: null,
    favorites: [],
    severeMode: true,
    stormMode: false,
    notifyAlerts: false,
    quietHoursEnabled: false,
    quietStart: '22:00',
    quietEnd: '07:00',
  }
}

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
  }
}

function parseUserData(raw) {
  try {
    const d = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {}
    return { ...defaultUserData(), ...d }
  } catch {
    return defaultUserData()
  }
}

/** Normalize a saved place (last location, home, favorite) */
function cleanLocation(loc) {
  if (!loc || typeof loc !== 'object') return null
  const lat = Number(loc.latitude)
  const lon = Number(loc.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return {
    id: loc.id != null ? loc.id : 1,
    name: String(loc.name || 'Place').slice(0, 120),
    latitude: lat,
    longitude: lon,
    elevation: loc.elevation != null ? Number(loc.elevation) : undefined,
    country_code: loc.country_code ? String(loc.country_code).slice(0, 8) : undefined,
    country: loc.country ? String(loc.country).slice(0, 80) : undefined,
    admin1: loc.admin1 ? String(loc.admin1).slice(0, 80) : undefined,
    timezone: loc.timezone ? String(loc.timezone).slice(0, 64) : undefined,
    population: loc.population != null ? Number(loc.population) : undefined,
  }
}

function cleanUserData(incoming) {
  const src = incoming && typeof incoming === 'object' ? incoming : {}
  const favorites = Array.isArray(src.favorites)
    ? src.favorites.map(cleanLocation).filter(Boolean).slice(0, 12)
    : []
  return {
    units: src.units === 'metric' ? 'metric' : 'imperial',
    theme: ['dark', 'light', 'auto'].includes(src.theme) ? src.theme : 'dark',
    density: src.density === 'compact' ? 'compact' : 'comfortable',
    lastLocation: cleanLocation(src.lastLocation),
    homeLocation: cleanLocation(src.homeLocation),
    favorites,
    severeMode: Boolean(src.severeMode),
    stormMode: Boolean(src.stormMode),
    notifyAlerts: Boolean(src.notifyAlerts),
    quietHoursEnabled: Boolean(src.quietHoursEnabled),
    quietStart:
      typeof src.quietStart === 'string' && /^\d{1,2}:\d{2}$/.test(src.quietStart)
        ? src.quietStart
        : '22:00',
    quietEnd:
      typeof src.quietEnd === 'string' && /^\d{1,2}:\d{2}$/.test(src.quietEnd)
        ? src.quietEnd
        : '07:00',
  }
}

function validateEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8
}

function roomIdFromCoords(lat, lon) {
  const la = Math.round(Number(lat) / CELL) * CELL
  const lo = Math.round(Number(lon) / CELL) * CELL
  return `g_${la.toFixed(1)}_${lo.toFixed(1)}`
}

function getRoomMeta(lat, lon, placeName) {
  return {
    id: roomIdFromCoords(lat, lon),
    label: placeName ? `Near ${placeName}` : 'Area chat',
    lat: Number(lat),
    lon: Number(lon),
  }
}

// ── crypto: password + JWT (Web Crypto, no Node deps) ────────────────

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return `pbkdf2$${PBKDF2_ITERS}$${b64url(salt)}$${b64url(bits)}`
}

async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false
  // pbkdf2$iters$salt$hash
  if (stored.startsWith('pbkdf2$')) {
    const parts = stored.split('$')
    if (parts.length !== 4) return false
    const iters = parseInt(parts[1], 10) || PBKDF2_ITERS
    const salt = b64urlToBytes(parts[2])
    const expected = parts[3]
    const enc = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    )
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: iters, hash: 'SHA-256' },
      keyMaterial,
      256,
    )
    return b64url(bits) === expected
  }
  // Legacy bcrypt hashes from local Express server cannot be verified here
  return false
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

async function signToken(user, secret) {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const now = Math.floor(Date.now() / 1000)
  const payload = b64url(
    new TextEncoder().encode(
      JSON.stringify({
        sub: user.id,
        email: user.email,
        iat: now,
        exp: now + TOKEN_DAYS * 24 * 60 * 60,
      }),
    ),
  )
  const data = `${header}.${payload}`
  const key = await importHmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return `${data}.${b64url(sig)}`
}

async function verifyToken(token, secret) {
  const parts = String(token || '').split('.')
  if (parts.length !== 3) throw new Error('bad token')
  const [header, payload, sig] = parts
  const key = await importHmacKey(secret)
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    b64urlToBytes(sig),
    new TextEncoder().encode(`${header}.${payload}`),
  )
  if (!ok) throw new Error('bad sig')
  const body = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload)))
  if (body.exp && body.exp < Math.floor(Date.now() / 1000)) throw new Error('expired')
  return body
}

async function requireUser(request, env) {
  const header = request.headers.get('Authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return { error: err('Sign in required', 401) }
  const secret = getJwtSecret(env)
  if (!secret) return { error: err('Server misconfigured (JWT_SECRET)', 503) }
  try {
    const payload = await verifyToken(token, secret)
    const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(payload.sub)
      .first()
    if (!row) return { error: err('Account not found', 401) }
    return { user: row }
  } catch {
    return { error: err('Session expired — please sign in again', 401) }
  }
}

// ── FIRMS fires (Cache API) ──────────────────────────────────────────

const FIRMS_SOURCES = [
  'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_24h.csv',
  'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv',
]

function parseCsv(text, satLabel) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const latI = header.indexOf('latitude')
  const lonI = header.indexOf('longitude')
  const brightI = header.findIndex((h) => h.includes('bright'))
  const frpI = header.indexOf('frp')
  const dateI = header.indexOf('acq_date')
  const timeI = header.indexOf('acq_time')
  if (latI < 0 || lonI < 0) return []
  const out = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    const lat = parseFloat(cols[latI])
    const lon = parseFloat(cols[lonI])
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue
    out.push({
      lat,
      lon,
      brightness: brightI >= 0 ? parseFloat(cols[brightI]) || 0 : 0,
      frp: frpI >= 0 ? parseFloat(cols[frpI]) || 0 : 0,
      sat: satLabel,
      acq: dateI >= 0 ? `${cols[dateI]}${timeI >= 0 ? ` ${cols[timeI]}` : ''}` : '',
    })
  }
  return out
}

async function loadFirePoints() {
  const cache = caches.default
  const cacheKey = new Request('https://atmos-internal/firms-points-v1')
  const cached = await cache.match(cacheKey)
  if (cached) {
    try {
      return await cached.json()
    } catch {
      /* reload */
    }
  }

  const points = []
  const seen = new Set()
  await Promise.all(
    FIRMS_SOURCES.map(async (url) => {
      try {
        const res = await fetch(url, {
          headers: { Accept: 'text/csv,*/*' },
          cf: { cacheTtl: 900, cacheEverything: true },
        })
        if (!res.ok) return
        const text = await res.text()
        const label = /viirs/i.test(url) ? 'VIIRS' : 'MODIS'
        for (const p of parseCsv(text, label)) {
          const k = `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`
          if (seen.has(k)) continue
          seen.add(k)
          points.push(p)
        }
      } catch {
        /* try other */
      }
    }),
  )

  if (points.length) {
    await cache.put(
      cacheKey,
      new Response(JSON.stringify(points), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=900',
        },
      }),
    )
  }
  return points
}

async function firesNear(lat, lon, radiusDeg = 2.5, limit = 120) {
  const all = await loadFirePoints()
  const r = Math.max(0.3, Math.min(8, radiusDeg))
  const hits = []
  for (const p of all) {
    if (Math.abs(p.lat - lat) > r) continue
    if (Math.abs(p.lon - lon) > r) continue
    const d =
      (p.lat - lat) * (p.lat - lat) +
      (p.lon - lon) * (p.lon - lon) * Math.cos((lat * Math.PI) / 180) ** 2
    hits.push({ ...p, d })
  }
  hits.sort((a, b) => a.d - b.d || b.frp - a.frp)
  return hits.slice(0, limit).map(({ d: _d, ...rest }) => rest)
}

// ── chat ─────────────────────────────────────────────────────────────

async function listMessages(db, roomId, { after, limit = 80 } = {}) {
  const room = await db.prepare('SELECT * FROM chat_rooms WHERE id = ?').bind(roomId).first()
  if (!room) {
    return { messages: [], onlineHint: 0, label: 'Area chat', total: 0 }
  }

  let rows
  if (after) {
    rows = await db
      .prepare(
        `SELECT id, user_id as userId, user_name as userName, text, created_at as createdAt
         FROM chat_messages WHERE room_id = ? AND created_at > ?
         ORDER BY created_at ASC LIMIT ?`,
      )
      .bind(roomId, after, limit)
      .all()
  } else {
    // last N messages
    rows = await db
      .prepare(
        `SELECT id, user_id as userId, user_name as userName, text, created_at as createdAt
         FROM chat_messages WHERE room_id = ?
         ORDER BY created_at DESC LIMIT ?`,
      )
      .bind(roomId, limit)
      .all()
    rows = { results: (rows.results || []).reverse() }
  }

  const countRow = await db
    .prepare('SELECT COUNT(*) as c FROM chat_messages WHERE room_id = ?')
    .bind(roomId)
    .first()

  const hourAgo = new Date(Date.now() - 3600_000).toISOString()
  const active = await db
    .prepare(
      `SELECT COUNT(DISTINCT user_id) as c FROM chat_messages
       WHERE room_id = ? AND created_at >= ?`,
    )
    .bind(roomId, hourAgo)
    .first()

  return {
    messages: rows.results || [],
    onlineHint: active?.c ?? 0,
    label: room.label || 'Area chat',
    total: countRow?.c ?? 0,
  }
}

/** Lightweight content filter — blocks spam/scam patterns only. */
function moderateChatText(text) {
  const t = text.toLowerCase()
  // Excessive URLs / invite spam
  const urlHits = (text.match(/https?:\/\//gi) || []).length
  if (urlHits >= 2) {
    return 'Please don’t post multiple links in one message'
  }
  if (
    /(free\s*crypto|double\s*your\s*money|telegram\.me\/join|bit\.ly\/|onlyfans\.com\/|viagra|casino\s*bonus)/i.test(
      t,
    )
  ) {
    return 'Message blocked by spam filter'
  }
  // Same character spam
  if (/(.)\1{12,}/.test(text)) {
    return 'Message looks like spam'
  }
  return null
}

async function postMessage(db, { roomId, userId, userName, text, placeLabel, lat, lon }) {
  const cleaned = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT)
  if (cleaned.length < 1) {
    const e = new Error('Message cannot be empty')
    e.code = 'EMPTY'
    throw e
  }
  const mod = moderateChatText(cleaned)
  if (mod) {
    const e = new Error(mod)
    e.code = 'MOD'
    throw e
  }

  let room = await db.prepare('SELECT * FROM chat_rooms WHERE id = ?').bind(roomId).first()
  const now = Date.now()
  const createdAt = new Date(now).toISOString()

  // Per-user hourly cap across rooms (abuse brake)
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString()
  const hourly = await db
    .prepare(
      `SELECT COUNT(*) as c FROM chat_messages WHERE user_id = ? AND created_at > ?`,
    )
    .bind(userId, hourAgo)
    .first()
  if ((hourly?.c ?? 0) >= 40) {
    const e = new Error('Hourly message limit reached — try again later')
    e.code = 'RATE'
    throw e
  }

  if (!room) {
    await db
      .prepare(
        `INSERT INTO chat_rooms (id, label, lat, lon, updated_at, last_by_user)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        roomId,
        placeLabel || 'Area chat',
        lat ?? null,
        lon ?? null,
        createdAt,
        JSON.stringify({ [userId]: now }),
      )
      .run()
  } else {
    let lastBy = {}
    try {
      lastBy = JSON.parse(room.last_by_user || '{}')
    } catch {
      lastBy = {}
    }
    // 4s between messages (was 2s)
    if (lastBy[userId] && now - lastBy[userId] < 4000) {
      const e = new Error('Slow down — wait a few seconds between messages')
      e.code = 'RATE'
      throw e
    }
    lastBy[userId] = now
    const newLabel =
      placeLabel && (!room.label || room.label === 'Area chat') ? placeLabel : room.label
    await db
      .prepare(
        `UPDATE chat_rooms SET label = ?, updated_at = ?, last_by_user = ?,
         lat = COALESCE(?, lat), lon = COALESCE(?, lon) WHERE id = ?`,
      )
      .bind(newLabel, createdAt, JSON.stringify(lastBy), lat ?? null, lon ?? null, roomId)
      .run()
  }

  const id = crypto.randomUUID()
  const name = String(userName || 'User').slice(0, 40)
  await db
    .prepare(
      `INSERT INTO chat_messages (id, room_id, user_id, user_name, text, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, roomId, userId, name, cleaned, createdAt)
    .run()

  // trim room
  const count = await db
    .prepare('SELECT COUNT(*) as c FROM chat_messages WHERE room_id = ?')
    .bind(roomId)
    .first()
  if ((count?.c ?? 0) > MAX_PER_ROOM) {
    await db
      .prepare(
        `DELETE FROM chat_messages WHERE room_id = ? AND id NOT IN (
           SELECT id FROM chat_messages WHERE room_id = ?
           ORDER BY created_at DESC LIMIT ?
         )`,
      )
      .bind(roomId, roomId, MAX_PER_ROOM)
      .run()
  }

  return { id, userId, userName: name, text: cleaned, createdAt }
}

// ── router ───────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method.toUpperCase()

    // Only handle /api/* — everything else falls through to static assets
    if (!path.startsWith('/api')) {
      if (env.ASSETS) return env.ASSETS.fetch(request)
      return new Response('Not found', { status: 404 })
    }

    // CORS preflight (web + Capacitor native)
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...CORS_HEADERS },
      })
    }

    try {
      if (path === '/api/health' && method === 'GET') {
        return json({
          ok: true,
          service: 'solara-api',
          version: '1.0.0',
          time: new Date().toISOString(),
          features: [
            'auth',
            'chat',
            'fires',
            'push',
            'weather-videos',
            'tropical',
            'metrics',
            'sky-kp',
            'sky-iss',
          ],
          runtime: 'cloudflare-worker',
          pushConfigured: Boolean(getVapidConfig(env)),
          d1: Boolean(env.DB),
          // Secret presence only — never values
          secrets: {
            jwt: Boolean(getJwtSecret(env)),
            cron: Boolean(env.CRON_SECRET && String(env.CRON_SECRET).length >= 8),
            vapidPrivate: Boolean(env.VAPID_PRIVATE_KEY),
            apns:
              Boolean(env.APNS_KEY_ID) &&
              Boolean(env.APNS_TEAM_ID) &&
              Boolean(env.APNS_BUNDLE_ID) &&
              Boolean(env.APNS_PRIVATE_KEY),
          },
          ship: {
            pushEntitlementNote:
              'Native aps-environment may be off until App ID has Push; web push uses VAPID',
          },
        })
      }

      // ── Stargaze: planetary Kp (aurora) ──
      if (path === '/api/sky/kp' && method === 'GET') {
        try {
          // Prefer 1-minute estimated Kp; fall back to planetary product
          const urls = [
            'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json',
            'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
          ]
          let kp = NaN
          let at
          let source = 'NOAA SWPC'
          for (const u of urls) {
            try {
              const res = await fetch(u, { cf: { cacheTtl: 180, cacheEverything: true } })
              if (!res.ok) continue
              const data = await res.json()
              if (!Array.isArray(data) || !data.length) continue
              // 1m format: [{ time_tag, kp, ...}] or planetary objects with Kp
              for (let i = data.length - 1; i >= 0; i--) {
                const row = data[i]
                if (!row) continue
                if (typeof row === 'object' && !Array.isArray(row)) {
                  const v = parseFloat(String(row.kp ?? row.Kp ?? row.estimated_kp))
                  if (Number.isFinite(v)) {
                    kp = v
                    at = String(row.time_tag || row.time || '')
                    source = u.includes('1m') ? 'NOAA SWPC 1-min' : 'NOAA SWPC'
                    break
                  }
                } else if (Array.isArray(row) && row.length > 1) {
                  // Skip header rows like ["time_tag","Kp",...]
                  const v = parseFloat(String(row[1]))
                  if (Number.isFinite(v)) {
                    kp = v
                    at = String(row[0] || '')
                    break
                  }
                }
              }
              if (Number.isFinite(kp)) break
            } catch {
              /* try next URL */
            }
          }
          if (!Number.isFinite(kp)) return err('Kp parse failed', 502)
          const label =
            kp >= 7
              ? 'Strong storm (G3+)'
              : kp >= 5
                ? 'G1+ storm — aurora possible mid-latitudes'
                : kp >= 4
                  ? 'Active — aurora chance higher latitudes'
                  : kp >= 3
                    ? 'Unsettled'
                    : 'Quiet'
          return json({
            kp,
            label,
            auroraLikely: kp >= 4,
            source,
            at,
          })
        } catch (e) {
          return err(e?.message || 'Kp fetch failed', 502)
        }
      }

      // ── Stargaze: rough ISS visible passes (circular-orbit approx from TLE) ──
      if (path === '/api/sky/iss' && method === 'GET') {
        const lat = parseFloat(url.searchParams.get('lat') || '')
        const lon = parseFloat(url.searchParams.get('lon') || '')
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          return err('lat/lon required', 400)
        }
        try {
          const passes = await computeIssPasses(lat, lon)
          return json({
            passes,
            note: 'Approx ISS passes (elev ≥ 20°). Confirm with NASA Spot the Station.',
          })
        } catch (e) {
          return err(e?.message || 'ISS pass calc failed', 502)
        }
      }

      // Coarse client error pings (no stacks / coords) — ops signal only
      if (path === '/api/metrics/error' && method === 'POST') {
        const limited = rateLimitAuth(request, 'err-metrics', 30, 60 * 1000)
        if (limited) return limited
        const body = await request.json().catch(() => ({}))
        const msg = String(body?.msg || 'error').slice(0, 160)
        const ctx = String(body?.ctx || '').slice(0, 64)
        const pathBucket = sanitizeMetricPath(body?.path || '/other')
        console.warn('[client-error]', pathBucket, ctx, msg)
        // Best-effort counter in D1 if table exists
        try {
          const day = new Date().toISOString().slice(0, 10)
          await env.DB.prepare(
            `INSERT INTO page_metrics (day, path, hits) VALUES (?, ?, 1)
             ON CONFLICT(day, path) DO UPDATE SET hits = hits + 1`,
          )
            .bind(day, `err:${pathBucket}`)
            .run()
        } catch {
          /* table may be missing in older envs */
        }
        return json({ ok: true })
      }

      // ── Privacy-light page metrics (aggregate path counts only) ──
      if (path === '/api/metrics/page' && method === 'POST') {
        const limited = rateLimitAuth(request, 'metrics', 60, 60 * 1000)
        if (limited) return limited
        const body = await request.json().catch(() => ({}))
        const raw = String(body?.path || '/')
        const pathBucket = sanitizeMetricPath(raw)
        const day = new Date().toISOString().slice(0, 10)
        try {
          await env.DB.prepare(
            `INSERT INTO page_metrics (day, path, hits) VALUES (?, ?, 1)
             ON CONFLICT(day, path) DO UPDATE SET hits = hits + 1`,
          )
            .bind(day, pathBucket)
            .run()
        } catch (e) {
          // Table may not exist yet — soft-fail so clients never break
          console.warn('metrics insert failed', e?.message || e)
        }
        return new Response(null, { status: 204, headers: { ...CORS_HEADERS } })
      }

      if (path === '/api/metrics/summary' && method === 'GET') {
        // Optional: protect with CRON_SECRET so public can't scrape
        const secret = request.headers.get('x-cron-secret') || url.searchParams.get('secret')
        if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
          return err('Unauthorized', 401)
        }
        const days = Math.min(30, Math.max(1, Number(url.searchParams.get('days')) || 7))
        const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
        try {
          const rows = await env.DB.prepare(
            `SELECT day, path, hits FROM page_metrics WHERE day >= ? ORDER BY day DESC, hits DESC`,
          )
            .bind(since)
            .all()
          return json({ days, rows: rows.results || [] })
        } catch (e) {
          return err('Metrics unavailable — run migrations', 503)
        }
      }

      // ── Active hurricanes / tropical cyclones + forecast tracks (NHC) ──
      if (path === '/api/tropical' && method === 'GET') {
        try {
          const data = await getTropicalGlobeData()
          return json(data, 200, {
            'Cache-Control': 'public, max-age=300',
            'Access-Control-Allow-Origin': '*',
          })
        } catch (e) {
          console.error('tropical', e)
          return err('Could not load tropical cyclone data', 502)
        }
      }

      // ── Free official weather videos (NWS / NOAA YouTube RSS) ──
      if (path === '/api/weather-videos' && method === 'GET') {
        try {
          const data = await getWeatherVideos()
          return json(data, 200, {
            'Cache-Control': 'public, max-age=600',
            'Access-Control-Allow-Origin': '*',
          })
        } catch (e) {
          console.error('weather-videos', e)
          return err('Could not load weather videos', 502)
        }
      }

      // ── Web Push public key ──
      if (path === '/api/push/vapid-public-key' && method === 'GET') {
        const vapid = getVapidConfig(env)
        if (!vapid) return err('Push not configured on server', 503)
        return json({ publicKey: vapid.publicKey })
      }

      // ── Web Push subscribe ──
      if (path === '/api/push/subscribe' && method === 'POST') {
        const auth = await requireUser(request, env)
        if (auth.error) return auth.error
        const body = await request.json().catch(() => ({}))
        const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : ''
        const p256dh = typeof body?.keys?.p256dh === 'string' ? body.keys.p256dh : ''
        const authKey = typeof body?.keys?.auth === 'string' ? body.keys.auth : ''
        if (!endpoint.startsWith('https://') || !p256dh || !authKey) {
          return err('Invalid push subscription')
        }
        const id = crypto.randomUUID()
        const createdAt = new Date().toISOString()
        const ua =
          typeof body?.userAgent === 'string'
            ? body.userAgent.slice(0, 200)
            : request.headers.get('user-agent')?.slice(0, 200) || null

        // Upsert by endpoint
        await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
          .bind(endpoint)
          .run()
        await env.DB.prepare(
          `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(id, auth.user.id, endpoint, p256dh, authKey, ua, createdAt)
          .run()

        // Ensure notify flag on for this user
        const data = parseUserData(auth.user.data)
        if (!data.notifyAlerts) {
          data.notifyAlerts = true
          await env.DB.prepare('UPDATE users SET data = ? WHERE id = ?')
            .bind(JSON.stringify(data), auth.user.id)
            .run()
        }

        return json({ ok: true, id }, 201)
      }

      // ── Web Push unsubscribe ──
      if (path === '/api/push/unsubscribe' && method === 'POST') {
        const auth = await requireUser(request, env)
        if (auth.error) return auth.error
        const body = await request.json().catch(() => ({}))
        if (typeof body?.endpoint === 'string' && body.endpoint) {
          await env.DB.prepare(
            'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
          )
            .bind(auth.user.id, body.endpoint)
            .run()
        } else {
          await env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id = ?')
            .bind(auth.user.id)
            .run()
        }
        return json({ ok: true })
      }

      // ── Native device token (iOS/Android — for future APNs/FCM send) ──
      if (path === '/api/push/device' && method === 'POST') {
        const auth = await requireUser(request, env)
        if (auth.error) return auth.error
        const body = await request.json().catch(() => ({}))
        const token = typeof body?.token === 'string' ? body.token.trim() : ''
        const platform = body?.platform === 'android' ? 'android' : 'ios'
        if (!token || token.length < 8) return err('Invalid device token')
        const id = crypto.randomUUID()
        const createdAt = new Date().toISOString()
        await env.DB.prepare('DELETE FROM device_tokens WHERE token = ?').bind(token).run()
        await env.DB.prepare(
          `INSERT INTO device_tokens (id, user_id, token, platform, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
          .bind(id, auth.user.id, token, platform, createdAt)
          .run()
        // Match web subscribe: enable notifyAlerts so cron includes this user
        const data = parseUserData(auth.user.data)
        if (!data.notifyAlerts) {
          data.notifyAlerts = true
          await env.DB.prepare('UPDATE users SET data = ? WHERE id = ?')
            .bind(JSON.stringify(data), auth.user.id)
            .run()
        }
        return json({ ok: true, id }, 201)
      }

      // ── Manual cron trigger (requires CRON_SECRET header in production) ──
      if (path === '/api/push/run-check' && method === 'POST') {
        const provided = request.headers.get('x-cron-secret') || ''
        if (env.CRON_SECRET) {
          if (provided !== env.CRON_SECRET) return err('Unauthorized', 401)
        } else {
          // No CRON_SECRET configured — require signed-in admin user only
          const auth = await requireUser(request, env)
          if (auth.error) return err('Set CRON_SECRET or sign in', 401)
        }
        const result = await runAlertPushCron(env)
        return json(result)
      }

      // ── fires ──
      if (path === '/api/fires' && method === 'GET') {
        const lat = parseFloat(url.searchParams.get('lat') ?? '')
        const lon = parseFloat(url.searchParams.get('lon') ?? '')
        if (Number.isNaN(lat) || Number.isNaN(lon)) {
          return err('lat and lon required')
        }
        const radius = parseFloat(url.searchParams.get('radius') ?? '2.5') || 2.5
        const limit = Math.min(200, Math.max(10, Number(url.searchParams.get('limit')) || 100))
        const fires = await firesNear(lat, lon, radius, limit)
        return json({
          source: 'NASA FIRMS (MODIS/VIIRS 24h)',
          count: fires.length,
          fires,
        })
      }

      // ── chat room meta ──
      if (path === '/api/chat/room' && method === 'GET') {
        const lat = parseFloat(url.searchParams.get('lat') ?? '')
        const lon = parseFloat(url.searchParams.get('lon') ?? '')
        if (Number.isNaN(lat) || Number.isNaN(lon)) return err('lat and lon required')
        const name = url.searchParams.get('name') || ''
        const meta = getRoomMeta(lat, lon, name)
        const data = await listMessages(env.DB, meta.id, { limit: 1 })
        return json({
          ...meta,
          label: data.label && data.label !== 'Area chat' ? data.label : meta.label,
          messageCount: data.total ?? 0,
          activeNearby: data.onlineHint,
        })
      }

      // ── chat messages ──
      const chatMsgMatch = path.match(/^\/api\/chat\/([^/]+)\/messages$/)
      if (chatMsgMatch) {
        const roomId = decodeURIComponent(chatMsgMatch[1])
        if (!/^g_-?\d+(\.\d+)?_-?\d+(\.\d+)?$/.test(roomId)) {
          return err('Invalid room')
        }

        if (method === 'GET') {
          const after = url.searchParams.get('after') || undefined
          const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 80))
          const data = await listMessages(env.DB, roomId, { after, limit })
          return json(data)
        }

        if (method === 'POST') {
          const chatLimited = rateLimitAuth(request, 'chat-post', 30, 60 * 1000)
          if (chatLimited) return chatLimited
          const auth = await requireUser(request, env)
          if (auth.error) return auth.error
          const body = await request.json().catch(() => ({}))
          const lat = parseFloat(String(body?.lat ?? ''))
          const lon = parseFloat(String(body?.lon ?? ''))
          if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
            if (roomIdFromCoords(lat, lon) !== roomId) {
              return err('Location does not match this chat area')
            }
          }
          try {
            const msg = await postMessage(env.DB, {
              roomId,
              userId: auth.user.id,
              userName: auth.user.name || auth.user.email?.split('@')[0] || 'User',
              text: body?.text,
              placeLabel:
                typeof body?.placeLabel === 'string' ? `Near ${body.placeLabel}` : undefined,
              lat: Number.isNaN(lat) ? undefined : lat,
              lon: Number.isNaN(lon) ? undefined : lon,
            })
            return json({ message: msg }, 201)
          } catch (e) {
            if (e.code === 'EMPTY') return err(e.message)
            if (e.code === 'RATE') return err(e.message, 429)
            if (e.code === 'MOD') return err(e.message, 400)
            console.error(e)
            return err('Could not send message', 500)
          }
        }
      }

      // ── auth register ──
      if (path === '/api/auth/register' && method === 'POST') {
        const limited = rateLimitAuth(request, 'register', 8, 60 * 60 * 1000)
        if (limited) return limited
        const jwtSecret = getJwtSecret(env)
        if (!jwtSecret) return err('Server misconfigured (JWT_SECRET)', 503)

        const body = await request.json().catch(() => ({}))
        const { email, password, name } = body ?? {}
        if (!validateEmail(email)) return err('Enter a valid email address')
        if (!validatePassword(password)) return err('Password must be at least 8 characters')

        const normalized = email.trim().toLowerCase()
        const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
          .bind(normalized)
          .first()
        if (existing) return err('An account with that email already exists', 409)

        const id = crypto.randomUUID()
        const passwordHash = await hashPassword(password)
        const createdAt = new Date().toISOString()
        const displayName =
          (typeof name === 'string' && name.trim()) || normalized.split('@')[0]
        const data = defaultUserData()

        await env.DB.prepare(
          `INSERT INTO users (id, email, name, password_hash, created_at, data)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
          .bind(id, normalized, displayName, passwordHash, createdAt, JSON.stringify(data))
          .run()

        const user = { id, email: normalized, name: displayName, created_at: createdAt }
        const token = await signToken(user, jwtSecret)
        return json({ token, user: publicUser(user), data }, 201)
      }

      // ── auth login ──
      if (path === '/api/auth/login' && method === 'POST') {
        const limited = rateLimitAuth(request, 'login', 20, 15 * 60 * 1000)
        if (limited) return limited
        const jwtSecret = getJwtSecret(env)
        if (!jwtSecret) return err('Server misconfigured (JWT_SECRET)', 503)

        const body = await request.json().catch(() => ({}))
        const { email, password } = body ?? {}
        if (!validateEmail(email) || typeof password !== 'string') {
          return err('Email and password required')
        }
        const normalized = email.trim().toLowerCase()
        const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?')
          .bind(normalized)
          .first()
        if (!row) return err('Invalid email or password', 401)
        const ok = await verifyPassword(password, row.password_hash)
        if (!ok) return err('Invalid email or password', 401)

        const token = await signToken(row, jwtSecret)
        return json({
          token,
          user: publicUser(row),
          data: parseUserData(row.data),
        })
      }

      // ── auth me ──
      if (path === '/api/auth/me' && method === 'GET') {
        const auth = await requireUser(request, env)
        if (auth.error) return auth.error
        return json({
          user: publicUser(auth.user),
          data: parseUserData(auth.user.data),
        })
      }

      // ── user data ──
      if (path === '/api/user/data' && method === 'GET') {
        const auth = await requireUser(request, env)
        if (auth.error) return auth.error
        return json({ data: parseUserData(auth.user.data) })
      }

      if (path === '/api/user/data' && method === 'PUT') {
        const auth = await requireUser(request, env)
        if (auth.error) return auth.error
        const body = await request.json().catch(() => ({}))
        const incoming = body?.data ?? body ?? {}
        // Persist full prefs including home pin (desktop ↔ phone when signed in)
        const cleaned = cleanUserData(incoming)
        await env.DB.prepare('UPDATE users SET data = ? WHERE id = ?')
          .bind(JSON.stringify(cleaned), auth.user.id)
          .run()
        return json({ data: cleaned })
      }

      return err('Not found', 404)
    } catch (e) {
      console.error(e)
      return err('Internal server error', 500)
    }
  },

  /** Every 10 minutes: severe alerts → Web Push for notify-enabled users */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runAlertPushCron(env)
        .then((r) => console.log('alert-push-cron', JSON.stringify(r)))
        .catch((e) => console.error('alert-push-cron failed', e)),
    )
  },
}
