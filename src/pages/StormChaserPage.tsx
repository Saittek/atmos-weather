import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useWeather } from '../hooks/useWeather'
import { useThreatProximity } from '../hooks/useThreatProximity'
import { Alerts } from '../components/Alerts'
import { SearchBar } from '../components/SearchBar'
import { Sounding } from '../components/Sounding'
import { SpcMdPanel } from '../components/SpcMdPanel'
import { ThreatBanner } from '../components/ThreatBanner'
import { Tropical } from '../components/Tropical'
import { UnitToggle } from '../components/UnitToggle'
import type { MapFocusRequest } from '../components/SevereMapLayers'
import { fetchStormEnv, shareChaseUrl, type StormEnvSnapshot } from '../api/weather'
import type { LocationResult } from '../api/types'
import type { NearbyThreat } from '../api/severeLayers'
import { formatPrecip, formatSpeed, formatTemp } from '../utils/format'
import {
  buildStormChaserBrief,
  type HazardCard,
  type HazardLevel,
  type StormTimelineSlot,
} from '../utils/stormChaser'
import { shareBriefingCard } from '../utils/shareBriefingCard'
import { filterActiveAlerts } from '../utils/activeAlerts'

const RadarMap = lazy(() =>
  import('../components/RadarMap').then((m) => ({ default: m.RadarMap })),
)

function levelClass(l: HazardLevel): string {
  return `chaser-level-${l}`
}

