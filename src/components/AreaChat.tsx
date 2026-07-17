import { useCallback, useEffect, useRef, useState } from 'react'
import type { LocationResult } from '../api/types'
import {
  fetchChatMessages,
  fetchChatRoom,
  sendChatMessage,
  type ChatMessage,
  type ChatRoom,
} from '../api/chat'
import { useAuth } from '../hooks/useAuth'

interface Props {
  location: LocationResult | null
}

export function AreaChat({ location }: Props) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [room, setRoom] = useState<ChatRoom | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeNearby, setActiveNearby] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const stickBottom = useRef(true)
  const lastTsRef = useRef<string | undefined>(undefined)

  const scrollToBottom = useCallback(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [])

  const locLat = location?.latitude
  const locLon = location?.longitude
  const locName = location?.name
  const roomId = room?.id

  // Resolve room when location or panel opens
  useEffect(() => {
    if (locLat == null || locLon == null || !open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setMessages([])
    lastTsRef.current = undefined
    void fetchChatRoom(locLat, locLon, locName)
      .then((r) => {
        if (cancelled) return
        setRoom(r)
        setActiveNearby(r.activeNearby ?? 0)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [locLat, locLon, locName, open])

  // Load + poll messages
  useEffect(() => {
    if (!open || !roomId) return
    let cancelled = false

    const load = async (incremental: boolean) => {
      try {
        const after = incremental ? lastTsRef.current : undefined
        const data = await fetchChatMessages(roomId, {
          after,
          limit: incremental ? 40 : 80,
        })
        if (cancelled) return
        setActiveNearby(data.onlineHint)
        if (data.label) {
          setRoom((r) => (r ? { ...r, label: data.label } : r))
        }
        if (data.messages.length) {
          lastTsRef.current = data.messages[data.messages.length - 1].createdAt
        }
        if (incremental && after) {
          if (data.messages.length) {
            setMessages((prev) => {
              const ids = new Set(prev.map((m) => m.id))
              const next = [...prev]
              for (const m of data.messages) {
                if (!ids.has(m.id)) next.push(m)
              }
              return next.slice(-200)
            })
          }
        } else {
          setMessages(data.messages)
          if (data.messages.length) {
            lastTsRef.current = data.messages[data.messages.length - 1].createdAt
          }
        }
        setError(null)
      } catch (e) {
        if (!cancelled && !incremental) setError((e as Error).message)
      }
    }

    void load(false)
    // 12s poll (was 4s) — still feels live, far less battery/API load
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      void load(true)
    }, 12_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [open, roomId])

  useEffect(() => {
    if (stickBottom.current) scrollToBottom()
  }, [messages, scrollToBottom, open])

  const onScroll = () => {
    const el = listRef.current
    if (!el) return
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  const send = async () => {
    if (!location || !room || !text.trim() || sending) return
    if (!user) {
      setError('Sign in to chat with people nearby')
      return
    }
    setSending(true)
    setError(null)
    try {
      const msg = await sendChatMessage(room.id, {
        text: text.trim(),
        lat: location.latitude,
        lon: location.longitude,
        placeLabel: location.name,
      })
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
        return [...prev, msg]
      })
      lastTsRef.current = msg.createdAt
      setText('')
      stickBottom.current = true
      scrollToBottom()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  if (!location) return null

  return (
    <>
      <button
        type="button"
        className={`area-chat-fab ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title="Area chat"
        aria-expanded={open}
        aria-label={open ? 'Close area chat' : 'Open area chat'}
      >
        <span aria-hidden>{open ? '✕' : '💬'}</span>
        {!open && activeNearby > 0 && (
          <em className="area-chat-fab-dot" title="Active nearby">
            {activeNearby > 9 ? '9+' : activeNearby}
          </em>
        )}
      </button>

      {open && (
        <section className="area-chat-panel" aria-label="Area weather chat">
          <header className="area-chat-head">
            <div>
              <strong>{room?.label || `Near ${location.name}`}</strong>
              <span>
                People viewing weather here can chat
                {activeNearby > 0 ? ` · ${activeNearby} active recently` : ''}
              </span>
            </div>
            <button
              type="button"
              className="chip-btn icon-chip"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
            >
              ✕
            </button>
          </header>

          <div className="area-chat-list" ref={listRef} onScroll={onScroll}>
            {loading && !messages.length && (
              <p className="area-chat-empty">Loading chat…</p>
            )}
            {!loading && !messages.length && !error && (
              <p className="area-chat-empty">
                No messages yet. Say hi — what&apos;s the weather like where you are?
              </p>
            )}
            {messages.map((m) => {
              const mine = user && m.userId === user.id
              return (
                <div
                  key={m.id}
                  className={`area-chat-msg ${mine ? 'mine' : ''}`}
                >
                  <div className="area-chat-meta">
                    <strong>{mine ? 'You' : m.userName}</strong>
                    <time dateTime={m.createdAt}>
                      {new Date(m.createdAt).toLocaleTimeString(undefined, {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                  <p>{m.text}</p>
                </div>
              )
            })}
          </div>

          {error && (
            <div className="area-chat-error" role="alert">
              {error}
            </div>
          )}

          {!user ? (
            <div className="area-chat-signin">
              <p>Sign in (Account) to post. You can still read messages.</p>
            </div>
          ) : (
            <form
              className="area-chat-compose"
              onSubmit={(e) => {
                e.preventDefault()
                void send()
              }}
            >
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={280}
                placeholder="Message people nearby…"
                aria-label="Chat message"
                disabled={sending}
              />
              <button
                type="submit"
                className="primary-btn"
                disabled={sending || !text.trim()}
              >
                Send
              </button>
            </form>
          )}
        </section>
      )}
    </>
  )
}
