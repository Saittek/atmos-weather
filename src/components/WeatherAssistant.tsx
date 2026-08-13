/**
 * Solara AI weather assistant — grounded Q&A from live forecast context.
 * Uses SpaceXAI (xAI) via Worker /api/ai/weather. Key never ships to the browser.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AirQualityData, LocationResult, WeatherAlert, WeatherData } from '../api/types'
import type { Units } from '../utils/format'
import { buildAiWeatherContext } from '../utils/aiWeatherContext'
import { askWeatherAi, type AiChatTurn } from '../api/aiWeather'
import { getApiBase } from '../lib/native'

interface Props {
  location: LocationResult
  weather: WeatherData
  units: Units
  air?: AirQualityData | null
  alerts?: WeatherAlert[]
}

const SUGGESTIONS = [
  'Will I need an umbrella today?',
  'What should I wear outside?',
  'When is the best time for a walk?',
  'Any severe weather I should know about?',
  'How windy will it get this evening?',
]

export function WeatherAssistant({ location, weather, units, air, alerts = [] }: Props) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [turns, setTurns] = useState<AiChatTurn[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const context = useMemo(
    () => buildAiWeatherContext({ location, weather, units, air, alerts }),
    [location, weather, units, air, alerts],
  )

  // Probe health once when opened
  useEffect(() => {
    if (!open || configured != null) return
    let cancelled = false
    void fetch(`${getApiBase()}/api/health`)
      .then((r) => r.json())
      .then((h) => {
        if (cancelled) return
        setConfigured(Boolean(h?.secrets?.xai) || (h?.features || []).includes('ai-weather'))
        // features always includes ai-weather route; secrets.xai is real gate
        if (h?.secrets && typeof h.secrets.xai === 'boolean') {
          setConfigured(h.secrets.xai)
        }
      })
      .catch(() => {
        if (!cancelled) setConfigured(null)
      })
    return () => {
      cancelled = true
    }
  }, [open, configured])

  useEffect(() => {
    if (!open) return
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns, open, busy])

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [open])

  const send = useCallback(
    async (text: string) => {
      const message = text.trim()
      if (!message || busy) return
      setError(null)
      setInput('')
      const nextTurns: AiChatTurn[] = [...turns, { role: 'user', content: message }]
      setTurns(nextTurns)
      setBusy(true)
      try {
        const history = nextTurns.slice(0, -1)
        const { reply } = await askWeatherAi({
          message,
          context,
          history,
        })
        setTurns((t) => [...t, { role: 'assistant', content: reply }])
        setConfigured(true)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'AI request failed'
        setError(msg)
        if (/not configured|XAI_API_KEY/i.test(msg)) setConfigured(false)
      } finally {
        setBusy(false)
      }
    },
    [busy, turns, context],
  )

  return (
    <section className="panel weather-ai-panel" aria-label="Solara AI weather assistant">
      <div className="panel-header weather-ai-head">
        <h2>
          <span aria-hidden>✦</span> Solara AI
        </h2>
        <span className="panel-hint">Ask about this forecast</span>
        <button
          type="button"
          className="chip-btn weather-ai-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Hide' : 'Open'}
        </button>
      </div>

      {!open && (
        <p className="weather-ai-teaser muted-center">
          Grounded answers from your live Solara data — rain timing, dress, wind, alerts.
        </p>
      )}

      {open && (
        <div className="weather-ai-body">
          {configured === false && (
            <div className="banner weather-ai-setup" role="status">
              <strong>AI needs a key.</strong> On Cloudflare, run{' '}
              <code>npx wrangler secret put XAI_API_KEY</code> with a key from{' '}
              <a href="https://console.x.ai" target="_blank" rel="noreferrer">
                console.x.ai
              </a>
              . Optional: <code>XAI_MODEL</code> (default grok-4.5).
            </div>
          )}

          <div className="weather-ai-chips" aria-label="Suggestions">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className="chip-btn"
                disabled={busy}
                onClick={() => void send(s)}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="weather-ai-thread" ref={listRef} role="log" aria-live="polite">
            {turns.length === 0 && (
              <p className="weather-ai-empty">
                Try “Will it rain before dinner?” or “Is air quality OK for a run?”
              </p>
            )}
            {turns.map((t, i) => (
              <div
                key={`${t.role}-${i}`}
                className={`weather-ai-msg weather-ai-msg-${t.role}`}
              >
                <span className="weather-ai-role">
                  {t.role === 'user' ? 'You' : 'Solara'}
                </span>
                <div className="weather-ai-bubble">{t.content}</div>
              </div>
            ))}
            {busy && (
              <div className="weather-ai-msg weather-ai-msg-assistant">
                <span className="weather-ai-role">Solara</span>
                <div className="weather-ai-bubble weather-ai-thinking">
                  <span className="spinner" /> Thinking…
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="weather-ai-error" role="alert">
              {error}
            </p>
          )}

          <form
            className="weather-ai-compose"
            onSubmit={(e) => {
              e.preventDefault()
              void send(input)
            }}
          >
            <textarea
              ref={inputRef}
              className="weather-ai-input"
              rows={2}
              maxLength={800}
              placeholder="Ask about weather here…"
              value={input}
              disabled={busy}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send(input)
                }
              }}
            />
            <button type="submit" className="primary-btn" disabled={busy || !input.trim()}>
              Ask
            </button>
          </form>
          <p className="weather-ai-foot">
            Answers use your current Solara forecast for {location.name}. Not official advice.
          </p>
        </div>
      )}
    </section>
  )
}
