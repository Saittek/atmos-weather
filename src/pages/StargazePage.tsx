/**
 * Stargazing / astrophotography desk — full planner.
 * Route: /stargaze?lat=&lon=&name=
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useWeather, sameExactPlace } from '../hooks/useWeather'
import { SearchBar } from '../components/SearchBar'
import { UnitToggle } from '../components/UnitToggle'
import { MoonPhaseIcon } from '../components/MoonPhaseIcon'
import { ClearSkyChart } from '../components/ClearSkyChart'
import type { LocationResult } from '../api/types'
import {
  fetchIssPassesDetailed,
  fetchKpIndex,
  type IssSnapshot,
} from '../api/skyExtras'
import {
  fetchCloudModelAgreement,
  type CloudAgreement,
} from '../api/cloudModels'
import { formatSpeed, formatTime } from '../utils/format'
import { useI18n } from '../i18n/I18nProvider'
import {
  buildStargazeBrief,
  cacheStargazeBrief,
  gradeLabel,
  loadCachedStargazeBrief,
  type GoNoGo,
  type StargazeGrade,
} from '../utils/stargaze'
import { lookupBortleAt, preloadBortleGrid } from '../utils/bortleLookup'
import { moonGeometry } from '../utils/moonTimes'
import { brightPlanetsTonight } from '../utils/planetVisibility'
import { upcomingSkyEvents } from '../utils/skyEvents'
import { targetAltitudes } from '../utils/targetAltitude'
import {
  addDarkSite,
  distanceKm,
  driveHintKm,
  loadDarkSites,
  removeDarkSite,
  type DarkSite,
} from '../utils/darkSites'

const StargazeCloudMap = lazy(() =>
  import('../components/StargazeCloudMap').then((m) => ({ default: m.StargazeCloudMap })),
)
const StargazeBortleMap = lazy(() =>
  import('../components/StargazeBortleMap').then((m) => ({ default: m.StargazeBortleMap })),
)

const RED_KEY = 'solara-stargaze-red-v1'

function gradeClass(g: StargazeGrade): string {
  return `sg-grade-${g}`
}

function goClass(g: GoNoGo): string {
  return `sg-go-${g}`
}

function loadRed(): boolean {
  try {
    return localStorage.getItem(RED_KEY) === '1'
  } catch {
    return false
  }
}

export default function StargazePage() {
  const { te } = useI18n()
  const [params, setSearchParams] = useSearchParams()
  const {
    location,
    weather,
    air,
    units,
    loading,
    refreshing,
    error,
    clearError,
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
  const [kpStatus, setKpStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [iss, setIss] = useState<IssSnapshot | null>(null)
  const [issStatus, setIssStatus] = useState<'loading' | 'ok' | 'empty' | 'error' | 'unavailable'>(
    'loading',
  )
  const [issMsg, setIssMsg] = useState<string | null>(null)
  const [compareOn, setCompareOn] = useState(false)
  const [homeWeatherScore, setHomeWeatherScore] = useState<number | null>(null)
  const [homeCompareNote, setHomeCompareNote] = useState<string | null>(null)
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null)
  const [sites, setSites] = useState<DarkSite[]>(() => loadDarkSites())
  const [bortleClass, setBortleClass] = useState<number | null>(null)
  const [bortleSource, setBortleSource] = useState<'viirs' | 'estimate'>('estimate')
  const [cloudAgree, setCloudAgree] = useState<CloudAgreement | null>(null)

  const qLat = parseFloat(params.get('lat') ?? '')
  const qLon = parseFloat(params.get('lon') ?? '')
  const qName = params.get('name') || ''

  useEffect(() => {
    preloadBortleGrid()
  }, [])

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
    setKpStatus('loading')
    void fetchKpIndex().then((k) => {
      if (cancelled) return
      if (k) {
        setKp(k.kp)
        setKpStatus('ok')
      } else {
        setKp(null)
        setKpStatus('error')
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!location) return
    let cancelled = false
    setIssStatus('loading')
    setIssMsg(null)
    void fetchIssPassesDetailed(location.latitude, location.longitude).then((r) => {
      if (cancelled) return
      if (r.status === 'ok' || r.status === 'empty') {
        setIss(r.data)
        setIssStatus(r.status)
        setIssMsg(null)
      } else {
        setIss(null)
        setIssStatus(r.status)
        setIssMsg(r.message)
      }
    })
    void lookupBortleAt(location.latitude, location.longitude).then((c) => {
      if (cancelled) return
      setBortleClass(c)
      setBortleSource('viirs')
    })
    void fetchCloudModelAgreement(location.latitude, location.longitude).then((a) => {
      if (!cancelled) setCloudAgree(a)
    })
    return () => {
      cancelled = true
    }
  }, [location?.latitude, location?.longitude])

  const { brief, briefError } = useMemo(() => {
    if (!weather || !location) return { brief: null, briefError: null as string | null }
    try {
      const b = buildStargazeBrief(weather, {
        lat: location.latitude,
        lon: location.longitude,
        air,
        auroraKp: kp,
        bortleClass,
        bortleSource,
      })
      return { brief: b, briefError: null }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not build sky forecast'
      console.error('[Stargaze] brief failed', e)
      return { brief: null, briefError: msg }
    }
  }, [weather, location, air, kp, bortleClass, bortleSource])

  useEffect(() => {
    if (!brief || !location) return
    const key = `${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}`
    cacheStargazeBrief(key, brief)
  }, [brief, location])

  // Offline fallback (normalize older cache shapes)
  const offlineBrief = useMemo(() => {
    if (brief || !location) return null
    const key = `${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}`
    const raw = loadCachedStargazeBrief(key)
    if (!raw) return null
    return {
      ...raw,
      visualScore: raw.visualScore ?? raw.imagingScore ?? raw.tonightScore ?? 0,
      visualGrade: raw.visualGrade ?? raw.imagingGrade ?? raw.tonightGrade ?? 'fair',
      imagingScore: raw.imagingScore ?? raw.tonightScore ?? 0,
      imagingGrade: raw.imagingGrade ?? raw.tonightGrade ?? 'fair',
      sqm: raw.sqm ?? { sqm: 20, label: '—', mcd: 0 },
      hours: Array.isArray(raw.hours) ? raw.hours : [],
      nights: Array.isArray(raw.nights) ? raw.nights : [],
      bestNightsMonth: Array.isArray(raw.bestNightsMonth) ? raw.bestNightsMonth : [],
      targets: Array.isArray(raw.targets) ? raw.targets : [],
      tips: Array.isArray(raw.tips) ? raw.tips : [],
      factors: Array.isArray(raw.factors) ? raw.factors : [],
      go: raw.go ?? 'maybe',
      goLabel: raw.goLabel ?? 'Sky check',
      goDetail: raw.goDetail ?? '',
      summary: raw.summary ?? '',
      bortle: raw.bortle ?? {
        class: 5,
        label: 'Bortle ~5',
        sky: '',
        tone: 'ok' as const,
        detail: '',
      },
      seeingLabel: raw.seeingLabel ?? '—',
      dewLabel: raw.dewLabel ?? '—',
      moon: raw.moon ?? { phase: 0, name: 'Moon', emoji: '🌑', illumination: 0 },
    }
  }, [brief, location])

  const shown = brief ?? offlineBrief

  // Compare home vs current — darkness/Bortle at home coords; same cloud model (not dual-fetch)
  useEffect(() => {
    if (!compareOn || !homeLocation || !weather || !location) {
      setHomeWeatherScore(null)
      setHomeCompareNote(null)
      return
    }
    if (sameExactPlace(location, homeLocation)) {
      setHomeWeatherScore(shown?.imagingScore ?? null)
      setHomeCompareNote(null)
      return
    }
    const homeBrief = buildStargazeBrief(weather, {
      lat: homeLocation.latitude,
      lon: homeLocation.longitude,
      air,
      auroraKp: kp,
    })
    setHomeWeatherScore(homeBrief.imagingScore)
    setHomeCompareNote(
      'Darkness / Bortle at home only — cloud & humidity still use weather for this place.',
    )
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

  const altitudes = useMemo(() => {
    if (!location) return []
    return targetAltitudes(location.latitude, location.longitude)
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
          <Link to="/" className="chip-btn" title={te('common.dashboard')}>
            ← Solara
          </Link>
          <h1 className="sg-title">
            <span aria-hidden>✨</span> {te('sg.title')}
          </h1>
          <div className="sg-top-actions">
            <button
              type="button"
              className={`chip-btn${redMode ? ' on' : ''}`}
              onClick={toggleRed}
              title={te('sg.redTitle')}
            >
              {te('sg.red')}
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
        {error && (
          <div className="panel sg-error" role="alert">
            <p>
              <strong>{te('sg.loadFail')}</strong> {error}
            </p>
            <div className="sg-hero-actions">
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  clearError()
                  refresh()
                }}
              >
                {te('sg.retry')}
              </button>
              <button type="button" className="chip-btn" onClick={() => void requestMyLocation()}>
                {te('sg.useLoc')}
              </button>
            </div>
          </div>
        )}

        {briefError && weather && (
          <div className="panel sg-error" role="alert">
            <p>
              <strong>{te('sg.briefFail')}</strong> {briefError}
            </p>
            <button type="button" className="chip-btn" onClick={() => refresh()}>
              {te('sg.reload')}
            </button>
          </div>
        )}

        {(loading || (!weather && !shown && !error)) && (
          <div className="sg-loading" role="status">
            <div className="spinner large" />
            <p>{te('sg.loading')}</p>
          </div>
        )}

        {shown && location && (
          <>
            {!brief && offlineBrief && (
              <p className="sg-offline-banner" role="status">
                {te('sg.offline')}
              </p>
            )}

            {/* Go / no-go */}
            <section className={`panel sg-gono ${goClass(shown.go)}`} aria-label={te('sg.gono')}>
              <p className="sg-gono-label">{shown.goLabel}</p>
              <p className="sg-gono-detail">{shown.goDetail}</p>
            </section>

            <section className={`panel sg-hero ${gradeClass(shown.imagingGrade)}`}>
              <p className="sg-kicker">{te('sg.tonightAt', { place: placeName })}</p>
              <div className="sg-hero-grid">
                <div className="sg-score-block">
                  <p className="sg-score-label">{te('sg.imaging')}</p>
                  <p className="sg-score-big">
                    {shown.imagingScore}
                    <span className="sg-score-max">/100</span>
                  </p>
                  <p className={`sg-grade-pill ${gradeClass(shown.imagingGrade)}`}>
                    {gradeLabel(shown.imagingGrade)}
                  </p>
                </div>
                <div className="sg-score-block secondary">
                  <p className="sg-score-label">{te('sg.visual')}</p>
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
                    <p className="sg-moon-illum">
                      {te('sg.illuminated', { n: shown.moon.illumination })}
                    </p>
                    {moonGeo && (
                      <p className="sg-moon-illum">
                        ↑ {fmtMs(moonGeo.riseMs)} · transit {fmtMs(moonGeo.transitMs)}
                        {moonGeo.transitAlt != null ? ` (${moonGeo.transitAlt}°)` : ''} · ↓{' '}
                        {fmtMs(moonGeo.setMs)}
                        {moonGeo.upNow ? te('sg.upNow') : ''}
                      </p>
                    )}
                    <p className="sg-moon-illum">{shown.sqm?.label ?? '—'}</p>
                  </div>
                </div>
              </div>
              <p className="sg-summary">{shown.summary}</p>
              {shown.bestWindow && (
                <p className="sg-best-window">
                  <strong>{te('sg.bestWindow')}</strong> · {shown.bestWindow.startLabel} –{' '}
                  {shown.bestWindow.endLabel}
                  <span className="sg-best-score">
                    {te('sg.avg', { n: shown.bestWindow.avgScore })}
                  </span>
                </p>
              )}
              <div className="sg-hero-actions">
                <button type="button" className="primary-btn" onClick={() => void share()}>
                  {te('sg.shareNight')}
                </button>
                <button type="button" className="chip-btn" onClick={() => void requestClearNotify()}>
                  {te('sg.notifyClear')}
                </button>
                {shareMsg && <span className="sg-share-msg">{shareMsg}</span>}
                {notifyMsg && <span className="sg-share-msg">{notifyMsg}</span>}
              </div>
              <p className="sg-footnote muted-center">{te('sg.notifyHint')}</p>
            </section>

            <section className="panel sg-factors" aria-label={te('sg.factors')}>
              <div className="panel-header">
                <h2>{te('sg.factors')}</h2>
              </div>
              <ul className="sg-factor-grid">
                {shown.factors.map((f) => (
                  <li key={f.label} className={`sg-factor tone-${f.tone}`}>
                    <span className="sg-factor-label">{f.label}</span>
                    <span className="sg-factor-value">{f.value}</span>
                  </li>
                ))}
                <li className="sg-factor tone-ok">
                  <span className="sg-factor-label">{te('common.wind')}</span>
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
              {kpStatus === 'error' && (
                <p className="muted-center sg-aurora">{te('sg.auroraUnavail')}</p>
              )}
              {shown.auroraLabel && (
                <p className={`sg-aurora${shown.auroraLikely ? ' hot' : ''}`}>
                  🌌 {shown.auroraLabel}
                  {shown.auroraLikely ? te('sg.auroraWatch') : ''}
                </p>
              )}
              {cloudAgree && (
                <div className="sg-model-agree">
                  <strong>{cloudAgree.label}</strong>
                  <p>{cloudAgree.detail}</p>
                  <ul className="sg-model-list">
                    {cloudAgree.models.map((m) => (
                      <li key={m.id}>
                        {m.label}:{' '}
                        {m.meanCloud != null ? `${m.meanCloud}% cloud` : m.error || '—'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {location && (
              <section className="panel" aria-label={te('sg.liveClouds')}>
                <div className="panel-header">
                  <h2>{te('sg.liveClouds')}</h2>
                  <span className="panel-hint">Is the hole real right now?</span>
                </div>
                <Suspense fallback={<p className="muted-center">Loading map…</p>}>
                  <StargazeCloudMap
                    lat={location.latitude}
                    lon={location.longitude}
                    placeName={location.name}
                  />
                </Suspense>
              </section>
            )}

            {location && (
              <section className="panel" aria-label={te('sg.lightMap')}>
                <div className="panel-header">
                  <h2>{te('sg.lightMap')}</h2>
                  <span className="panel-hint">Zoom &amp; pan · yellow pin</span>
                </div>
                <Suspense fallback={<p className="muted-center">Loading pollution map…</p>}>
                  <StargazeBortleMap
                    lat={location.latitude}
                    lon={location.longitude}
                    placeName={location.name}
                    bortleClass={shown.bortle?.class ?? bortleClass}
                  />
                </Suspense>
              </section>
            )}

            {/* 7-night strip */}
            {shown.nights.length > 0 && (
              <section className="panel" aria-label={te('sg.nextNights')}>
                <div className="panel-header">
                  <h2>{te('sg.nextNights')}</h2>
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

            <section className="panel sg-darkness" aria-label={te('sg.twilight')}>
              <div className="panel-header">
                <h2>{te('sg.twilight')}</h2>
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
            <section className="panel" aria-label={te('sg.planets')}>
              <div className="panel-header">
                <h2>{te('sg.planets')}</h2>
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
            <section className="panel" aria-label={te('sg.meteors')}>
              <div className="panel-header">
                <h2>{te('sg.meteors')}</h2>
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
            <section className="panel" aria-label={te('sg.annual')}>
              <div className="panel-header">
                <h2>{te('sg.annual')}</h2>
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
            <section className="panel" aria-label={te('sg.darkSites')}>
              <div className="panel-header">
                <h2>{te('sg.darkSites')}</h2>
                <button type="button" className="chip-btn" onClick={saveSite}>
                  {te('sg.saveSite')}
                </button>
              </div>
              {sites.length === 0 && (
                <p className="muted-center">{te('sg.pickLead')}</p>
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

            {shown.hours?.length > 0 && (
              <section className="panel sg-hours-panel" aria-label={te('sg.clearChart')}>
                <div className="panel-header">
                  <h2>{te('sg.clearChart')}</h2>
                  <span className="panel-hint">Tap an hour · blue is best</span>
                </div>
                <ClearSkyChart hours={shown.hours} />
              </section>
            )}

            {(shown.bestNightsMonth?.length ?? 0) > 0 && (
              <section className="panel" aria-label={te('sg.bestNights')}>
                <div className="panel-header">
                  <h2>{te('sg.bestNights')}</h2>
                </div>
                <ol className="sg-best-nights">
                  {(shown.bestNightsMonth ?? []).map((n, i) => (
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
                <h2>{te('sg.targets')}</h2>
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

            {altitudes.length > 0 && (
              <section className="panel" aria-label="Target altitude">
                <div className="panel-header">
                  <h2>{te('sg.altitude')}</h2>
                  <span className="panel-hint">When it climbs high enough</span>
                </div>
                <ul className="sg-alt-list">
                  {altitudes.map((t) => (
                    <li key={t.id} className={t.visible ? 'up' : 'down'}>
                      <span>
                        {t.emoji} {t.name}
                      </span>
                      <span className="sg-alt-bars" aria-hidden>
                        <i style={{ height: `${Math.max(4, Math.min(100, t.altNow + 10))}%` }} />
                      </span>
                      <span>{t.note}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Satellites */}
            <section className="panel" aria-label={te('sg.sats')}>
              <div className="panel-header">
                <h2>{te('sg.sats')}</h2>
                <span className="panel-hint">{te('sg.satsHint')}</span>
              </div>
              {issStatus === 'loading' && (
                <p className="muted-center">{te('sg.satsLoading')}</p>
              )}
              {(issStatus === 'error' || issStatus === 'unavailable') && (
                <p className="muted-center">{issMsg || te('sg.satsUnavailable')}</p>
              )}
              {issStatus === 'empty' && (
                <p className="muted-center">{te('sg.satsNone')}</p>
              )}
              {issStatus === 'ok' && iss && iss.passes.length > 0 && (
                <ul className="sg-iss-list">
                  {iss.passes.map((p) => (
                    <li key={`${p.name}-${p.maxMs}`}>
                      <strong>
                        {p.name || 'ISS'} ·{' '}
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
                {iss?.note || te('sg.satsNote')}
              </p>
            </section>

            {/* Compare home */}
            {homeLocation && (
              <section className="panel" aria-label={te('sg.homeVs')}>
                <div className="panel-header">
                  <h2>{te('sg.homeVs')}</h2>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => setCompareOn((v) => !v)}
                  >
                    {compareOn ? te('common.hide') : te('common.compare')}
                  </button>
                </div>
                {compareOn && (
                  <div className="sg-compare">
                    <div>
                      <span className="label">{te('sg.here', { name: location.name })}</span>
                      <span className="value">{shown.imagingScore}/100</span>
                    </div>
                    <div>
                      <span className="label">
                        {te('sg.home', {
                          name: homeLocation.name?.replace(/\s*\(Home\)\s*$/i, '') || '',
                        })}
                      </span>
                      <span className="value">
                        {homeWeatherScore != null ? `${homeWeatherScore}/100` : '—'}
                      </span>
                    </div>
                    <p className="sg-footnote">
                      {homeCompareNote || te('sg.compareNote')}
                    </p>
                  </div>
                )}
              </section>
            )}

            <section className="panel sg-tips" aria-label="Tips">
              <div className="panel-header">
                <h2>{te('sg.tips')}</h2>
              </div>
              <ul className="sg-tip-list">
                {shown.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>

            <nav className="sg-footer-nav" aria-label={te('sg.more')}>
              <Link to="/" className="chip-btn">
                {te('common.dashboard')}
              </Link>
              <Link
                to={`/radar?lat=${location.latitude.toFixed(4)}&lon=${location.longitude.toFixed(4)}&name=${encodeURIComponent(location.name)}`}
                className="chip-btn"
              >
                {te('radar.layerRadar')}
              </Link>
              <Link to="/globe" className="chip-btn">
                {te('globe.title')}
              </Link>
            </nav>
          </>
        )}

        {!loading && !weather && !shown && (
          <div className="panel sg-empty">
            <h2>{te('sg.pickPlace')}</h2>
            <p>{te('sg.pickLead')}</p>
            <div className="empty-actions" style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                className="primary-btn"
                onClick={() => void requestMyLocation()}
                disabled={geoLoading}
              >
                {te('sg.useLoc')}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
