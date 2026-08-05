/**
 * Stargazing / astrophotography desk — full planner.
 * Route: /stargaze?lat=&lon=&name=
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useWeather } from '../hooks/useWeather'
import { SearchBar } from '../components/SearchBar'
import { UnitToggle } from '../components/UnitToggle'
import { MoonPhaseIcon } from '../components/MoonPhaseIcon'
import type { LocationResult } from '../api/types'
import { fetchIssPasses, fetchKpIndex, type IssSnapshot } from '../api/skyExtras'
import { formatSpeed, formatTime } from '../utils/format'
import {
  buildStargazeBrief,
  cacheStargazeBrief,
  gradeLabel,
  loadCachedStargazeBrief,
  type GoNoGo,
  type StargazeGrade,
  type StargazeHour,
} from '../utils/stargaze'
import { sameExactPlace } from '../hooks/useWeather'

const RED_KEY = 'solara-stargaze-red-v1'

function gradeClass(g: StargazeGrade): string {
  return `sg-grade-${g}`
}

function goClass(g: GoNoGo): string {
  return `sg-go-${g}`
}

function HourStrip({ hours }: { hours: StargazeHour[] }) {
  const night = hours.filter((h) => h.isNight)
  const show = (night.length >= 4 ? night : hours).filter(
    (h) => h.ms < Date.now() + 36 * 3600_000,
  )
  if (!show.length) return <p className="muted-center">No hourly sky data yet.</p>
  return (
    <ol className="sg-hour-strip" aria-label="Sky quality by hour">
      {show.map((h) => (
        <li key={h.time} className={`sg-hour ${gradeClass(h.grade)}`}>
          <span className="sg-hour-when">{h.label}</span>
          <div className="sg-hour-bar-wrap" aria-hidden>
            <div
              className="sg-hour-bar"
              style={{ height: `${Math.max(8, h.isNight ? h.score : 4)}%` }}
            />
          </div>
          <span className="sg-hour-score">{h.isNight ? h.score : '—'}</span>
          <span className="sg-hour-cloud" title="Cloud cover">
            {h.isNight ? `${h.cloud}%` : 'day'}
          </span>
        </li>
      ))}
    </ol>
  )
}

function loadRed(): boolean {
  try {
    return localStorage.getItem(RED_KEY) === '1'
  } catch {
    return false
  }
}

export default function StargazePage() {
  const [params, setSearchParams] = useSearchParams()
  const {
    location,
    weather,
    air,
    units,
    loading,
    refreshing,
    loadForLocation,
    requestMyLocation,
    geoLoading,
    setUnits,
    refresh,
    homeLocation,
    goHome,
  } = useWeather()

  const [shareMsg, setShareMsg] = useState<string | null>(null)
  const [redMode, setRedMode] = useState(loadRed)
  const [kp, setKp] = useState<number | null>(null)
  const [iss, setIss] = useState<IssSnapshot | null>(null)
  const [compareOn, setCompareOn] = useState(false)
  const [homeWeatherScore, setHomeWeatherScore] = useState<number | null>(null)
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null)

  const qLat = parseFloat(params.get('lat') ?? '')
  const qLon = parseFloat(params.get('lon') ?? '')
  const qName = params.get('name') || ''

  useEffect(() => {
    if (Number.isNaN(qLat) || Number.isNaN(qLon)) return
    if (
      location &&
      Math.abs(location.latitude - qLat) < 0.05 &&
      Math.abs(location.longitude - qLon) < 0.05
    ) {
      return
    }
    void loadForLocation({
      id: Date.now(),
      name: qName || `${qLat.toFixed(2)}, ${qLon.toFixed(2)}`,
      latitude: qLat,
      longitude: qLon,
    })
  }, [qLat, qLon, qName, location, loadForLocation])

  useEffect(() => {
    let cancelled = false
    void fetchKpIndex().then((k) => {
      if (!cancelled && k) setKp(k.kp)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!location) return
    let cancelled = false
    void fetchIssPasses(location.latitude, location.longitude).then((p) => {
      if (!cancelled) setIss(p)
    })
    return () => {
      cancelled = true
    }
  }, [location?.latitude, location?.longitude])

  const brief = useMemo(() => {
    if (!weather || !location) return null
    return buildStargazeBrief(weather, {
      lat: location.latitude,
      lon: location.longitude,
      air,
      auroraKp: kp,
    })
  }, [weather, location, air, kp])

  useEffect(() => {
    if (!brief || !location) return
    const key = `${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}`
    cacheStargazeBrief(key, brief)
  }, [brief, location])

  // Offline fallback
  const offlineBrief = useMemo(() => {
    if (brief || !location) return null
    const key = `${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}`
    return loadCachedStargazeBrief(key)
  }, [brief, location])

  const shown = brief ?? offlineBrief

  // Compare home vs current — score only using same weather if home ≈ current
  useEffect(() => {
    if (!compareOn || !homeLocation || !weather || !location) {
      setHomeWeatherScore(null)
      return
    }
    if (sameExactPlace(location, homeLocation)) {
      setHomeWeatherScore(shown?.imagingScore ?? null)
      return
    }
    // Approximate: use same weather model shifted only by Bortle (true dual-fetch is heavier)
    const homeBrief = buildStargazeBrief(weather, {
      lat: homeLocation.latitude,
      lon: homeLocation.longitude,
      air,
      auroraKp: kp,
    })
    setHomeWeatherScore(homeBrief.imagingScore)
  }, [compareOn, homeLocation, weather, location, air, kp, shown?.imagingScore])

  const onSelect = (loc: LocationResult) => {
    void loadForLocation(loc)
    setSearchParams({
      lat: loc.latitude.toFixed(4),
      lon: loc.longitude.toFixed(4),
      name: loc.name,
    })
  }

  const toggleRed = () => {
    setRedMode((v) => {
      const next = !v
      try {
        localStorage.setItem(RED_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const share = async () => {
    if (!location || !shown) return
    const url = new URL(window.location.origin + '/stargaze')
    url.searchParams.set('lat', location.latitude.toFixed(4))
    url.searchParams.set('lon', location.longitude.toFixed(4))
    url.searchParams.set('name', location.name)
    const text = `Stargazing · ${location.name}: tonight ${shown.imagingScore}/100 (${gradeLabel(shown.imagingGrade)}). ${shown.goLabel}. ${shown.moon.emoji} ${shown.moon.name}. Bortle ~${shown.bortle.class}.`

    // Share image card
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 720
      canvas.height = 400
      const ctx = canvas.getContext('2d')
      if (ctx) {
        const g = ctx.createLinearGradient(0, 0, 720, 400)
        g.addColorStop(0, redMode ? '#1a0505' : '#0b1020')
        g.addColorStop(1, redMode ? '#3f0a0a' : '#1e1b4b')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, 720, 400)
        ctx.fillStyle = redMode ? '#fecaca' : '#e0e7ff'
        ctx.font = '700 22px system-ui,sans-serif'
        ctx.fillText('Solara · Stargaze', 36, 48)
        ctx.font = '600 18px system-ui,sans-serif'
        ctx.fillStyle = redMode ? '#fca5a5' : '#94a3b8'
        ctx.fillText(location.name.slice(0, 40), 36, 82)
        ctx.fillStyle = redMode ? '#fee2e2' : '#f8fafc'
        ctx.font = '800 96px system-ui,sans-serif'
        ctx.fillText(String(shown.imagingScore), 36, 200)
        ctx.font = '600 28px system-ui,sans-serif'
        ctx.fillText(gradeLabel(shown.imagingGrade), 36, 250)
        ctx.font = '500 20px system-ui,sans-serif'
        ctx.fillStyle = redMode ? '#f87171' : '#a5b4fc'
        ctx.fillText(shown.goLabel, 36, 290)
        ctx.fillStyle = redMode ? '#fca5a5' : '#cbd5e1'
        ctx.font = '500 18px system-ui,sans-serif'
        ctx.fillText(
          `${shown.moon.emoji} ${shown.moon.name} · Bortle ~${shown.bortle.class} · Seeing ${shown.seeingLabel}`,
          36,
          340,
        )
        ctx.fillStyle = redMode ? '#7f1d1d' : '#64748b'
        ctx.font = '500 14px system-ui,sans-serif'
        ctx.fillText('solaraweather.com/stargaze', 36, 380)
      }
    } catch {
      /* image optional */
    }

    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Solara · Stargaze', text, url: url.toString() })
        setShareMsg('Shared')
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`)
        setShareMsg('Copied link')
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      try {
        await navigator.clipboard.writeText(url.toString())
        setShareMsg('Copied link')
      } catch {
        setShareMsg(url.toString())
      }
    }
    window.setTimeout(() => setShareMsg(null), 2200)
  }

  const requestClearNotify = useCallback(async () => {
    if (!shown || shown.imagingScore < 62) {
      setNotifyMsg('Notify when tonight score is Good+ — score is still modest.')
      window.setTimeout(() => setNotifyMsg(null), 3000)
      return
    }
    try {
      if (!('Notification' in window)) {
        setNotifyMsg('Notifications not supported here')
        return
      }
      let perm = Notification.permission
      if (perm === 'default') perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setNotifyMsg('Permission denied')
        return
      }
      // Fire a local heads-up now if already good; future scheduling needs push/cron
      new Notification('Solara · clear-ish night', {
        body: `${location?.name || 'Your place'}: tonight ${shown.imagingScore}/100 — ${shown.goLabel}`,
        tag: 'solara-stargaze-clear',
      })
      try {
        localStorage.setItem(
          'solara-stargaze-notify-place',
          JSON.stringify({
            lat: location?.latitude,
            lon: location?.longitude,
            minScore: 62,
          }),
        )
      } catch {
        /* ignore */
      }
      setNotifyMsg('Alert set · you’ll get a ping when score is good (app open / browser notify)')
    } catch {
      setNotifyMsg('Could not enable notify')
    }
    window.setTimeout(() => setNotifyMsg(null), 4000)
  }, [shown, location])

  // Auto-ping if user opted in and score good
  useEffect(() => {
    if (!shown || !location) return
    try {
      const raw = localStorage.getItem('solara-stargaze-notify-place')
      if (!raw) return
      const o = JSON.parse(raw) as { lat?: number; lon?: number; minScore?: number; lastPing?: number }
      if (o.lat == null || o.lon == null) return
      if (
        Math.abs(o.lat - location.latitude) > 0.2 ||
        Math.abs(o.lon - location.longitude) > 0.2
      ) {
        return
      }
      if (shown.imagingScore < (o.minScore ?? 62)) return
      if (o.lastPing && Date.now() - o.lastPing < 12 * 3600_000) return
      if (Notification.permission !== 'granted') return
      new Notification('Solara · good night for stars', {
        body: `${location.name}: ${shown.imagingScore}/100 — ${shown.goLabel}`,
        tag: 'solara-stargaze-clear',
      })
      localStorage.setItem(
        'solara-stargaze-notify-place',
        JSON.stringify({ ...o, lastPing: Date.now() }),
      )
    } catch {
      /* ignore */
    }
  }, [shown?.imagingScore, location])

  const tz = weather?.timezone
  const placeName = location?.name || 'Choose a place'

  return (
    <div className={`sg-page app${redMode ? ' sg-red' : ''}`} data-page="stargaze">
      <header className="sg-topbar">
        <div className="sg-topbar-row">
          <Link to="/" className="chip-btn" title="Dashboard">
            ← Solara
          </Link>
          <h1 className="sg-title">
            <span aria-hidden>✨</span> Stargaze
          </h1>
          <div className="sg-top-actions">
            <button
              type="button"
              className={`chip-btn${redMode ? ' on' : ''}`}
              onClick={toggleRed}
              title="Red mode for night vision"
            >
              🔴 Red
            </button>
            <UnitToggle units={units} onChange={setUnits} />
            <button
              type="button"
              className="chip-btn"
              onClick={() => refresh()}
              disabled={refreshing || loading}
            >
              {refreshing ? '…' : '↻'}
            </button>
          </div>
        </div>
        <div className="sg-search-row">
          <SearchBar
            onSelect={onSelect}
            onUseLocation={() => void requestMyLocation()}
            geoLoading={geoLoading}
            home={homeLocation}
            onGoHome={() => goHome()}
          />
        </div>
      </header>

      <main className="sg-main">
        {(loading || !weather) && !shown && (
          <div className="sg-loading" role="status">
            <div className="spinner large" />
            <p>Loading sky forecast…</p>
          </div>
        )}

        {shown && location && (
          <>
            {!brief && offlineBrief && (
              <p className="sg-offline-banner" role="status">
                Offline · showing last saved stargaze brief
              </p>
            )}

            {/* Go / no-go */}
            <section className={`panel sg-gono ${goClass(shown.go)}`} aria-label="Go or no-go">
              <p className="sg-gono-label">{shown.goLabel}</p>
              <p className="sg-gono-detail">{shown.goDetail}</p>
            </section>

            <section className={`panel sg-hero ${gradeClass(shown.imagingGrade)}`}>
              <p className="sg-kicker">Tonight at {placeName}</p>
              <div className="sg-hero-grid">
                <div className="sg-score-block">
                  <p className="sg-score-label">Imaging score</p>
                  <p className="sg-score-big">
                    {shown.imagingScore}
                    <span className="sg-score-max">/100</span>
                  </p>
                  <p className={`sg-grade-pill ${gradeClass(shown.imagingGrade)}`}>
                    {gradeLabel(shown.imagingGrade)}
                  </p>
                </div>
                <div className="sg-score-block secondary">
                  <p className="sg-score-label">Right now</p>
                  <p className="sg-score-mid">
                    {shown.nowGrade === 'daylight' ? '—' : shown.nowScore}
                    {shown.nowGrade !== 'daylight' && (
                      <span className="sg-score-max">/100</span>
                    )}
                  </p>
                  <p className={`sg-grade-pill ${gradeClass(shown.nowGrade)}`}>
                    {gradeLabel(shown.nowGrade)}
                  </p>
                </div>
                <div className="sg-moon-block">
                  <MoonPhaseIcon phase={shown.moon.phase} size={64} />
                  <div>
                    <p className="sg-moon-name">
                      {shown.moon.emoji} {shown.moon.name}
                    </p>
                    <p className="sg-moon-illum">{shown.moon.illumination}% illuminated</p>
                  </div>
                </div>
              </div>
              <p className="sg-summary">{shown.summary}</p>
              {shown.bestWindow && (
                <p className="sg-best-window">
                  <strong>Best window</strong> · {shown.bestWindow.startLabel} –{' '}
                  {shown.bestWindow.endLabel}
                  <span className="sg-best-score"> · avg {shown.bestWindow.avgScore}</span>
                </p>
              )}
              <div className="sg-hero-actions">
                <button type="button" className="primary-btn" onClick={() => void share()}>
                  Share night
                </button>
                <button type="button" className="chip-btn" onClick={() => void requestClearNotify()}>
                  Notify if clear
                </button>
                {shareMsg && <span className="sg-share-msg">{shareMsg}</span>}
                {notifyMsg && <span className="sg-share-msg">{notifyMsg}</span>}
              </div>
            </section>

            <section className="panel sg-factors" aria-label="Sky factors">
              <div className="panel-header">
                <h2>Sky factors</h2>
              </div>
              <ul className="sg-factor-grid">
                {shown.factors.map((f) => (
                  <li key={f.label} className={`sg-factor tone-${f.tone}`}>
                    <span className="sg-factor-label">{f.label}</span>
                    <span className="sg-factor-value">{f.value}</span>
                  </li>
                ))}
                <li className="sg-factor tone-ok">
                  <span className="sg-factor-label">Wind</span>
                  <span className="sg-factor-value">
                    {weather
                      ? formatSpeed(weather.current.wind_speed_10m, units)
                      : '—'}
                  </span>
                </li>
              </ul>
              <p className="sg-bortle-detail">
                {shown.bortle.label} — {shown.bortle.sky}. {shown.bortle.detail}
              </p>
              {shown.smokeNote && <p className="sg-smoke-note">{shown.smokeNote}</p>}
              {shown.auroraLabel && (
                <p className={`sg-aurora${shown.auroraLikely ? ' hot' : ''}`}>
                  🌌 {shown.auroraLabel}
                  {shown.auroraLikely ? ' · aurora watch' : ''}
                </p>
              )}
            </section>

            {/* 7-night strip */}
            {shown.nights.length > 0 && (
              <section className="panel" aria-label="Next nights">
                <div className="panel-header">
                  <h2>Next nights</h2>
                  <span className="panel-hint">Plan the week</span>
                </div>
                <ol className="sg-nights">
                  {shown.nights.map((n) => (
                    <li key={n.dateKey} className={`sg-night ${gradeClass(n.grade)} ${goClass(n.go)}`}>
                      <span className="sg-night-day">{n.label}</span>
                      <span className="sg-night-score">{n.score}</span>
                      <span className="sg-night-meta">
                        ☁️{n.cloudAvg}% · 🌙{n.moonIllum}%
                      </span>
                      <span className="sg-night-go">
                        {n.go === 'go' ? 'Go' : n.go === 'maybe' ? 'Maybe' : 'No'}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <section className="panel sg-darkness" aria-label="Darkness">
              <div className="panel-header">
                <h2>Darkness</h2>
                <span className="panel-hint">Astronomical night (sun &lt; −18°)</span>
              </div>
              <div className="sg-dark-grid">
                <div>
                  <span className="label">Sunset</span>
                  <span className="value">
                    {shown.sunset && weather ? formatTime(shown.sunset, tz) : '—'}
                  </span>
                </div>
                <div>
                  <span className="label">Dark from</span>
                  <span className="value">{shown.darkStartLabel ?? '—'}</span>
                </div>
                <div>
                  <span className="label">Dark until</span>
                  <span className="value">{shown.darkEndLabel ?? '—'}</span>
                </div>
                <div>
                  <span className="label">Sunrise</span>
                  <span className="value">
                    {shown.sunrise && weather ? formatTime(shown.sunrise, tz) : '—'}
                  </span>
                </div>
              </div>
              <p className="sg-dew-line">
                Seeing: <strong>{shown.seeingLabel}</strong> · {shown.dewLabel}
              </p>
            </section>

            {weather && (
              <section className="panel sg-hours-panel" aria-label="Hourly sky">
                <div className="panel-header">
                  <h2>Hourly sky quality</h2>
                  <span className="panel-hint">Higher = better</span>
                </div>
                <HourStrip hours={shown.hours} />
              </section>
            )}

            {/* Targets */}
            <section className="panel" aria-label="Tonight targets">
              <div className="panel-header">
                <h2>Tonight ideas</h2>
              </div>
              <ul className="sg-targets">
                {shown.targets.map((t) => (
                  <li key={t.name} className={`sg-target kind-${t.kind}`}>
                    <span className="sg-target-emoji" aria-hidden>
                      {t.emoji}
                    </span>
                    <div>
                      <strong>{t.name}</strong>
                      <p>{t.why}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {/* ISS */}
            <section className="panel" aria-label="ISS passes">
              <div className="panel-header">
                <h2>ISS flyovers</h2>
                <span className="panel-hint">Approx · elev ≥ 20°</span>
              </div>
              {!iss && <p className="muted-center">Loading pass predictions…</p>}
              {iss && iss.passes.length === 0 && (
                <p className="muted-center">No bright passes in the next ~36h from this model.</p>
              )}
              {iss && iss.passes.length > 0 && (
                <ul className="sg-iss-list">
                  {iss.passes.map((p) => (
                    <li key={p.maxMs}>
                      <strong>
                        {new Date(p.riseMs).toLocaleString(undefined, {
                          weekday: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </strong>
                      <span>
                        max {p.maxEl}° · {p.direction || '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="sg-footnote muted-center">
                {iss?.note || 'Confirm with NASA Spot the Station for official times.'}
              </p>
            </section>

            {/* Compare home */}
            {homeLocation && (
              <section className="panel" aria-label="Compare places">
                <div className="panel-header">
                  <h2>Home vs here</h2>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => setCompareOn((v) => !v)}
                  >
                    {compareOn ? 'Hide' : 'Compare'}
                  </button>
                </div>
                {compareOn && (
                  <div className="sg-compare">
                    <div>
                      <span className="label">Here · {location.name}</span>
                      <span className="value">{shown.imagingScore}/100</span>
                    </div>
                    <div>
                      <span className="label">
                        Home · {homeLocation.name?.replace(/\s*\(Home\)\s*$/i, '')}
                      </span>
                      <span className="value">
                        {homeWeatherScore != null ? `${homeWeatherScore}/100` : '—'}
                      </span>
                    </div>
                    <p className="sg-footnote">
                      Uses Bortle at each pin with this place’s cloud forecast as a proxy when
                      Home isn’t loaded separately.
                    </p>
                  </div>
                )}
              </section>
            )}

            <section className="panel sg-tips" aria-label="Tips">
              <div className="panel-header">
                <h2>Planner tips</h2>
              </div>
              <ul className="sg-tip-list">
                {shown.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>

            <nav className="sg-footer-nav" aria-label="More Solara">
              <Link to="/" className="chip-btn">
                Dashboard
              </Link>
              <Link
                to={`/radar?lat=${location.latitude.toFixed(4)}&lon=${location.longitude.toFixed(4)}&name=${encodeURIComponent(location.name)}`}
                className="chip-btn"
              >
                Radar
              </Link>
              <Link to="/globe" className="chip-btn">
                Earth
              </Link>
            </nav>
          </>
        )}

        {!loading && !weather && !shown && (
          <div className="panel sg-empty">
            <h2>Pick a place to plan the night</h2>
            <p>Search above or use Near me / Home.</p>
          </div>
        )}
      </main>
    </div>
  )
}
