import { useEffect, useState } from 'react'
import { fetchSpcMesoscaleDiscussions, type SpcMdItem } from '../api/severeLayers'

export function SpcMdPanel() {
  const [items, setItems] = useState<SpcMdItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void fetchSpcMesoscaleDiscussions()
      .then((list) => {
        if (!cancelled) setItems(list)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="panel chaser-md-panel">
      <div className="panel-header">
        <h2>SPC mesoscale</h2>
        <span className="panel-hint">{loading ? 'Loading…' : `${items.length} active`}</span>
      </div>
      {!loading && !items.length ? (
        <p className="muted-center">No active mesoscale discussions in the SPC feed.</p>
      ) : (
        <ul className="chaser-md-list">
          {items.map((md) => (
            <li key={md.id}>
              <a href={md.link} target="_blank" rel="noreferrer" className="chaser-md-link">
                <strong>{md.title}</strong>
                {md.summary && <span>{md.summary}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
