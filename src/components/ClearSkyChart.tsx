/**
 * Clear-sky hourly chart — readable “traffic light” grid for stargazing.
 * Blue/green = good · gray = mediocre · white/cloudy = bad · yellow = daytime.
 */
import { useMemo, useRef, useState } from 'react'
import type { StargazeHour } from '../utils/stargaze'

interface Props {
  hours: StargazeHour[]
  centerNight?: boolean
}

type RowKey = 'score' | 'total' | 'low' | 'mid' | 'high' | 'trans' | 'seeing' | 'dark'
type Band = 'best' | 'good' | 'fair' | 'poor' | 'bad' | 'day'

const SIMPLE_ROWS: { key: RowKey; label: string; help: string }[] = [
  { key: 'score', label: 'Overall', help: 'Combined imaging score (higher = better)' },
  { key: 'total', label: 'Clouds', help: 'Total cloud cover — less is better' },
  { key: 'trans', label: 'Clear air', help: 'Transparency — haze/humidity (higher better)' },
  { key: 'seeing', label: 'Steady air', help: 'Seeing / twinkle (higher = sharper stars)' },
  { key: 'dark', label: 'Dark sky', help: 'Astronomical darkness for deep sky' },
]

const DETAIL_ROWS: { key: RowKey; label: string; help: string }[] = [
  { key: 'low', label: 'Low cloud', help: 'Low-level clouds' },
  { key: 'mid', label: 'Mid cloud', help: 'Mid-level clouds' },
  { key: 'high', label: 'High cloud', help: 'Cirrus / high cloud (can still spoil imaging)' },
]

function bandFor(key: RowKey, h: StargazeHour): Band {
  if (key === 'dark') {
    if (h.isDark) return 'best'
    if (h.isNight) return 'good'
    return 'day'
  }
  if (!h.isNight && key !== 'score') return 'day'

  if (key === 'score') {
    if (!h.isNight) return 'day'
    const s = h.score ?? 0
    if (s >= 75) return 'best'
    if (s >= 55) return 'good'
    if (s >= 40) return 'fair'
    if (s >= 25) return 'poor'
    return 'bad'
  }
  if (key === 'trans') {
    const t = h.transparency ?? 50
    if (t >= 75) return 'best'
    if (t >= 55) return 'good'
    if (t >= 35) return 'fair'
    return 'poor'
  }
  if (key === 'seeing') {
    const s = h.seeing ?? 50
    if (s >= 75) return 'best'
    if (s >= 55) return 'good'
    if (s >= 35) return 'fair'
    return 'poor'
  }
  const c =
    key === 'low'
      ? (h.cloudLow ?? h.cloud ?? 50)
      : key === 'mid'
        ? (h.cloudMid ?? h.cloud ?? 50)
        : key === 'high'
          ? (h.cloudHigh ?? h.cloud ?? 50)
          : (h.cloud ?? 50)
  if (c <= 15) return 'best'
  if (c <= 35) return 'good'
  if (c <= 55) return 'fair'
  if (c <= 75) return 'poor'
  return 'bad'
}

function bandWord(b: Band): string {
  switch (b) {
    case 'best':
      return 'Excellent'
    case 'good':
      return 'Good'
    case 'fair':
      return 'Fair'
    case 'poor':
      return 'Poor'
    case 'bad':
      return 'Bad'
    case 'day':
      return 'Daytime'
  }
}

function detailLines(h: StargazeHour): string[] {
  const lines: string[] = []
  if (!h.isNight) {
    lines.push('Sun is up — not a stargazing hour.')
    return lines
  }
  lines.push(`Overall score ${h.score}/100`)
  lines.push(`Clouds ${h.cloud}%${h.hasCloudLayers ? ` (L${h.cloudLow} · M${h.cloudMid} · H${h.cloudHigh})` : ''}`)
  lines.push(`Clear air ${h.transparency ?? '—'} · Steady air ${h.seeing ?? '—'}`)
  lines.push(
    h.isDark
      ? 'Astronomical dark — good for faint targets'
      : 'Twilight — brighter sky, better for planets/Moon',
  )
  return lines
}

function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dayLabel(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  } catch {
    return new Date(ms).toLocaleDateString()
  }
}

