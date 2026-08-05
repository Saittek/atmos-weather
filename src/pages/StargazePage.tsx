/**
 * Stargazing / astrophotography desk — full planner.
 * Route: /stargaze?lat=&lon=&name=
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useWeather, sameExactPlace } from '../hooks/useWeather'
import { SearchBar } from '../components/SearchBar'
import { UnitToggle } from '../components/UnitToggle'
import { MoonPhaseIcon } from '../components/MoonPhaseIcon'
import { ClearSkyChart } from '../components/ClearSkyChart'
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
import { moonGeometry } from '../utils/moonTimes'
import { brightPlanetsTonight } from '../utils/planetVisibility'
import { upcomingSkyEvents } from '../utils/skyEvents'
import {
  addDarkSite,
  distanceKm,
  driveHintKm,
  loadDarkSites,
  removeDarkSite,
  type DarkSite,
} from '../utils/darkSites'

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
  const [sites, setSites] = useState<DarkSite[]>(() => loadDarkSites())

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

  const moonGeo = useMemo(() => {
    if (!location) return null
    return moonGeometry(location.latitude, location.longitude)
  }, [location?.latitude, location?.longitude])

  const planets = useMemo(() => {
    if (!location) return []
    return brightPlanetsTonight(location.latitude, location.longitude)
  }, [location?.latitude, location?.longitude])

  const events = useMemo(() => upcomingSkyEvents(new Date(), 5), [])

  const fmtMs = (ms: number | null | undefined) => {
    if (ms == null) return '—'
    try {
      return new Date(ms).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: tz,
      })
    } catch {
      return new Date(ms).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      })
    }
  }

  const saveSite = () => {
    if (!location) return
    setSites(
      addDarkSite({
        name: location.name,
        latitude: location.latitude,
        longitude: location.longitude,
      }),
    )
  }

  // Annual darkness: hours of night per month (approx from lat)
  const annualDark = useMemo(() => {
    if (!location) return []
    const lat = location.latitude
    const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
    return months.map((m, i) => {
      // Rough: night hours ~ 12 - 4*sin(lat) * cos(day of year peak)
      const day = i * 30 + 15
      const decl = 23.44 * Math.cos(((day - 172) * Math.PI) / 180)
      const latR = (lat * Math.PI) / 180
      const dR = (decl * Math.PI) / 180
      const cosH =
        (Math.sin((-0.83 * Math.PI) / 180) - Math.sin(latR) * Math.sin(dR)) /
        (Math.cos(latR) * Math.cos(dR))
      let dayLen = 12
      if (cosH >= 1) dayLen = 0
      else if (cosH <= -1) dayLen = 24
      else dayLen = (24 / Math.PI) * Math.acos(Math.max(-1, Math.min(1, cosH)))
      const night = Math.max(0, Math.min(24, 24 - dayLen))
      return { m, hours: Math.round(night * 10) / 10 }
    })
  }, [location?.latitude])

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
                  <p className="sg-score-label">Imaging</p>
                  <p className="sg-score-big">
                    {shown.imagingScore}
                    <span className="sg-score-max">/100</span>
                  </p>
                  <p className={`sg-grade-pill ${gradeClass(shown.imagingGrade)}`}>
                    {gradeLabel(shown.imagingGrade)}
                  </p>
                </div>
                <div className="sg-score-block secondary">
                  <p className="sg-score-label">Visual</p>
                  <p className="sg-score-mid">
                    {shown.visualScore}
                    <span className="sg-score-max">/100</span>
                  </p>
                  <p className={`sg-grade-pill ${gradeClass(shown.visualGrade)}`}>
                    {gradeLabel(shown.visualGrade)}
                  </p>
                </div>
                <div className="sg-moon-block">
                  <MoonPhaseIcon phase={shown.moon.phase} size={64} />
                  <div>
                    <p className="sg-moon-name">
                      {shown.moon.emoji} {shown.moon.name}
                    </p>
                    <p className="sg-moon-illum">{shown.moon.illumination}% illuminated</p>
                    {moonGeo && (
                      <p className="sg-moon-illum">
                        ↑ {fmtMs(moonGeo.riseMs)} · transit {fmtMs(moonGeo.transitMs)}
                        {moonGeo.transitAlt != null ? ` (${moonGeo.transitAlt}°)` : ''} · ↓{' '}
                        {fmtMs(moonGeo.setMs)}
                        {moonGeo.upNow ? ' · up now' : ''}
                      </p>
                    )}
                    <p className="sg-moon-illum">{shown.sqm.label}</p>
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
                <h2>Twilight & darkness</h2>
                <span className="panel-hint">Civil · nautical · astronomical</span>
              </div>
              <div className="sg-dark-grid sg-dark-grid-6">
                <div>
                  <span className="label">Sunset</span>
                  <span className="value">
                    {shown.sunset && weather ? formatTime(shown.sunset, tz) : '—'}
                  </span>
                </div>
                <div>
                  <span className="label">Civil dusk</span>
                  <span className="value">{shown.civilDuskLabel ?? '—'}</span>
                </div>
                <div>
                  <span className="label">Nautical dusk</span>
                  <span className="value">{shown.nauticalDuskLabel ?? '—'}</span>
                </div>
                <div>
                  <span className="label">Astro dark from</span>
                  <span className="value">{shown.darkStartLabel ?? '—'}</span>
                </div>
                <div>
                  <span className="label">Astro dark until</span>
                  <span className="value">{shown.darkEndLabel ?? '—'}</span>
                </div>
                <div>
                  <span className="label">Nautical dawn</span>
                  <span className="value">{shown.nauticalDawnLabel ?? '—'}</span>
                </div>
                <div>
                  <span className="label">Civil dawn</span>
                  <span className="value">{shown.civilDawnLabel ?? '—'}</span>
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

            {/* Planets */}
            <section className="panel" aria-label="Planets">
              <div className="panel-header">
                <h2>Bright planets</h2>
                <span className="panel-hint">Rough evening placement</span>
              </div>
              <ul className="sg-planets">
                {planets.map((p) => (
                  <li key={p.id} className={p.visible ? 'up' : 'down'}>
                    <span>
                      {p.emoji} {p.name}
                    </span>
                    <span>{p.note}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Events */}
            <section className="panel" aria-label="Sky events">
              <div className="panel-header">
                <h2>Meteor showers & events</h2>
              </div>
              <ul className="sg-events">
                {events.map((e) => (
                  <li key={e.id} className={`sg-event ${e.status}`}>
                    <span className="sg-event-emoji">{e.emoji}</span>
                    <div>
                      <strong>{e.name}</strong>
                      <p>
                        {e.when} · {e.rate}
                      </p>
                      <p className="sg-event-note">{e.note}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {/* Annual darkness */}
            <section className="panel" aria-label="Annual darkness">
              <div className="panel-header">
                <h2>Annual darkness</h2>
                <span className="panel-hint">Avg night hours / month @ this lat</span>
              </div>
              <div className="sg-annual">
                {annualDark.map((m) => (
                  <div key={m.m} className="sg-annual-col">
                    <div
                      className="sg-annual-bar"
                      style={{ height: `${(m.hours / 18) * 100}%` }}
                      title={`${m.hours}h`}
                    />
                    <span>{m.m}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Dark sites + radar */}
            <section className="panel" aria-label="Dark sites">
              <div className="panel-header">
                <h2>Dark sites</h2>
                <button type="button" className="chip-btn" onClick={saveSite}>
                  Save this place
                </button>
              </div>
              {sites.length === 0 && (
                <p className="muted-center">Save observing spots for one-tap jumps.</p>
              )}
              <ul className="sg-sites">
                {sites.map((s) => {
                  const km = location
                    ? distanceKm(location, s)
                    : homeLocation
                      ? distanceKm(homeLocation, s)
                      : 0
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="sg-site-go"
                        onClick={() =>
                          onSelect({
                            id: Date.now(),
                            name: s.name,
                            latitude: s.latitude,
                            longitude: s.longitude,
                          })
                        }
                      >
                        <strong>{s.name}</strong>
                        <span>
                          {driveHintKm(km)}
                          {homeLocation
                            ? ` · ${driveHintKm(distanceKm(homeLocation, s))} from Home`
                            : ''}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="chip-btn"
                        onClick={() => setSites(removeDarkSite(s.id))}
                      >
                        ✕
                      </button>
                    </li>
                  )
                })}
              </ul>
              {location && (
                <Link
                  className="chip-btn sg-radar-link"
                  to={`/radar?lat=${location.latitude.toFixed(4)}&lon=${location.longitude.toFixed(4)}&name=${encodeURIComponent(location.name)}`}
                >
                  📡 Live radar / clouds
                </Link>
              )}
            </section>

            {weather && (
              <section className="panel sg-hours-panel" aria-label="Clear sky chart">
                <div className="panel-header">
                  <h2>Clear sky chart</h2>
                  <span className="panel-hint">Cloud · transparency · seeing · dark</span>
                </div>
                <ClearSkyChart hours={shown.hours} />
              </section>
            )}

            {weather && (
              <section className="panel sg-hours-panel" aria-label="Hourly sky">
                <div className="panel-header">
                  <h2>Hourly score strip</h2>
                  <span className="panel-hint">Higher = better</span>
                </div>
                <HourStrip hours={shown.hours} />
              </section>
            )}

            {shown.bestNightsMonth.length > 0 && (
              <section className="panel" aria-label="Best nights">
                <div className="panel-header">
                  <h2>Best nights ahead</h2>
                </div>
                <ol className="sg-best-nights">
                  {shown.bestNightsMonth.map((n, i) => (
                    <li key={n.dateKey}>
                      <span className="sg-bn-rank">#{i + 1}</span>
                      <strong>{n.label}</strong>
                      <span>
                        {n.score}/100 · ☁️{n.cloudAvg}% · 🌙{n.moonIllum}%
                      </span>
                    </li>
                  ))}
                </ol>
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
