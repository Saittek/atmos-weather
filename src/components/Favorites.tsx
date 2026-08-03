import { useEffect, useState } from 'react'
import type { LocationResult } from '../api/types'
import { formatLocationLabel, locationKey } from '../api/weather'
import { HomeLocationPanel } from './HomeLocationPanel'

const MINI_KEY = 'solara-favorites-minimized'

interface Props {
  favorites: LocationResult[]
  current: LocationResult | null
  onSelect: (loc: LocationResult) => void
  onRemove: (loc: LocationResult) => void
  accountSynced?: boolean
  signedIn?: boolean
  /** Exact home pin (shown at top of Saved places) */
  home?: LocationResult | null
  geoLoading?: boolean
  onSetHome?: (loc: LocationResult | null) => void
  onGoHome?: () => void
}

function loadMinimized(): boolean {
  try {
    return localStorage.getItem(MINI_KEY) === '1'
  } catch {
    return false
  }
}

function saveMinimized(v: boolean) {
  try {
    if (v) localStorage.setItem(MINI_KEY, '1')
    else localStorage.removeItem(MINI_KEY)
  } catch {
    /* ignore */
  }
}

export function Favorites({
  favorites,
  current,
  onSelect,
  onRemove,
  accountSynced,
  signedIn,
  home = null,
  geoLoading,
  onSetHome,
  onGoHome,
}: Props) {
  const cur = current ? locationKey(current) : ''
  const showHome = Boolean(onSetHome && onGoHome)
  const [minimized, setMinimized] = useState(loadMinimized)

  useEffect(() => {
    saveMinimized(minimized)
  }, [minimized])

  const toggle = () => setMinimized((m) => !m)
  const count = favorites.length + (home ? 1 : 0)

  return (
    <section
      className={`panel favorites-panel favorites-with-home ${minimized ? 'is-minimized' : ''}`}
    >
      <div className="panel-header favorites-header-row">
        <h2>★ Saved places</h2>
        <div className="favorites-header-actions">
          <span className="panel-hint">
            {favorites.length}/12
            {accountSynced ? ' · ☁' : signedIn ? '' : ' · local'}
          </span>
          <button
            type="button"
            className="chip-btn favorites-mini-btn"
            onClick={toggle}
            aria-expanded={!minimized}
            aria-controls="favorites-body"
            title={minimized ? 'Expand saved places' : 'Minimize saved places'}
          >
            {minimized ? `Show${count ? ` (${count})` : ''}` : 'Hide'}
          </button>
        </div>
      </div>

      {minimized ? (
        <button
          type="button"
          className="favorites-mini-summary"
          onClick={toggle}
          aria-label="Expand saved places"
        >
          <span>
            {home ? `Home · ${home.name.replace(/\s*\(Home\)\s*$/i, '').trim()}` : 'No home set'}
            {favorites.length
              ? ` · ${favorites.length} saved`
              : home
                ? ' · no other places'
                : ''}
          </span>
          <span className="favorites-mini-chev" aria-hidden>
            ▾
          </span>
        </button>
      ) : (
        <div id="favorites-body" className="favorites-body">
          {showHome && onSetHome && onGoHome && (
            <div className="favorites-home-slot">
              <HomeLocationPanel
                home={home}
                current={current}
                geoLoading={geoLoading}
                onSetHome={onSetHome}
                onGoHome={onGoHome}
                signedIn={signedIn}
                accountSynced={accountSynced}
                embedded
              />
            </div>
          )}

          {!favorites.length ? (
            <p className="muted-center favorites-empty-msg">
              {showHome
                ? 'Star any location to pin work, trips, or other spots under home.'
                : 'Star any location to pin home, work, or trip spots here.'}
              {!signedIn && ' Create an account to keep them across devices.'}
            </p>
          ) : (
            <ul className="favorites-list">
              {favorites.map((f) => {
                const active = locationKey(f) === cur
                return (
                  <li key={locationKey(f)} className={active ? 'active' : ''}>
                    <button type="button" className="fav-main" onClick={() => onSelect(f)}>
                      <span className="fav-name">{f.name}</span>
                      <span className="fav-meta">
                        {formatLocationLabel(f).replace(`${f.name}, `, '')}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="fav-x"
                      title="Remove"
                      onClick={() => onRemove(f)}
                    >
                      ×
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
