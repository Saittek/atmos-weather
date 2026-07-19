import { lazy, Suspense, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useWeather } from '../hooks/useWeather'
import { Alerts } from '../components/Alerts'
import { Sounding } from '../components/Sounding'
import { Tropical } from '../components/Tropical'
import { formatSpeed, formatTemp } from '../utils/format'
import { buildStormChaserBrief, type HazardCard, type HazardLevel } from '../utils/stormChaser'
import { filterActiveAlerts } from '../utils/activeAlerts'

const RadarMap = lazy(() =>
  import('../components/RadarMap').then((m) => ({ default: m.RadarMap })),
)

function levelClass(l: HazardLevel): string {
  return `chaser-level-${l}`
}

function HazardTile({ card }: { card: HazardCard }) {
  return (
    <article className={`chaser-hazard ${levelClass(card.level)}`}>
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
      <ul className="chaser-factor-list">
        {card.factors.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <div className="chaser-score-bar" aria-hidden>
        <div className="chaser-score-fill" style={{ width: `${card.score * 10}%` }} />
      </div>
    </article>
  )
}

/**
 * Storm chaser desk — severe hazards, radar, atmosphere, official links.
 * Route: /chase?lat=&lon=&name=
 */
export default function StormChaserPage() {
  const [params] = useSearchParams()
  const {
    location,
    weather,
    profile,
    alerts,
    storms,
    units,
    loading,
    loadForLocation,
  } = useWeather()

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
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qLat, qLon, qName])

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
    return buildStormChaserBrief(weather, profile, activeAlerts, units)
  }, [weather, profile, activeAlerts, units])

  const homeLink = place
    ? `/?lat=${place.latitude.toFixed(4)}&lon=${place.longitude.toFixed(4)}&name=${encodeURIComponent(place.name)}`
    : '/'
  const radarLink = place
    ? `/radar?lat=${place.latitude.toFixed(4)}&lon=${place.longitude.toFixed(4)}&name=${encodeURIComponent(place.name)}`
    : '/radar'

  const openStorm = (lat: number, lon: number, name: string) => {
    void loadForLocation({ id: Date.now(), name, latitude: lat, longitude: lon })
  }

  return (
    <div className="chaser-page app" data-theme-active="dark">
      <header className="chaser-topbar">
        <Link to={homeLink} className="chip-btn">
          ← Solara
        </Link>
        <div className="chaser-brand">
          <strong>🌪 Storm Chasers</strong>
          <span>{place?.name || 'Select a location on the dashboard'}</span>
        </div>
        <div className="chaser-top-actions">
          <Link to={radarLink} className="chip-btn">
            📡 Full radar
          </Link>
        </div>
      </header>

      <p className="chaser-disclaimer">
        Decision support for awareness only — not a chase briefing. Always use{' '}
        <strong>NWS / ECCC alerts</strong> and <strong>SPC</strong> products. Never drive into a
        core or floodwater.
      </p>

      {loading && !weather && (
        <div className="chaser-loading">
          <div className="spinner" />
          <span>Loading storm environment…</span>
        </div>
      )}

      {!location && !loading && (
        <div className="empty-state">
          <h1>No location yet</h1>
          <p className="empty-lead">Open the dashboard and pick a place first.</p>
          <Link to="/" className="primary-btn">
            Go to forecast
          </Link>
        </div>
      )}

      {weather && place && brief && (
        <main className="chaser-main">
          <section className={`chaser-overall ${levelClass(brief.overall.level)}`}>
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
              </p>
            </div>
            <div className="chaser-now-temp">
              <span className="chaser-now-big">
                {formatTemp(weather.current.temperature_2m, units)}
              </span>
              <span>Now · gusts {formatSpeed(weather.current.wind_gusts_10m, units)}</span>
            </div>
          </section>

          <div className="chaser-hazard-grid">
            <HazardTile card={brief.tornado} />
            <HazardTile card={brief.hail} />
            <HazardTile card={brief.wind} />
            <HazardTile card={brief.overall} />
          </div>

          {severeAlerts.length > 0 && (
            <section className="chaser-section">
              <h2>Active alerts</h2>
              <Alerts alerts={severeAlerts} />
            </section>
          )}

          <section className="chaser-section chaser-radar-wrap">
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
                mapId="chaser-radar"
                pageMode
              />
            </Suspense>
          </section>

          <div className="chaser-two-col">
            <section className="panel chaser-atmos">
              <div className="panel-header">
                <h2>Atmosphere</h2>
                <span className="panel-hint">Sounding proxy</span>
              </div>
              <p className="chaser-atmos-note">{brief.atmosphere.note}</p>
              <dl className="chaser-stat-grid">
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
                  <dt>Peak gust (24h)</dt>
                  <dd>{formatSpeed(brief.peaks.gustKmh, units)}</dd>
                </div>
                <div>
                  <dt>Sustained wind</dt>
                  <dd>{formatSpeed(brief.peaks.windKmh, units)}</dd>
                </div>
              </dl>
              <Sounding profile={profile} units={units} timezone={weather.timezone} />
            </section>

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
                  href="https://www.spc.noaa.gov/exper/mesoanalysis/"
                  target="_blank"
                  rel="noreferrer"
                >
                  SPC mesoanalysis
                </a>
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
          </div>

          <section className="chaser-section">
            <Tropical storms={storms} onFocus={openStorm} />
          </section>
        </main>
      )}
    </div>
  )
}
