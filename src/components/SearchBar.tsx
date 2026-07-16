import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { formatLocationLabel, searchLocations } from '../api/weather'
import type { LocationResult } from '../api/types'

interface Props {
  onSelect: (loc: LocationResult) => void
  onUseLocation: () => void
  geoLoading: boolean
}

export function SearchBar({ onSelect, onUseLocation, geoLoading }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LocationResult[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [failed, setFailed] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const timer = useRef<number | null>(null)
  const reqId = useRef(0)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current)
    if (query.trim().length < 2) {
      setResults([])
      setSearching(false)
      setFailed(false)
      setActiveIdx(-1)
      return
    }
    setSearching(true)
    setFailed(false)
    const id = ++reqId.current
    timer.current = window.setTimeout(async () => {
      try {
        const r = await searchLocations(query)
        if (id !== reqId.current) return
        setResults(r)
        setOpen(true)
        setActiveIdx(r.length ? 0 : -1)
        setFailed(false)
      } catch {
        if (id !== reqId.current) return
        setResults([])
        setFailed(true)
        setOpen(true)
      } finally {
        if (id === reqId.current) setSearching(false)
      }
    }, 280)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [query])

  const pick = (r: LocationResult) => {
    onSelect(r)
    setQuery('')
    setOpen(false)
    setResults([])
    setActiveIdx(-1)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeIdx >= 0 && results[activeIdx]) {
      e.preventDefault()
      pick(results[activeIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="search-bar" ref={wrapRef}>
      <div className="search-input-wrap">
        <span className="search-icon" aria-hidden>
          ⌕
        </span>
        <input
          type="search"
          className="search-input"
          placeholder="Search city or place…"
          data-placeholder-long="Search city, region, or place…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => (results.length || failed) && setOpen(true)}
          onKeyDown={onKeyDown}
          aria-label="Search location"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="search-results-list"
          autoComplete="off"
        />
        {searching && <span className="search-spinner" aria-hidden />}
        <button
          type="button"
          className="geo-btn"
          onClick={onUseLocation}
          disabled={geoLoading}
          title="Use my location"
          aria-label="Use my location"
        >
          {geoLoading ? '…' : '◎'}
        </button>
      </div>
      {open && (results.length > 0 || failed || (!searching && query.trim().length >= 2)) && (
        <ul className="search-results" role="listbox" id="search-results-list">
          {results.map((r, i) => (
            <li key={`${r.id}-${r.latitude}-${r.longitude}`}>
              <button
                type="button"
                role="option"
                aria-selected={i === activeIdx}
                className={i === activeIdx ? 'active' : ''}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => pick(r)}
              >
                <span className="result-name">{r.name}</span>
                <span className="result-meta">
                  {formatLocationLabel(r).replace(`${r.name}, `, '')}
                </span>
              </button>
            </li>
          ))}
          {!searching && !results.length && (
            <li className="search-empty">
              {failed ? 'Search failed — try again' : 'No places found'}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
