import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const CHAT_PATH = path.join(DATA_DIR, 'chat.json')

/** ~22 km cells so nearby cities share a room */
const CELL = 0.2
const MAX_PER_ROOM = 200
const MAX_ROOMS = 500
const MAX_TEXT = 280

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(CHAT_PATH)) {
    fs.writeFileSync(CHAT_PATH, JSON.stringify({ rooms: {} }, null, 2), 'utf8')
  }
}

function read() {
  ensure()
  try {
    return JSON.parse(fs.readFileSync(CHAT_PATH, 'utf8'))
  } catch {
    return { rooms: {} }
  }
}

function write(db) {
  ensure()
  fs.writeFileSync(CHAT_PATH, JSON.stringify(db, null, 2), 'utf8')
}

export function roomIdFromCoords(lat, lon) {
  const la = Math.round(Number(lat) / CELL) * CELL
  const lo = Math.round(Number(lon) / CELL) * CELL
  return `g_${la.toFixed(1)}_${lo.toFixed(1)}`
}

export function getRoomMeta(lat, lon, placeName) {
  const id = roomIdFromCoords(lat, lon)
  return {
    id,
    label: placeName ? `Near ${placeName}` : `Area chat`,
    lat: Number(lat),
    lon: Number(lon),
  }
}

function trimRooms(db) {
  const keys = Object.keys(db.rooms)
  if (keys.length <= MAX_ROOMS) return
  // Drop oldest-updated rooms
  const sorted = keys
    .map((k) => ({ k, t: db.rooms[k].updatedAt || '' }))
    .sort((a, b) => a.t.localeCompare(b.t))
  const drop = sorted.slice(0, keys.length - MAX_ROOMS)
  for (const { k } of drop) delete db.rooms[k]
}

export function listMessages(roomId, { after, limit = 80 } = {}) {
  const db = read()
  const room = db.rooms[roomId]
  if (!room) {
    return { messages: [], onlineHint: 0, label: 'Area chat', total: 0 }
  }
  let msgs = room.messages || []
  const total = msgs.length
  if (after) {
    msgs = msgs.filter((m) => m.createdAt > after)
  }
  if (msgs.length > limit) msgs = msgs.slice(-limit)
  return {
    messages: msgs,
    onlineHint: room.recentUsers?.length ?? 0,
    label: room.label || 'Area chat',
    total,
  }
}

export function postMessage({
  roomId,
  userId,
  userName,
  text,
  placeLabel,
  lat,
  lon,
}) {
  const cleaned = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT)
  if (cleaned.length < 1) {
    const err = new Error('Message cannot be empty')
    err.code = 'EMPTY'
    throw err
  }

  const db = read()
  if (!db.rooms[roomId]) {
    db.rooms[roomId] = {
      id: roomId,
      label: placeLabel || 'Area chat',
      lat: lat ?? null,
      lon: lon ?? null,
      messages: [],
      recentUsers: [],
      updatedAt: new Date().toISOString(),
      lastByUser: {},
    }
  }

  const room = db.rooms[roomId]
  const now = Date.now()
  const last = room.lastByUser?.[userId]
  if (last && now - last < 2000) {
    const err = new Error('Slow down — wait a moment between messages')
    err.code = 'RATE'
    throw err
  }

  // Update place label if a nicer one arrives
  if (placeLabel && (!room.label || room.label === 'Area chat')) {
    room.label = placeLabel
  }

  const msg = {
    id: crypto.randomUUID(),
    userId,
    userName: String(userName || 'User').slice(0, 40),
    text: cleaned,
    createdAt: new Date().toISOString(),
  }

  room.messages.push(msg)
  if (room.messages.length > MAX_PER_ROOM) {
    room.messages = room.messages.slice(-MAX_PER_ROOM)
  }
  room.updatedAt = msg.createdAt
  room.lastByUser = room.lastByUser || {}
  room.lastByUser[userId] = now

  // Recent posters for “active nearby” hint (last hour)
  const hourAgo = new Date(now - 3600_000).toISOString()
  const active = new Set(
    room.messages.filter((m) => m.createdAt >= hourAgo).map((m) => m.userId),
  )
  room.recentUsers = [...active].slice(0, 50)

  trimRooms(db)
  write(db)
  return msg
}
