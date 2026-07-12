import type { LocationResult } from '../api/types'
import { formatLocationLabel, locationKey } from '../api/weather'

interface Props {
  favorites: LocationResult[]
  current: LocationResult | null
  onSelect: (loc: LocationResult) => void
  onRemove: (loc: LocationResult) => void
  accountSynced?: boolean
  signedIn?: boolean
}

export function Favorites({
  favorites,
  current,
  onSelect,
  onRemove,
  accountSynced,
  signedIn,
}: Props) {
  if (!favorites.length) {
    return (
      <section className="panel favorites-panel">
        <div className="panel-header">
          <h2>★ Saved places</h2>
        </div>
        <p className="muted-center">
          Star any location to pin home, work, or trip spots here.
          {!signedIn && ' Create an account to keep them across devices.'}
        </p>
      </section>
    )
  }

  const cur = current ? locationKey(current) : ''

  return (
    <section className="panel favorites-panel">
      <div className="panel-header">
        <h2>★ Saved places</h2>
        <span className="panel-hint">
          {favorites.length}/12
          {accountSynced ? ' · ☁' : signedIn ? '' : ' · local'}
        </span>
      </div>
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
    </section>
  )
}