export function ClearSkyChart({ hours, centerNight = true }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showLayers, setShowLayers] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)

  const slice = useMemo(() => {
    let s = hours.filter((h) => h.ms < Date.now() + 96 * 3600_000 && h.ms > Date.now() - 2 * 3600_000)
    if (s.length < 8) s = hours.filter((h) => h.ms < Date.now() + 96 * 3600_000)
    if (centerNight && s.length > 40) {
      const mid = s.findIndex((h) => h.isNight && h.ms >= Date.now() - 30 * 60_000)
      if (mid > 4) {
        const start = Math.max(0, mid - 4)
        s = s.slice(start, start + 60)
      } else {
        s = s.slice(0, 60)
      }
    } else {
      s = s.slice(0, 60)
    }
    return s
  }, [hours, centerNight])

  const nowIdx = useMemo(() => {
    let best = 0
    let bestD = Infinity
    const now = Date.now()
    slice.forEach((h, i) => {
      const d = Math.abs(h.ms - now)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    return best
  }, [slice])

  const hasLayers = slice.some((h) => h.hasCloudLayers)
  const rows = showLayers && hasLayers ? [...SIMPLE_ROWS, ...DETAIL_ROWS] : SIMPLE_ROWS

  // Day boundary markers for header
  const dayMarks = useMemo(() => {
    const marks: { i: number; label: string }[] = []
    let prev = ''
    slice.forEach((h, i) => {
      const k = dayKey(h.ms)
      if (k !== prev) {
        marks.push({ i, label: dayLabel(h.ms) })
        prev = k
      }
    })
    return marks
  }, [slice])

  if (slice.length < 4) {
    return <p className="muted-center">Not enough hours for a clear-sky chart yet.</p>
  }

  const sel = selected != null ? slice[selected] : slice[nowIdx]

  const jumpNow = () => {
    setSelected(nowIdx)
    const el = scrollRef.current
    if (!el) return
    const col = el.querySelector(`[data-col="${nowIdx}"]`) as HTMLElement | null
    if (col) {
      const left = col.offsetLeft - el.clientWidth / 2 + col.offsetWidth / 2
      el.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
    }
  }

  return (
    <div className="csc-wrap" aria-label="Clear sky hourly chart">
      <div className="csc-toolbar">
        <p className="csc-howto">
          <strong>How to read:</strong> each column is one hour. <em>Blue = good for stars</em>, gray =
          so-so, light = cloudy/poor, yellow = daytime. Tap a column for details.
        </p>
        <div className="csc-toolbar-actions">
          <button type="button" className="chip-btn csc-now-btn" onClick={jumpNow}>
            Jump to now
          </button>
          {hasLayers && (
            <button
              type="button"
              className={`chip-btn${showLayers ? ' on' : ''}`}
              onClick={() => setShowLayers((v) => !v)}
            >
              {showLayers ? 'Hide cloud layers' : 'Show L/M/H clouds'}
            </button>
          )}
        </div>
      </div>

      <div className="csc-legend csc-legend-simple" aria-hidden>
        <span className="csc-swatch csc-best" /> Excellent
        <span className="csc-swatch csc-good" /> Good
        <span className="csc-swatch csc-fair" /> Fair
        <span className="csc-swatch csc-poor" /> Poor
        <span className="csc-swatch csc-bad" /> Socked in
        <span className="csc-swatch csc-day" /> Day
      </div>

      <div className="csc-scroll" ref={scrollRef}>
        {/* Day strip */}
        <div className="csc-daystrip" style={{ gridTemplateColumns: `7.5rem repeat(${slice.length}, minmax(1.35rem, 1fr))` }}>
          <div className="csc-daystrip-pad" />
          {slice.map((h, i) => {
            const mark = dayMarks.find((m) => m.i === i)
            return (
              <div key={h.time + 'd'} className="csc-daystrip-cell">
                {mark ? <span>{mark.label}</span> : null}
              </div>
            )
          })}
        </div>

        <div
          className="csc-grid"
          style={{ gridTemplateColumns: `7.5rem repeat(${slice.length}, minmax(1.35rem, 1fr))` }}
        >
          {/* Time header */}
          <div className="csc-corner sticky-label">Time</div>
          {slice.map((h, i) => (
            <button
              type="button"
              key={h.time + 't'}
              data-col={i}
              className={`csc-tick-btn${i === nowIdx ? ' is-now' : ''}${selected === i ? ' is-sel' : ''}${h.isNight ? ' is-night' : ' is-day'}`}
              onClick={() => setSelected(i)}
              title={h.label}
            >
              {i === nowIdx ? 'Now' : h.label.replace(/\s/g, '')}
            </button>
          ))}

          {rows.map((row) => (
            <div key={row.key} className="csc-row-contents" style={{ display: 'contents' }}>
              <div className="csc-row-label sticky-label" title={row.help}>
                <span className="csc-row-name">{row.label}</span>
                <span className="csc-row-help">{row.help}</span>
              </div>
              {slice.map((h, i) => {
                const b = bandFor(row.key, h)
                return (
                  <button
                    type="button"
                    key={h.time + row.key}
                    data-col={i}
                    className={`csc-cell csc-${b}${i === nowIdx ? ' is-now' : ''}${selected === i ? ' is-sel' : ''}`}
                    onClick={() => setSelected(i)}
                    aria-label={`${h.label} ${row.label}: ${bandWord(b)}`}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Detail card for selected / now hour */}
      {sel && (
        <div className="csc-detail" role="status">
          <div className="csc-detail-head">
            <strong>
              {selected === nowIdx || selected == null ? 'This hour' : sel.label}
              {sel.isNight ? '' : ' · daytime'}
            </strong>
            <span className={`csc-detail-pill csc-${bandFor('score', sel)}`}>
              {sel.isNight ? `${sel.score}/100 · ${bandWord(bandFor('score', sel))}` : 'Daytime'}
            </span>
          </div>
          <ul className="csc-detail-list">
            {detailLines(sel).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
