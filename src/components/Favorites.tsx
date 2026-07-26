import type { LocationResult } from '../api/types'
import { formatLocationLabel, locationKey } from '../api/weather'
import { HomeLocationPanel } from './HomeLocationPanel'

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

  return (
    <section className="panel favorites-panel favorites-with-home">
      <div className="panel-header">
        <h2>★ Saved places</h2>
        <span className="panel-hint">
          {favorites.length}/12
          {accountSynced ? ' · ☁' : signedIn ? '' : ' · local'}
        </span>
      </div>

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
    </section>
  )
}
