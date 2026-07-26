/**
 * Exact home location — GPS, current place, or manual lat/lon (full precision).
 * On mobile: collapses to a compact bar after first set, or when minimized.
 */
import { useEffect, useRef, useState } from 'react'
import type { LocationResult } from '../api/types'
import { reverseGeocode } from '../api/weather'
import { getCurrentPosition } from '../lib/native'
import { isMobileViewport } from '../utils/device'

interface Props {
  home: LocationResult | null
  current: LocationResult | null
  geoLoading?: boolean
  onSetHome: (loc: LocationResult | null) => void
  onGoHome: () => void
  onUseGps?: () => void
  /** When true, home is pushed to the Solara account (desktop ↔ phone) */
  accountSynced?: boolean
  signedIn?: boolean
  /** Nested inside Saved places (no outer panel chrome) */
  embedded?: boolean
}

const COMPACT_KEY = 'solara-home-panel-compact'

function fmtCoord(n: number, digits = 5): string {
  return Number.isFinite(n) ? n.toFixed(digits) : ''
}

function loadCompactPref(): boolean {
  try {
    return localStorage.getItem(COMPACT_KEY) === '1'
  } catch {
    return false
  }
}

function saveCompactPref(v: boolean) {
  try {
    if (v) localStorage.setItem(COMPACT_KEY, '1')
    else localStorage.removeItem(COMPACT_KEY)
  } catch {
    /* ignore */
  }
}

