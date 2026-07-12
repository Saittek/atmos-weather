import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import {
  createUser,
  findUserByEmail,
  findUserById,
  publicUser,
  updateUserData,
  defaultUserData,
} from './db.js'
import {
  getRoomMeta,
  listMessages,
  postMessage,
  roomIdFromCoords,
} from './chat.js'
import { firesNear } from './firms.js'

const app = express()
const PORT = Number(process.env.PORT) || 8787
const JWT_SECRET = process.env.JWT_SECRET || 'atmos-dev-secret-change-me'
const TOKEN_DAYS = 30

app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '1mb' }))

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: `${TOKEN_DAYS}d` },
  )
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'Sign in required' })
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    const user = findUserById(payload.sub)
    if (!user) return res.status(401).json({ error: 'Account not found' })
    req.user = user
    next()
  } catch {
    return res.status(401).json({ error: 'Session expired — please sign in again' })
  }
}

function validateEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 6
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'atmos-api',
    features: ['auth', 'chat', 'fires'],
  })
})

/** Active fire hotspots near a point (NASA FIRMS 24h) */
app.get('/api/fires', async (req, res) => {
  try {
    const lat = parseFloat(String(req.query.lat ?? ''))
    const lon = parseFloat(String(req.query.lon ?? ''))
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return res.status(400).json({ error: 'lat and lon required' })
    }
    const radius = parseFloat(String(req.query.radius ?? '2.5')) || 2.5
    const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 100))
    const fires = await firesNear(lat, lon, radius, limit)
    res.json({
      source: 'NASA FIRMS (MODIS/VIIRS 24h)',
      count: fires.length,
      fires,
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Could not load fire data' })
  }
})

/** Resolve area chat room from coordinates */
app.get('/api/chat/room', (req, res) => {
  const lat = parseFloat(String(req.query.lat ?? ''))
  const lon = parseFloat(String(req.query.lon ?? ''))
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return res.status(400).json({ error: 'lat and lon required' })
  }
  const name = typeof req.query.name === 'string' ? req.query.name : ''
  const meta = getRoomMeta(lat, lon, name)
  const data = listMessages(meta.id, { limit: 1 })
  res.json({
    ...meta,
    label: data.label && data.label !== 'Area chat' ? data.label : meta.label,
    messageCount: data.total ?? 0,
    activeNearby: data.onlineHint,
  })
})

/** List messages for a room (public read) */
app.get('/api/chat/:roomId/messages', (req, res) => {
  const roomId = String(req.params.roomId || '')
  if (!/^g_-?\d+(\.\d+)?_-?\d+(\.\d+)?$/.test(roomId)) {
    return res.status(400).json({ error: 'Invalid room' })
  }
  const after = typeof req.query.after === 'string' ? req.query.after : undefined
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 80))
  const data = listMessages(roomId, { after, limit })
  res.json(data)
})

/** Post a message (signed-in only) */
app.post('/api/chat/:roomId/messages', authMiddleware, (req, res) => {
  try {
    const roomId = String(req.params.roomId || '')
    if (!/^g_-?\d+(\.\d+)?_-?\d+(\.\d+)?$/.test(roomId)) {
      return res.status(400).json({ error: 'Invalid room' })
    }
    // Ensure room matches claimed coords if provided
    const lat = parseFloat(String(req.body?.lat ?? ''))
    const lon = parseFloat(String(req.body?.lon ?? ''))
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
      const expected = roomIdFromCoords(lat, lon)
      if (expected !== roomId) {
        return res.status(400).json({ error: 'Location does not match this chat area' })
      }
    }

    const msg = postMessage({
      roomId,
      userId: req.user.id,
      userName: req.user.name || req.user.email?.split('@')[0] || 'User',
      text: req.body?.text,
      placeLabel:
        typeof req.body?.placeLabel === 'string'
          ? `Near ${req.body.placeLabel}`
          : undefined,
      lat: Number.isNaN(lat) ? undefined : lat,
      lon: Number.isNaN(lon) ? undefined : lon,
    })
    res.status(201).json({ message: msg })
  } catch (e) {
    if (e.code === 'EMPTY') return res.status(400).json({ error: e.message })
    if (e.code === 'RATE') return res.status(429).json({ error: e.message })
    console.error(e)
    res.status(500).json({ error: 'Could not send message' })
  }
})

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body ?? {}
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Enter a valid email address' })
    }
    if (!validatePassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const user = createUser({
      email,
      name: typeof name === 'string' ? name : '',
      passwordHash,
    })

    const token = signToken(user)
    res.status(201).json({
      token,
      user: publicUser(user),
      data: user.data ?? defaultUserData(),
    })
  } catch (e) {
    if (e.code === 'EMAIL_TAKEN') {
      return res.status(409).json({ error: e.message })
    }
    console.error(e)
    res.status(500).json({ error: 'Could not create account' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {}
    if (!validateEmail(email) || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password required' })
    }

    const user = findUserByEmail(email)
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const token = signToken(user)
    res.json({
      token,
      user: publicUser(user),
      data: user.data ?? defaultUserData(),
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Login failed' })
  }
})

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({
    user: publicUser(req.user),
    data: req.user.data ?? defaultUserData(),
  })
})

app.get('/api/user/data', authMiddleware, (req, res) => {
  res.json({ data: req.user.data ?? defaultUserData() })
})

app.put('/api/user/data', authMiddleware, (req, res) => {
  try {
    const incoming = req.body?.data ?? req.body ?? {}
    const cleaned = {
      units: incoming.units === 'metric' ? 'metric' : 'imperial',
      theme: ['dark', 'light', 'auto'].includes(incoming.theme) ? incoming.theme : 'dark',
      density: incoming.density === 'compact' ? 'compact' : 'comfortable',
      lastLocation: incoming.lastLocation ?? null,
      favorites: Array.isArray(incoming.favorites) ? incoming.favorites.slice(0, 12) : [],
      severeMode: Boolean(incoming.severeMode),
      stormMode: Boolean(incoming.stormMode),
      notifyAlerts: Boolean(incoming.notifyAlerts),
    }

    const user = updateUserData(req.user.id, cleaned)
    if (!user) return res.status(404).json({ error: 'Account not found' })
    res.json({ data: user.data })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Could not save data' })
  }
})

app.listen(PORT, () => {
  console.log(`Atmos API (auth + area chat) → http://localhost:${PORT}`)
})