function HazardTile({ card, compact }: { card: HazardCard; compact?: boolean }) {
  return (
    <article className={`chaser-hazard ${levelClass(card.level)}${compact ? ' compact' : ''}`}>
      <div className="chaser-hazard-top">
        <span className="chaser-hazard-emoji" aria-hidden>
          {card.emoji}
        </span>
        <div>
          <h3>{card.label}</h3>
          <span className="chaser-level-pill">{card.level}</span>
        </div>
      </div>
      <p className="chaser-hazard-summary">{card.summary}</p>
      {!compact && (
        <ul className="chaser-factor-list">
          {card.factors.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      {compact && card.factors[0] && (
        <p className="chaser-hazard-one-factor">{card.factors[0]}</p>
      )}
      <div className="chaser-score-bar" aria-hidden>
        <div className="chaser-score-fill" style={{ width: `${card.score * 10}%` }} />
      </div>
    </article>
  )
}

function StormTimeline({ slots }: { slots: StormTimelineSlot[] }) {
  if (!slots.length) {
    return <p className="muted-center chaser-timeline-empty">No hourly storm signal in the next 12 hours.</p>
  }
  return (
    <ol className="chaser-timeline" aria-label="Storm activity next 12 hours">
      {slots.map((s) => (
        <li key={s.time} className={`chaser-tl-slot ${levelClass(s.level)}`}>
          <span className="chaser-tl-when">{s.label}</span>
          <div className="chaser-tl-bar-wrap" aria-hidden>
            <div
              className="chaser-tl-bar"
              style={{ height: `${Math.max(12, s.activity * 10)}%` }}
            />
          </div>
          <span className="chaser-tl-note" title={s.note}>
            {s.thunder ? '⚡ ' : ''}
            {s.note}
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * Storm chaser desk — severe hazards, CAPE, radar-first, official links.
 * Route: /chase?lat=&lon=&name=
 */
export default function StormChaserPage() {
  const [params, setSearchParams] = useSearchParams()
  const {
    location,
    weather,
    profile,
    alerts,
    storms,
    units,
    loading,
    refreshing,
    loadForLocation,
    requestMyLocation,
    geoLoading,
    setUnits,
    refresh,
    stormMode,
    setStormMode,
    homeLocation,
    goHome,
  } = useWeather()

  const [stormEnv, setStormEnv] = useState<StormEnvSnapshot | null>(null)
  const [envLoading, setEnvLoading] = useState(false)
  const [shareMsg, setShareMsg] = useState<string | null>(null)
  const [focusRequest, setFocusRequest] = useState<MapFocusRequest | null>(null)
  const focusTokenRef = useRef(0)
  /** Capture desk-entry preference so leaving /chase does not force storm mode off forever */
  const stormModeBeforeChase = useRef(stormMode)

  // Storm mode only while on this desk — restore previous preference on leave
  useEffect(() => {
    stormModeBeforeChase.current = stormMode
    setStormMode(true)
    return () => setStormMode(stormModeBeforeChase.current)
    // intentionally once on mount/unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setStormMode])

  const threat = useThreatProximity(location?.latitude, location?.longitude, {
    enabled: true,
    maxKm: 80,
  })

  // If opened with coords different from current weather location, load that place
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
      admin1: params.get('region') || undefined,
      country: params.get('country') || undefined,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qLat, qLon, qName])

  // CAPE / CIN / LI for active location
  useEffect(() => {
    if (!location) {
      setStormEnv(null)
      return
    }
    let cancelled = false
    setEnvLoading(true)
    void fetchStormEnv(location.latitude, location.longitude)
      .then((env) => {
        if (!cancelled) setStormEnv(env)
      })
      .finally(() => {
        if (!cancelled) setEnvLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [location?.latitude, location?.longitude, weather?.current?.time])

  const place = location
  const activeAlerts = useMemo(() => filterActiveAlerts(alerts), [alerts])
  const severeAlerts = useMemo(
    () =>
      activeAlerts.filter((a) =>
        ['Extreme', 'Severe', 'Moderate'].includes(a.severity),
      ),
    [activeAlerts],
  )

  const brief = useMemo(() => {
    if (!weather) return null
    return buildStormChaserBrief(
      weather,
      profile,
      activeAlerts,
      units,
      stormEnv,
      place?.name ?? 'this location',
    )
  }, [weather, profile, activeAlerts, units, stormEnv, place?.name])

  const homeLink = place
    ? `/?lat=${place.latitude.toFixed(4)}&lon=${place.longitude.toFixed(4)}&name=${encodeURIComponent(place.name)}`
    : '/'
  const radarLink = place
    ? `/radar?lat=${place.latitude.toFixed(4)}&lon=${place.longitude.toFixed(4)}&name=${encodeURIComponent(place.name)}`
    : '/radar'

  const nwsPoint =
    place &&
    `https://forecast.weather.gov/MapClick.php?lat=${place.latitude.toFixed(4)}&lon=${place.longitude.toFixed(4)}`
  const spcMeso =
    place &&
    `https://www.spc.noaa.gov/exper/mesoanalysis/new/viewsector.php?sector=19&lat=${place.latitude.toFixed(2)}&lon=${place.longitude.toFixed(2)}`

  const onSelect = useCallback(
    (loc: LocationResult) => {
      void loadForLocation(loc)
      setSearchParams(
        {
          lat: loc.latitude.toFixed(4),
          lon: loc.longitude.toFixed(4),
          name: loc.name,
          ...(loc.admin1 ? { region: loc.admin1 } : {}),
          ...(loc.country ? { country: loc.country } : {}),
        },
        { replace: true },
      )
    },
    [loadForLocation, setSearchParams],
  )

  const openStorm = (lat: number, lon: number, name: string) => {
    onSelect({ id: Date.now(), name, latitude: lat, longitude: lon })
  }

  const onShare = async () => {
    if (!place || !brief) return
    const url = shareChaseUrl(place)
    const text = `${brief.shareText}\n${url}`
    const result = await shareBriefingCard({
      placeName: place.name,
      brief,
      tempLabel: weather ? formatTemp(weather.current.temperature_2m, units) : '',
      url,
      text,
    })
    if (result === 'shared') setShareMsg('Shared card')
    else if (result === 'downloaded') setShareMsg('Card saved')
    else {
      try {
        await navigator.clipboard.writeText(text)
        setShareMsg('Briefing copied')
      } catch {
        setShareMsg('Could not share')
      }
    }
    window.setTimeout(() => setShareMsg(null), 2200)
  }

  const onJumpThreat = useCallback((t: NearbyThreat) => {
    const c = t.centroid
    if (!c) return
    focusTokenRef.current += 1
    setFocusRequest({
      lat: c.lat,
      lon: c.lon,
      zoom: t.inside || t.distanceKm < 25 ? 8 : 7,
      token: focusTokenRef.current,
    })
    document.getElementById('chaser-radar')?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [])

  const onRefresh = () => {
    refresh()
    threat.refresh()
    if (place) {
      setEnvLoading(true)
      void fetchStormEnv(place.latitude, place.longitude)
        .then(setStormEnv)
        .finally(() => setEnvLoading(false))
    }
  }

  return (
    <div className="chaser-page app" data-theme-active="dark" data-storm-mode="true">
      <header className="chaser-topbar">
        <Link to={homeLink} className="chip-btn">
          ← Solara
        </Link>
        <div className="chaser-brand">
          <strong>🌪 Storm Chasers</strong>
          <span>{place?.name || 'Search a location to begin'}</span>
        </div>
        <div className="chaser-top-actions">
          {homeLocation && (
            <button
              type="button"
              className="chip-btn"
              title={`Go home · ${homeLocation.name || 'Home'}`}
              onClick={() => goHome()}
            >
              🏠
            </button>
          )}
          <UnitToggle units={units} onChange={setUnits} />
          <button
            type="button"
            className="chip-btn"
            onClick={onRefresh}
            disabled={refreshing || envLoading}
            title="Refresh weather + CAPE"
          >
            {refreshing || envLoading ? '…' : '↻'}
          </button>
          <button type="button" className="chip-btn" onClick={() => void onShare()} disabled={!brief}>
            {shareMsg ?? 'Share'}
          </button>
          <Link to={radarLink} className="chip-btn">
            📡 Full
          </Link>
        </div>
      </header>

      <div className="chaser-search-row">
        <SearchBar
          onSelect={onSelect}
          onUseLocation={() => void requestMyLocation()}
          geoLoading={geoLoading}
        />
      </div>

      <p className="chaser-disclaimer">
        Decision support for awareness only — not a chase briefing. Always use{' '}
        <strong>NWS / ECCC alerts</strong> and <strong>SPC</strong> products. Never drive into a
        core or floodwater.
      </p>

      {place && (
        <ThreatBanner
          threats={threat.threats}
          loading={threat.loading}
          muted={threat.muted}
          onMute={threat.setMuted}
          onJump={onJumpThreat}
          onRefresh={() => threat.refresh()}
        />
      )}

      {loading && !weather && (
        <div className="chaser-loading">
          <div className="spinner" />
          <span>Loading storm environment…</span>
        </div>
      )}

      {!location && !loading && (
        <div className="empty-state">
          <h1>Pick a location</h1>
          <p className="empty-lead">Search above or use your location to open the storm desk.</p>
        </div>
      )}

      {weather && place && brief && (
        <main className="chaser-main">
          {/* Radar first on mobile via CSS order */}
          <section className="chaser-section chaser-radar-wrap chaser-order-radar">
            <div className="chaser-section-head">
              <h2>Live radar</h2>
              <Link to={radarLink} className="chip-btn">
                Expand
              </Link>
            </div>
            <Suspense
              fallback={
                <div className="map-chunk-fallback">
                  <div className="spinner" />
                  <span>Loading radar…</span>
                </div>
              }
            >
              <RadarMap
                lat={place.latitude}
                lon={place.longitude}
                placeName={place.name}
                units={units}
                severeMode
                chaserOverlays
                mapId="chaser-radar"
                pageMode={false}
                focusRequest={focusRequest}
                threatPolygons={threat.warnings}
                homeLocation={homeLocation}
              />
            </Suspense>
          </section>

          <section className={`chaser-overall ${levelClass(brief.overall.level)} chaser-order-summary`}>
            <div>
              <p className="chaser-kicker">Environment</p>
              <h1>
                {brief.overall.emoji} {brief.overall.summary}
              </h1>
              <p className="chaser-meta">
                Peak gusts {formatSpeed(brief.peaks.gustKmh, units)}
                {brief.peaks.thunderLikely
                  ? ` · Thunder possible${brief.peaks.nextStormLabel ? ` ~${brief.peaks.nextStormLabel}` : ''}`
                  : ' · Limited thunder signal'}
                {` · PoP max ${Math.round(brief.peaks.pop)}%`}
                {brief.atmosphere.capePeak != null
                  ? ` · CAPE peak ${Math.round(brief.atmosphere.capePeak)} J/kg`
                  : ''}
              </p>
            </div>
            <div className="chaser-now-temp">
              <span className="chaser-now-big">
                {formatTemp(weather.current.temperature_2m, units)}
              </span>
              <span>Now · gusts {formatSpeed(weather.current.wind_gusts_10m, units)}</span>
            </div>
          </section>

          <div className="chaser-hazard-grid chaser-order-hazards">
            <HazardTile card={brief.tornado} compact />
            <HazardTile card={brief.hail} compact />
            <HazardTile card={brief.wind} compact />
            <HazardTile card={brief.flood} compact />
          </div>

          <section className="chaser-section chaser-order-timeline">
            <div className="chaser-section-head">
              <h2>Storm timeline</h2>
              <span className="panel-hint">Next ~12 hours</span>
            </div>
            <StormTimeline slots={brief.timeline} />
          </section>

          {severeAlerts.length > 0 && (
            <section className="chaser-section chaser-order-alerts">
              <h2>Active alerts</h2>
              <Alerts alerts={severeAlerts} />
            </section>
          )}

          <div className="chaser-two-col chaser-order-atmos">
            <section className="panel chaser-atmos">
              <div className="panel-header">
                <h2>Atmosphere</h2>
                <span className="panel-hint">CAPE · CIN · LI · sounding</span>
              </div>
              <p className="chaser-atmos-note">{brief.atmosphere.note}</p>
              <dl className="chaser-stat-grid chaser-stat-grid-3">
                <div>
                  <dt>CAPE (now / peak)</dt>
                  <dd>
                    {brief.atmosphere.cape != null
                      ? `${Math.round(brief.atmosphere.cape)}`
                      : '—'}
                    {brief.atmosphere.capePeak != null &&
                    brief.atmosphere.capePeak !== brief.atmosphere.cape
                      ? ` / ${Math.round(brief.atmosphere.capePeak)}`
                      : ''}
                    <span className="chaser-unit"> J/kg</span>
                  </dd>
                </div>
                <div>
                  <dt>CIN</dt>
                  <dd>
                    {brief.atmosphere.cin != null
                      ? Math.round(brief.atmosphere.cin)
                      : '—'}
                    <span className="chaser-unit"> J/kg</span>
                  </dd>
                </div>
                <div>
                  <dt>Lifted index</dt>
                  <dd>
                    {brief.atmosphere.liftedIndex != null
                      ? brief.atmosphere.liftedIndex.toFixed(1)
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>850–500 lapse</dt>
                  <dd>
                    {brief.atmosphere.lapse850_500 != null
                      ? `${brief.atmosphere.lapse850_500.toFixed(1)} °C`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Shear proxy</dt>
                  <dd>
                    {brief.atmosphere.shearProxy != null
                      ? formatSpeed(brief.atmosphere.shearProxy, units)
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>12h precip</dt>
                  <dd>{formatPrecip(brief.peaks.precip12hMm, units)}</dd>
                </div>
              </dl>
              <Sounding profile={profile} units={units} timezone={weather.timezone} />
            </section>

            <div className="chaser-side-stack">
              <section className="panel chaser-checklist">
                <div className="panel-header">
                  <h2>Chase checklist</h2>
                </div>
                <ul className="chaser-check-list">
                  {brief.watchList.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <div className="chaser-links">
                  <a
                    className="primary-btn chaser-link-btn"
                    href="https://www.spc.noaa.gov/products/outlook/day1otlk.html"
                    target="_blank"
                    rel="noreferrer"
                  >
                    SPC Day 1 outlook
                  </a>
                  <a
                    className="chip-btn"
                    href="https://www.spc.noaa.gov/products/md/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Mesoscale discussions
                  </a>
                  <a
                    className="chip-btn"
                    href={spcMeso || 'https://www.spc.noaa.gov/exper/mesoanalysis/'}
                    target="_blank"
                    rel="noreferrer"
                  >
                    SPC mesoanalysis
                  </a>
                  {nwsPoint && (
                    <a className="chip-btn" href={nwsPoint} target="_blank" rel="noreferrer">
                      NWS point forecast
                    </a>
                  )}
                  <a
                    className="chip-btn"
                    href="https://radar.weather.gov/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    NWS radar
                  </a>
                  <a
                    className="chip-btn"
                    href="https://www.weather.gc.ca/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    ECCC weather
                  </a>
                </div>
              </section>
              <SpcMdPanel />
            </div>
          </div>

          {storms.length > 0 && (
            <section className="chaser-section chaser-order-tropical">
              <Tropical storms={storms} onFocus={openStorm} />
            </section>
          )}
        </main>
      )}
    </div>
  )
}