export function HomeLocationPanel({
  home,
  current,
  geoLoading,
  onSetHome,
  onGoHome,
  accountSynced = false,
  signedIn = false,
  embedded = false,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(home?.name || 'Home')
  const [latStr, setLatStr] = useState(home ? fmtCoord(home.latitude, 6) : '')
  const [lonStr, setLonStr] = useState(home ? fmtCoord(home.longitude, 6) : '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  /** Mobile: small bar once home is set / user minimized */
  const [compact, setCompact] = useState(() => {
    if (typeof window === 'undefined') return false
    if (!isMobileViewport()) return false
    // Already have home + user minimized (or auto after first set)
    return loadCompactPref()
  })
  const hadHomeRef = useRef(Boolean(home))

  useEffect(() => {
    if (!editing && home) {
      setLabel(home.name || 'Home')
      setLatStr(fmtCoord(home.latitude, 6))
      setLonStr(fmtCoord(home.longitude, 6))
    }
  }, [home, editing])

  // After first-time home set on mobile → collapse automatically
  useEffect(() => {
    const had = hadHomeRef.current
    hadHomeRef.current = Boolean(home)
    if (!home) {
      // Cleared home — show full setup again next time
      return
    }
    if (had) return
    // Transition null → set
    if (isMobileViewport()) {
      setCompact(true)
      saveCompactPref(true)
      setEditing(false)
    }
  }, [home])

  const minimize = () => {
    setCompact(true)
    saveCompactPref(true)
    setEditing(false)
    setErr(null)
  }

  const expand = () => {
    setCompact(false)
    // Expanding does not clear the pref forever — re-minimize still works
    // Prefer keeping pref so next visit stays compact unless they clear home
  }

  const setHomeAndMaybeCompact = (loc: LocationResult | null) => {
    onSetHome(loc)
    if (loc && isMobileViewport()) {
      setCompact(true)
      saveCompactPref(true)
      setEditing(false)
    }
    if (!loc) {
      setCompact(false)
      saveCompactPref(false)
    }
  }

  const saveManual = async () => {
    setErr(null)
    const lat = parseFloat(latStr)
    const lon = parseFloat(lonStr)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setErr('Enter valid latitude and longitude')
      return
    }
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      setErr('Lat must be −90…90, lon −180…180')
      return
    }
    setBusy(true)
    try {
      let named = (label || 'Home').trim() || 'Home'
      let admin1: string | undefined
      let country: string | undefined
      try {
        const geo = await reverseGeocode(lat, lon)
        if (!label.trim() || label.trim() === 'Home') {
          named = geo.name || named
        }
        admin1 = geo.admin1
        country = geo.country
      } catch {
        /* keep manual label */
      }
      setHomeAndMaybeCompact({
        id: 1,
        name: named,
        latitude: lat,
        longitude: lon,
        admin1,
        country,
      })
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  const saveGps = async () => {
    setErr(null)
    setBusy(true)
    try {
      const pos = await getCurrentPosition()
      let name = (label || 'Home').trim() || 'Home'
      let admin1: string | undefined
      let country: string | undefined
      try {
        const geo = await reverseGeocode(pos.latitude, pos.longitude)
        name = geo.name ? `${geo.name} (Home)` : name
        admin1 = geo.admin1
        country = geo.country
      } catch {
        /* ignore */
      }
      setHomeAndMaybeCompact({
        id: 1,
        name,
        latitude: pos.latitude,
        longitude: pos.longitude,
        admin1,
        country,
      })
      setLatStr(fmtCoord(pos.latitude, 6))
      setLonStr(fmtCoord(pos.longitude, 6))
      setLabel(name)
      setEditing(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not get GPS')
    } finally {
      setBusy(false)
    }
  }

  const saveCurrent = () => {
    if (!current) {
      setErr('Open a place first, then set it as home')
      return
    }
    setErr(null)
    const name =
      (label.trim() && label.trim() !== 'Home'
        ? label.trim()
        : current.name?.includes('Home')
          ? current.name
          : `${current.name} (Home)`) || 'Home'
    setHomeAndMaybeCompact({
      ...current,
      id: current.id || 1,
      name,
      latitude: current.latitude,
      longitude: current.longitude,
    })
    setEditing(false)
  }

  const wrapClass = [
    embedded ? 'home-location-embedded' : 'panel home-location-panel',
    home && compact && !editing ? 'home-location-compact' : '',
  ]
    .filter(Boolean)
    .join(' ')

  // Compact strip (mobile, home already set)
  if (home && compact && !editing) {
    const body = (
      <div className="home-compact-row">
        <button type="button" className="home-compact-go" onClick={onGoHome} title="Go home">
          <span className="home-compact-emoji" aria-hidden>
            🏠
          </span>
          <span className="home-compact-text">
            <strong>{home.name || 'Home'}</strong>
            <span className="home-compact-coords">
              {fmtCoord(home.latitude, 4)}, {fmtCoord(home.longitude, 4)}
            </span>
          </span>
        </button>
        <button
          type="button"
          className="chip-btn home-compact-expand"
          onClick={expand}
          aria-label="Expand home settings"
          title="Expand"
        >
          ▾
        </button>
      </div>
    )
    return embedded ? (
      <div className={wrapClass} aria-label="Home">
        {body}
      </div>
    ) : (
      <section className={wrapClass} aria-label="Home">
        {body}
      </section>
    )
  }

  const Tag = embedded ? 'div' : 'section'

  return (
    <Tag className={wrapClass} aria-label={embedded ? 'Home pin' : undefined}>
      {!embedded ? (
        <div className="panel-header">
          <h2>🏠 Home</h2>
          <div className="home-header-actions">
            <span className="panel-hint">Exact pin</span>
            {home && (
              <button
                type="button"
                className="chip-btn home-minimize-btn"
                onClick={minimize}
                title="Minimize home card"
                aria-label="Minimize home card"
              >
                ▴
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="home-embedded-head">
          <span className="home-embedded-title">🏠 Home pin</span>
          {home && (
            <button
              type="button"
              className="chip-btn home-minimize-btn"
              onClick={minimize}
              title="Minimize"
              aria-label="Minimize home"
            >
              ▴
            </button>
          )}
        </div>
      )}

      {home && !editing ? (
        <div className="home-set-row">
          <button type="button" className="home-go-btn" onClick={onGoHome}>
            <strong>{home.name || 'Home'}</strong>
            <span>
              {fmtCoord(home.latitude, 5)}, {fmtCoord(home.longitude, 5)}
              {home.admin1 ? ` · ${home.admin1}` : ''}
            </span>
          </button>
          <div className="home-actions">
            <button
              type="button"
              className="chip-btn"
              onClick={() => {
                setEditing(true)
                setErr(null)
              }}
            >
              Edit
            </button>
            <button
              type="button"
              className="chip-btn"
              onClick={() => setHomeAndMaybeCompact(null)}
              title="Clear home"
            >
              Clear
            </button>
            <button
              type="button"
              className="chip-btn home-minimize-btn-inline"
              onClick={minimize}
              title="Minimize"
            >
              Minimize
            </button>
          </div>
        </div>
      ) : !editing ? (
        <div className="home-empty">
          <p className="muted-center home-empty-lead">
            Save an exact home pin (GPS or coordinates) for open-at-launch and alerts.
          </p>
          <div className="home-actions home-actions-wrap">
            <button
              type="button"
              className="primary-btn"
              onClick={() => void saveGps()}
              disabled={busy || geoLoading}
            >
              {busy ? 'Locating…' : 'Use GPS (exact)'}
            </button>
            {current && (
              <button type="button" className="chip-btn" onClick={saveCurrent}>
                Use this place
              </button>
            )}
            <button
              type="button"
              className="chip-btn"
              onClick={() => {
                setEditing(true)
                if (current) {
                  setLatStr(fmtCoord(current.latitude, 6))
                  setLonStr(fmtCoord(current.longitude, 6))
                  setLabel(current.name || 'Home')
                }
                setErr(null)
              }}
            >
              Enter coordinates
            </button>
          </div>
        </div>
      ) : null}

      {editing && (
        <div className="home-edit">
          <label className="home-field">
            Label
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Home"
              maxLength={48}
              autoComplete="off"
            />
          </label>
          <div className="home-coord-row">
            <label className="home-field">
              Latitude
              <input
                type="text"
                inputMode="decimal"
                value={latStr}
                onChange={(e) => setLatStr(e.target.value)}
                placeholder="35.467560"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="home-field">
              Longitude
              <input
                type="text"
                inputMode="decimal"
                value={lonStr}
                onChange={(e) => setLonStr(e.target.value)}
                placeholder="-97.516428"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          </div>
          <p className="home-edit-hint">
            5–6 decimal places ≈ 1 m precision. City search uses a city center; GPS or manual
            coords are exact.
          </p>
          <div className="home-actions home-actions-wrap">
            <button
              type="button"
              className="primary-btn"
              onClick={() => void saveManual()}
              disabled={busy}
            >
              Save home
            </button>
            <button
              type="button"
              className="chip-btn"
              onClick={() => void saveGps()}
              disabled={busy || geoLoading}
            >
              Fill from GPS
            </button>
            {current && (
              <button
                type="button"
                className="chip-btn"
                onClick={() => {
                  setLatStr(fmtCoord(current.latitude, 6))
                  setLonStr(fmtCoord(current.longitude, 6))
                  if (!label || label === 'Home') setLabel(current.name || 'Home')
                }}
              >
                Fill from map
              </button>
            )}
            <button
              type="button"
              className="chip-btn"
              onClick={() => {
                setEditing(false)
                setErr(null)
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {err && <p className="home-err">{err}</p>}

      {!embedded && (
        <p className="home-sync-hint muted-center">
          {accountSynced
            ? '☁ Home syncs to your account — open Solara on your phone while signed in to the same account.'
            : signedIn
              ? '☁ Signed in — home will upload to your account for other devices.'
              : 'Sign in (menu) with the same account on desktop and phone so your home pin appears on both.'}
        </p>
      )}
    </Tag>
  )
}
