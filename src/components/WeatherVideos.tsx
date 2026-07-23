/**
 * Free official weather videos — NWS / NOAA (public domain, YouTube embed).
 */
import { useEffect, useMemo, useState } from 'react'
import {
  fetchWeatherVideos,
  type WeatherVideo,
  type WeatherVideosPayload,
} from '../api/weatherVideos'

type Tab = 'latest' | 'safety'

export function WeatherVideos() {
  const [data, setData] = useState<WeatherVideosPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('latest')
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetchWeatherVideos()
      .then((d) => {
        if (cancelled) return
        setData(d)
        const first = d.latest[0] || d.safety[0]
        if (first) setActiveId(first.id)
        if (!d.latest.length) setTab('safety')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const list = useMemo(() => {
    if (!data) return [] as WeatherVideo[]
    return tab === 'latest' ? data.latest : data.safety
  }, [data, tab])

  const active = list.find((v) => v.id === activeId) || list[0] || null

  useEffect(() => {
    if (list.length && !list.some((v) => v.id === activeId)) {
      setActiveId(list[0].id)
    }
  }, [list, activeId])

  return (
    <section className="panel weather-videos-panel" aria-label="Weather videos">
      <div className="panel-header">
        <h2>🎬 Weather video</h2>
        <span className="panel-hint">Free · NOAA / NWS</span>
      </div>

      <div className="wv-tabs" role="tablist" aria-label="Video type">
        <button
          type="button"
          role="tab"
          className={`chip-btn ${tab === 'latest' ? 'active' : ''}`}
          aria-selected={tab === 'latest'}
          onClick={() => setTab('latest')}
          disabled={!data?.latest.length}
        >
          Latest briefings
        </button>
        <button
          type="button"
          role="tab"
          className={`chip-btn ${tab === 'safety' ? 'active' : ''}`}
          aria-selected={tab === 'safety'}
          onClick={() => setTab('safety')}
        >
          Safety &amp; preparedness
        </button>
      </div>

      {loading && (
        <div className="wv-loading">
          <div className="spinner" />
          <span>Loading official videos…</span>
        </div>
      )}

      {!loading && active && (
        <div className="wv-player-wrap">
          <div className="wv-player">
            <iframe
              key={active.id}
              src={active.embedUrl}
              title={active.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
          <div className="wv-active-meta">
            <strong>{active.title}</strong>
            <span>
              {active.channel}
              {active.published
                ? ` · ${new Date(active.published).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}`
                : ''}
            </span>
            <a
              className="chip-btn wv-open"
              href={active.watchUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open on YouTube
            </a>
          </div>
        </div>
      )}

      {!loading && list.length > 1 && (
        <ul className="wv-list" aria-label="More videos">
          {list.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                className={`wv-item ${v.id === active?.id ? 'active' : ''}`}
                onClick={() => setActiveId(v.id)}
              >
                {v.thumbnail ? (
                  <img src={v.thumbnail} alt="" width={96} height={54} loading="lazy" />
                ) : (
                  <span className="wv-thumb-ph" aria-hidden>
                    ▶
                  </span>
                )}
                <span className="wv-item-text">
                  <strong>{v.title}</strong>
                  <em>{v.channel}</em>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && !list.length && (
        <p className="muted-center">
          No videos loaded. Check{' '}
          <a href="https://www.youtube.com/@noaanationalweatherservice" target="_blank" rel="noreferrer">
            NWS on YouTube
          </a>
          .
        </p>
      )}

      <p className="wv-attr">
        {data?.attribution ||
          'Official NOAA / NWS videos. Free public information; embedded via YouTube.'}{' '}
        <a href="https://www.weather.gov/" target="_blank" rel="noreferrer">
          weather.gov
        </a>
      </p>
    </section>
  )
}
