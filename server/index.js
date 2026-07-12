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
  res.json({ ok: true, service: 'atmos-auth' })
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
  console.log(`Atmos auth API → http://localhost:${PORT}`)
})
