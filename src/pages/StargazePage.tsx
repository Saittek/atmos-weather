/**
 * Stargazing / astrophotography desk — sky score, moon, dark hours, hourly strip.
 * Route: /stargaze?lat=&lon=&name=
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useWeather } from '../hooks/useWeather'
import { SearchBar } from '../components/SearchBar'
import { UnitToggle } from '../components/UnitToggle'
import { MoonPhaseIcon } from '../components/MoonPhaseIcon'
import type { LocationResult } from '../api/types'
import { formatSpeed, formatTime } from '../utils/format'
import {
  buildStargazeBrief,
  gradeLabel,
  type StargazeGrade,
  type StargazeHour,
} from '../utils/stargaze'

function gradeClass(g: StargazeGrade): string {
  return `sg-grade-${g}`
}

function HourStrip({ hours }: { hours: StargazeHour[] }) {
  const night = hours.filter((h) => h.isNight)
  const show = night.length >= 4 ? night : hours.slice(0, 24)
  if (!show.length) {
    return <p className="muted-center">No hourly sky data yet.</p>
  }
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

export default function StargazePage() {
  const [params, setSearchParams] = useSearchParams()
  const {
    location,
    weather,
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

  const brief = useMemo(
    () => (weather ? buildStargazeBrief(weather) : null),
    [weather],
  )

  const onSelect = (loc: LocationResult) => {
    void loadForLocation(loc)
    setSearchParams({
      lat: loc.latitude.toFixed(4),
      lon: loc.longitude.toFixed(4),
      name: loc.name,
    })
  }

  const share = async () => {
    if (!location) return
    const url = new URL(window.location.origin + '/stargaze')
    url.searchParams.set('lat', location.latitude.toFixed(4))
    url.searchParams.set('lon', location.longitude.toFixed(4))
    url.searchParams.set('name', location.name)
    const text =
      brief != null
        ? `Stargazing · ${location.name}: tonight ${brief.tonightScore}/100 (${gradeLabel(brief.tonightGrade)}). ${brief.moon.emoji} ${brief.moon.name}.`
        : `Stargazing forecast · ${location.name}`
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: `Solara · Stargaze`, text, url: url.toString() })
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

  const tz = weather?.timezone
  const placeName = location?.name || 'Choose a place'

  return (
    <div className="sg-page app" data-page="stargaze">
      <header className="sg-topbar">
        <div className="sg-topbar-row">
          <Link to="/" className="chip-btn" title="Dashboard">
            ← Solara
          </Link>
          <h1 className="sg-title">
            <span aria-hidden>✨</span> Stargaze
          </h1>
          <div className="sg-top-actions">
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
        {(loading || !weather) && !brief && (
          <div className="sg-loading" role="status">
            <div className="spinner large" />
            <p>Loading sky forecast…</p>
          </div>
        )}

        {brief && weather && location && (
          <>
            <section className={`panel sg-hero ${gradeClass(brief.tonightGrade)}`}>
              <p className="sg-kicker">Tonight at {placeName}</p>
              <div className="sg-hero-grid">
                <div className="sg-score-block">
                  <p className="sg-score-label">Tonight score</p>
                  <p className="sg-score-big" aria-label={`Tonight score ${brief.tonightScore}`}>
                    {brief.tonightScore}
                    <span className="sg-score-max">/100</span>
                  </p>
                  <p className={`sg-grade-pill ${gradeClass(brief.tonightGrade)}`}>
                    {gradeLabel(brief.tonightGrade)}
                  </p>
                </div>
                <div className="sg-score-block secondary">
                  <p className="sg-score-label">Right now</p>
                  <p className="sg-score-mid">
                    {brief.nowGrade === 'daylight' ? '—' : brief.nowScore}
                    {brief.nowGrade !== 'daylight' && <span className="sg-score-max">/100</span>}
                  </p>
                  <p className={`sg-grade-pill ${gradeClass(brief.nowGrade)}`}>
                    {gradeLabel(brief.nowGrade)}
                  </p>
                </div>
                <div className="sg-moon-block">
                  <MoonPhaseIcon phase={brief.moon.phase} size={64} />
                  <div>
                    <p className="sg-moon-name">
                      {brief.moon.emoji} {brief.moon.name}
                    </p>
                    <p className="sg-moon-illum">{brief.moon.illumination}% illuminated</p>
                  </div>
                </div>
              </div>
              <p className="sg-summary">{brief.summary}</p>
              {brief.bestWindow && (
                <p className="sg-best-window">
                  <strong>Best window</strong> · {brief.bestWindow.startLabel} –{' '}
                  {brief.bestWindow.endLabel}
                  <span className="sg-best-score"> · avg {brief.bestWindow.avgScore}</span>
                </p>
              )}
              <div className="sg-hero-actions">
                <button type="button" className="primary-btn" onClick={() => void share()}>
                  Share night
                </button>
                {shareMsg && <span className="sg-share-msg">{shareMsg}</span>}
              </div>
            </section>

            <section className="panel sg-factors" aria-label="Sky factors">
              <div className="panel-header">
                <h2>Now · sky factors</h2>
              </div>
              <ul className="sg-factor-grid">
                {brief.factors.map((f) => (
                  <li key={f.label} className={`sg-factor tone-${f.tone}`}>
                    <span className="sg-factor-label">{f.label}</span>
                    <span className="sg-factor-value">{f.value}</span>
                  </li>
                ))}
                <li className="sg-factor tone-ok">
                  <span className="sg-factor-label">Wind (display)</span>
                  <span className="sg-factor-value">
                    {formatSpeed(weather.current.wind_speed_10m, units)}
                  </span>
                </li>
              </ul>
            </section>

            <section className="panel sg-darkness" aria-label="Darkness">
              <div className="panel-header">
                <h2>Darkness</h2>
                <span className="panel-hint">Astronomical dark ≈ sunset + 80 min</span>
              </div>
              <div className="sg-dark-grid">
                <div>
                  <span className="label">Sunset</span>
                  <span className="value">
                    {brief.sunset ? formatTime(brief.sunset, tz) : '—'}
                  </span>
                </div>
                <div>
                  <span className="label">Dark from</span>
                  <span className="value">{brief.darkStartLabel ?? '—'}</span>
                </div>
                <div>
                  <span className="label">Dark until</span>
                  <span className="value">{brief.darkEndLabel ?? '—'}</span>
                </div>
                <div>
                  <span className="label">Sunrise</span>
                  <span className="value">
                    {brief.sunrise ? formatTime(brief.sunrise, tz) : '—'}
                  </span>
                </div>
              </div>
            </section>

            <section className="panel sg-hours-panel" aria-label="Hourly sky">
              <div className="panel-header">
                <h2>Hourly sky quality</h2>
                <span className="panel-hint">Higher bar = better · night hours</span>
              </div>
              <HourStrip hours={brief.hours} />
            </section>

            <section className="panel sg-tips" aria-label="Tips">
              <div className="panel-header">
                <h2>Planner tips</h2>
              </div>
              <ul className="sg-tip-list">
                {brief.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <p className="sg-footnote muted-center">
                Score uses clouds, humidity, wind, precip, visibility, and moon. Light pollution
                is not modeled yet — darker sites still win.
              </p>
            </section>

            <nav className="sg-footer-nav" aria-label="More Solara">
              <Link
                to={`/?lat=${location.latitude.toFixed(4)}&lon=${location.longitude.toFixed(4)}&name=${encodeURIComponent(location.name)}`}
                className="chip-btn"
              >
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

        {!loading && !weather && (
          <div className="panel sg-empty">
            <h2>Pick a place to plan the night</h2>
            <p>Search above or use Near me / Home. We’ll score clouds, moon, and dark hours.</p>
          </div>
        )}
      </main>
    </div>
  )
}
