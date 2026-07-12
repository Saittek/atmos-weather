import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const DB_PATH = path.join(DATA_DIR, 'users.json')

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: [] }, null, 2), 'utf8')
  }
}

function readDb() {
  ensureDb()
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))
  } catch {
    return { users: [] }
  }
}

function writeDb(db) {
  ensureDb()
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8')
}

export function defaultUserData() {
  return {
    units: 'imperial',
    theme: 'dark',
    density: 'comfortable',
    lastLocation: null,
    favorites: [],
    severeMode: true,
    stormMode: false,
    notifyAlerts: false,
  }
}

export function findUserByEmail(email) {
  const db = readDb()
  const normalized = email.trim().toLowerCase()
  return db.users.find((u) => u.email === normalized) ?? null
}

export function findUserById(id) {
  const db = readDb()
  return db.users.find((u) => u.id === id) ?? null
}

export function createUser({ email, name, passwordHash }) {
  const db = readDb()
  const normalized = email.trim().toLowerCase()
  if (db.users.some((u) => u.email === normalized)) {
    const err = new Error('An account with that email already exists')
    err.code = 'EMAIL_TAKEN'
    throw err
  }

  const user = {
    id: crypto.randomUUID(),
    email: normalized,
    name: name.trim() || normalized.split('@')[0],
    passwordHash,
    createdAt: new Date().toISOString(),
    data: defaultUserData(),
  }

  db.users.push(user)
  writeDb(db)
  return user
}

export function updateUserData(userId, data) {
  const db = readDb()
  const idx = db.users.findIndex((u) => u.id === userId)
  if (idx < 0) return null
  db.users[idx].data = {
    ...defaultUserData(),
    ...db.users[idx].data,
    ...data,
  }
  writeDb(db)
  return db.users[idx]
}

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  }
}
