import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SearchBar } from '../components/SearchBar'
import { CurrentWeather } from '../components/CurrentWeather'
import { HourlyForecast } from '../components/HourlyForecast'
import { DailyForecast } from '../components/DailyForecast'
import { WeatherDetails } from '../components/WeatherDetails'
import { AirQuality } from '../components/AirQuality'
import { Alerts } from '../components/Alerts'
import { SunMoon } from '../components/SunMoon'
import { PrecipChart } from '../components/PrecipChart'
import { Favorites } from '../components/Favorites'
import { RainNextHour } from '../components/RainNextHour'
import { HourlyCharts } from '../components/HourlyCharts'
import { OutlookTips } from '../components/OutlookTips'
import { ModelCompare } from '../components/ModelCompare'
import { Sounding } from '../components/Sounding'
import { Tropical } from '../components/Tropical'
import { SettingsBar } from '../components/SettingsBar'
import { HomePins } from '../components/HomePins'
import { WillIGetWet } from '../components/WillIGetWet'
import { PollenPanel } from '../components/PollenPanel'
import { FireSmoke } from '../components/FireSmoke'
import { TripPlanner } from '../components/TripPlanner'
import { CityCompare } from '../components/CityCompare'
import { InstallPrompt } from '../components/InstallPrompt'
import { AlertTopBar } from '../components/AlertTopBar'
import { WeatherStory } from '../components/WeatherStory'
import { ComfortPanel } from '../components/ComfortPanel'
import { ClimateCompare } from '../components/ClimateCompare'
import { SnowOutlook } from '../components/SnowOutlook'
import { LifestyleScores } from '../components/LifestyleScores'
import { AmbientOrbs } from '../components/AmbientOrbs'
import { AdvancedSection } from '../components/AdvancedSection'
import { isMobileViewport } from '../utils/device'
import { DashboardSkeleton } from '../components/Skeleton'
import { TodayTimeline } from '../components/TodayTimeline'
import { WeekStrip } from '../components/WeekStrip'
import { HazardBadges } from '../components/HazardBadges'
import { PrecipTotals } from '../components/PrecipTotals'
import { AreaChat } from '../components/AreaChat'
import { UvWindPanel } from '../components/UvWindPanel'
import { VisibilityPanel } from '../components/VisibilityPanel'
import { SevereTimeline } from '../components/SevereTimeline'
import { ActivityModes } from '../components/ActivityModes'
import { ShareWeatherCard } from '../components/ShareWeatherCard'
import { OutdoorAirStrip } from '../components/OutdoorAirStrip'
import { StormRisk } from '../components/StormRisk'
import { DayLastYear } from '../components/DayLastYear'
import { Deferred } from '../components/Deferred'
import { useWeather } from '../hooks/useWeather'
import { useAuth } from '../hooks/useAuth'
import { useRainWatch } from '../hooks/useRainWatch'
import { getWeatherInfo } from '../utils/weatherCodes'
import { locationKey, shareUrl } from '../api/weather'
import type { LocationResult } from '../api/types'
import { filterActiveAlerts } from '../utils/activeAlerts'

/** Leaflet + radar engine — large; load only when needed */
const RadarMap = lazy(() =>
  import('../components/RadarMap').then((m) => ({ default: m.RadarMap })),
)
const FireMapPanel = lazy(() =>
  import('../components/FireMapPanel').then((m) => ({ default: m.FireMapPanel })),
)

function MapChunkFallback({ label }: { label: string }) {
  return (
    <div className="map-chunk-fallback" role="status" aria-live="polite">
      <div className="spinner" />
      <span>{label}</span>
    </div>
  )
}

export default function DashboardPage() {
  const [isMobile] = useState(() => isMobileViewport())
  /** Mobile: radar is opt-in — Leaflet + tile loops are the #1 resource hog */
  const [radarOpen, setRadarOpen] = useState(false)
  const {
    location,
    weather,
    air,
    alerts,
    models,
    profile,
    storms,
    loading,
    refreshing,
    error,
    geoLoading,
    units,
    theme,
    resolvedTheme,
    density,
    favorites,
    severeMode,
    stormMode,
    notifyAlerts,
    severeActive,
    setUnits,
    setTheme,
    setDensity,
    setSevereMode,
    setStormMode,
    setNotifyAlerts,
    toggleFavorite,
    isFavorite,
    loadForLocation,
    requestMyLocation,
    syncNow,
    cloudSynced,
    cloudStatus,
    updatedAt,
    offline,
    clearError,
    refresh,
  } = useWeather()
  const { user } = useAuth()

  const rainWatch = useRainWatch(favorites, notifyAlerts, location)

  const [shareMsg, setShareMsg] = useState<string | null>(null)
  /** When true, alert strip is the red pill; panel list stays hidden until opened */
  const [alertsMinimized, setAlertsMinimized] = useState(() => {
    try {
      return localStorage.getItem('atmos-alerts-minimized') === '1'
    } catch {
      return false
    }
  })

  const activeAlerts = useMemo(() => filterActiveAlerts(alerts), [alerts])

  const bg =
    weather != null && resolvedTheme === 'dark'
      ? getWeatherInfo(weather.current.weather_code, weather.current.is_day === 1).gradient
      : undefined

  const onShare = useCallback(async () => {
    if (!location) return
    const url = shareUrl(location)
    try {
      await navigator.clipboard.writeText(url)
      setShareMsg('Link copied to clipboard')
    } catch {
      setShareMsg(url)
    }
    window.setTimeout(() => setShareMsg(null), 2500)
  }, [location])

  const radarPath = location
    ? `/radar?lat=${location.latitude.toFixed(4)}&lon=${location.longitude.toFixed(4)}&name=${encodeURIComponent(location.name)}`
    : '/radar'

  const jumpRadar = () => {
    document.getElementById('radar-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const stormLat = weather?.latitude
  const stormLon = weather?.longitude

  // Storm mode: jump radar into view once when enabled (or location changes)
  useEffect(() => {
    if (!stormMode || stormLat == null || stormLon == null) return
    const t = window.setTimeout(jumpRadar, 350)
    return () => window.clearTimeout(t)
  }, [stormMode, stormLat, stormLon])

  const openStorm = (lat: number, lon: number, name: string) => {
    const loc: LocationResult = {
      id: Date.now(),
      name,
      latitude: lat,
      longitude: lon,
      admin1: 'Tropical system',
    }
    void loadForLocation(loc)
    window.setTimeout(jumpRadar, 450)
  }

  const openPin = (lat: number, lon: number, name: string) => {
    void loadForLocation({
      id: Date.now(),
      name,
      latitude: lat,
      longitude: lon,
    })
  }

  const severe = (severeMode && severeActive) || stormMode
  const statusMsg =
    shareMsg ||
    cloudStatus ||
    rainWatch.banner ||
    (offline ? 'Offline — showing last saved weather' : null)
  const currentKey = location ? locationKey(location) : undefined

  const jumpAlerts = () => {
    document.getElementById('alerts-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const wantRadar = stormMode || radarOpen || !isMobile

  const radarBlock = location && weather && (
    <div className="priority-radar" id="radar-map-wrap">
      <div className="radar-jump-row">
        <Link to={radarPath} className="primary-btn radar-open-btn">
          📡 Full-page radar
        </Link>
        <Link to="/widget" className="chip-btn">
          ☔ Rain widget
        </Link>
        {isMobile && !wantRadar && (
          <button type="button" className="chip-btn" onClick={() => setRadarOpen(true)}>
            Show inline radar
          </button>
        )}
        {isMobile && wantRadar && !stormMode && (
          <button type="button" className="chip-btn" onClick={() => setRadarOpen(false)}>
            Hide radar
          </button>
        )}
        {!stormMode && (
          <button type="button" className="chip-btn" onClick={() => setStormMode(true)}>
            🌩 Storm mode
          </button>
        )}
      </div>
      {wantRadar ? (
        <Deferred
          force={stormMode || !isMobile}
          rootMargin="200px 0px"
          minHeight={isMobile ? 320 : 420}
          placeholder={<MapChunkFallback label="Loading radar when visible…" />}
        >
          <Suspense fallback={<MapChunkFallback label="Loading live radar…" />}>
            <RadarMap
              lat={location.latitude}
              lon={location.longitude}
              placeName={location.name}
              units={units}
              severeMode={severe}
              mapId="radar-map"
            />
          </Suspense>
        </Deferred>
      ) : (
        <p className="radar-collapsed-hint muted-center">
          Radar stays off to save battery — open full-page radar or tap Show inline radar.
        </p>
      )}
    </div>
  )

  return (
    <div
      className={`app ${severe ? 'app-severe' : ''} ${stormMode ? 'app-storm' : ''} ${refreshing ? 'is-refreshing' : ''} ${activeAlerts.length ? 'has-alerts' : ''} ${alertsMinimized ? 'alerts-minimized' : ''}`}
      style={bg ? { background: bg } : undefined}
      data-theme-active={theme}
      data-density={density}
    >
      {!isMobile && <div className="bg-noise" aria-hidden />}
      <div className="bg-scrim" aria-hidden />
      {!isMobile && <AmbientOrbs />}

      <AlertTopBar
        alerts={activeAlerts}
        placeName={location?.name}
        onJumpDetails={jumpAlerts}
        onMinimizedChange={setAlertsMinimized}
      />

      <div className="app-shell">
        {/* Install prompt is non-critical — skip on first mobile paint via Deferred */}
        <Deferred force={!isMobile} rootMargin="0px" minHeight={0}>
          <InstallPrompt />
        </Deferred>
        <header className="topbar">
          <div className="brand">
            <img
              className="brand-mark"
              src="/icons/solara-logo.png"
              alt=""
              width={48}
              height={48}
              decoding="async"
            />
            <div>
              <strong>Solara</strong>
              {stormMode && <span className="brand-tag">Storm mode</span>}
            </div>
          </div>
          <SearchBar
            onSelect={loadForLocation}
            onUseLocation={requestMyLocation}
            geoLoading={geoLoading}
          />
          <div className="topbar-right">
            <nav className="quick-nav" aria-label="App modes">
              <Link to={radarPath} className="chip-btn icon-chip nav-chip" title="Full-page radar" aria-label="Radar">
                📡
              </Link>
              <Link
                to="/widget"
                className="chip-btn icon-chip nav-chip hide-sm"
                title="Rain widget"
                aria-label="Rain widget"
              >
                ☔
              </Link>
            </nav>
            <SettingsBar
              units={units}
              theme={theme}
              density={density}
              severeMode={severeMode}
              stormMode={stormMode}
              notifyAlerts={notifyAlerts}
              isFavorite={isFavorite(location)}
              cloudSynced={cloudSynced}
              onUnits={setUnits}
              onTheme={setTheme}
              onDensity={setDensity}
              onSevereMode={setSevereMode}
              onStormMode={setStormMode}
              onNotify={(v) => void setNotifyAlerts(v)}
              onToggleFavorite={() => location && toggleFavorite(location)}
              onShare={() => void onShare()}
              onRefresh={() => refresh()}
              onCloudSync={() => void syncNow()}
              loading={loading}
              refreshing={refreshing}
            />
          </div>
        </header>

        <p className="brand-promise">
          Weather that tells you if you&apos;ll get wet — radar, alerts, and your places.
        </p>

        {stormMode && (
          <div className="storm-mode-banner" role="status">
            <div>
              <strong>🌩 Storm mode on</strong>
              <span>Radar first · intense map · severe highlighting</span>
            </div>
            <button type="button" className="chip-btn" onClick={() => setStormMode(false)}>
              Exit
            </button>
          </div>
        )}

        {statusMsg && (
          <div
            className={`banner share-banner toast-banner ${rainWatch.banner ? 'rain-banner' : ''}`}
            role="status"
          >
            <span>{statusMsg}</span>
          </div>
        )}

        {error && (
          <div className="banner error" role="alert">
            <span>{error}</span>
            <div className="banner-actions">
              <button type="button" onClick={requestMyLocation}>
                My location
              </button>
              <button type="button" className="banner-dismiss" onClick={clearError}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Mobile: saved places first — pick a location, then scroll into weather */}
        <div className="favorites-mobile-slot" id="favorites">
          <Favorites
            favorites={favorites}
            current={location}
            onSelect={loadForLocation}
            onRemove={toggleFavorite}
            signedIn={!!user}
            accountSynced={cloudSynced}
          />
        </div>

        {!location && !loading && !error && (
          <div className="empty-state empty-state-rich">
            <div className="empty-icon" aria-hidden>
              <img src="/icons/solara-logo.png" alt="" width={72} height={72} decoding="async" />
            </div>
            <h1>Where should we look?</h1>
            <p className="empty-lead">
              Solara answers one thing first: <strong>will you get wet?</strong>
              <br />
              Then radar, alerts (US + Canada), and your pinned places.
            </p>
            <div className="empty-actions">
              <button type="button" className="primary-btn" onClick={requestMyLocation}>
                Use my location
              </button>
              <Link to="/radar" className="chip-btn empty-secondary">
                Open radar anyway
              </Link>
            </div>
            <ul className="empty-hints">
              <li>Search any city in the bar above</li>
              <li>Star places for rain watch</li>
              <li>Storm mode prioritizes live radar</li>
            </ul>
          </div>
        )}

        {loading && !weather && <DashboardSkeleton />}

        <Deferred rootMargin="200px 0px" minHeight={isMobile ? 48 : 0}>
          <AreaChat location={location} />
        </Deferred>

        {weather && location && (
          <main className={`dashboard ${stormMode ? 'dashboard-storm' : ''}`}>
            <div className="col main-col">
              {/* Priority: story of now */}
              <div className="priority-stack">
                <CurrentWeather
                  weather={weather}
                  location={location}
                  units={units}
                  isFavorite={isFavorite(location)}
                  onToggleFavorite={() => toggleFavorite(location)}
                  updatedAt={updatedAt}
                  refreshing={refreshing}
                  alertCount={alertsMinimized ? 0 : activeAlerts.length}
                  offline={offline}
                />
                <WillIGetWet weather={weather} />
                <SevereTimeline
                  weather={weather}
                  units={units}
                  alerts={alertsMinimized ? [] : activeAlerts}
                  air={air}
                  profile={profile}
                />
                <RainNextHour weather={weather} units={units} />
                {/* Defer secondary panels on mobile so first paint stays light */}
                <Deferred
                  force={!isMobile}
                  rootMargin="120px 0px"
                  minHeight={isMobile ? 80 : undefined}
                >
                  <ActivityModes weather={weather} units={units} air={air} />
                  <HazardBadges weather={weather} units={units} />
                  <TodayTimeline weather={weather} units={units} />
                </Deferred>
              </div>

              {/* Storm: radar immediately after priority */}
              {stormMode && radarBlock}

              <WeekStrip weather={weather} units={units} />

              {/* Home pins need rain-watch network — skip empty shell on mobile */}
              {(!isMobile || rainWatch.snapshots.length > 0 || rainWatch.loading) && (
                <HomePins
                  snapshots={rainWatch.snapshots}
                  loading={rainWatch.loading}
                  units={units}
                  currentKey={currentKey}
                  onSelect={openPin}
                  onRefresh={() => void rainWatch.refresh()}
                />
              )}

              <div id="alerts-panel">
                {!alertsMinimized && <Alerts alerts={activeAlerts} />}
              </div>

              {!stormMode && radarBlock}

              <HourlyForecast weather={weather} units={units} />
              <Deferred
                force={!isMobile}
                rootMargin="180px 0px"
                minHeight={isMobile ? 80 : undefined}
              >
                <OutdoorAirStrip weather={weather} air={air} />
                <UvWindPanel weather={weather} units={units} />
                <PrecipTotals weather={weather} units={units} />
                <VisibilityPanel weather={weather} units={units} />
                {!isMobile && <StormRisk weather={weather} profile={profile} />}
              </Deferred>
              {/* Fire map is heavy (Leaflet) — never auto on mobile unless scrolled deep */}
              <Deferred
                force={false}
                rootMargin={isMobile ? '40px 0px' : '200px 0px'}
                minHeight={isMobile ? 120 : 360}
                placeholder={
                  isMobile ? (
                    <p className="muted-center">Scroll for fire map…</p>
                  ) : (
                    <MapChunkFallback label="Fire map loads near view…" />
                  )
                }
              >
                <Suspense fallback={<MapChunkFallback label="Loading fire map…" />}>
                  <FireMapPanel
                    lat={location.latitude}
                    lon={location.longitude}
                    placeName={location.name}
                    weather={weather}
                    air={air}
                  />
                </Suspense>
              </Deferred>
              <Deferred force={!isMobile} rootMargin="100px 0px">
                <ShareWeatherCard weather={weather} location={location} units={units} />
                <WeatherStory weather={weather} units={units} placeName={location.name} />
              </Deferred>

              <AdvancedSection title="More details" defaultOpen={false}>
                <div className="advanced-grid">
                  <HourlyCharts weather={weather} units={units} />
                  <PrecipChart weather={weather} units={units} />
                  <ComfortPanel weather={weather} units={units} />
                  <LifestyleScores weather={weather} units={units} />
                  <WeatherDetails weather={weather} units={units} />
                  {!isMobile && (
                    <DayLastYear
                      weather={weather}
                      units={units}
                      lat={location.latitude}
                      lon={location.longitude}
                    />
                  )}
                  {!isMobile && (
                    <ModelCompare models={models} units={units} timezone={weather.timezone} />
                  )}
                  {!isMobile && (
                    <CityCompare units={units} home={location} homeWeather={weather} />
                  )}
                </div>
              </AdvancedSection>
            </div>

            <aside className="col side-col">
              <div className="favorites-desktop-slot">
                <Favorites
                  favorites={favorites}
                  current={location}
                  onSelect={loadForLocation}
                  onRemove={toggleFavorite}
                  signedIn={!!user}
                  accountSynced={cloudSynced}
                />
              </div>
              <DailyForecast weather={weather} units={units} />

              <AdvancedSection title="Planning & environment" defaultOpen={false} id="advanced-side">
                <div className="advanced-grid">
                  <ClimateCompare
                    weather={weather}
                    units={units}
                    lat={location.latitude}
                    lon={location.longitude}
                  />
                  <SnowOutlook weather={weather} units={units} />
                  <TripPlanner weather={weather} units={units} placeName={location.name} />
                  <OutlookTips weather={weather} units={units} />
                  <PollenPanel air={air} />
                  <FireSmoke weather={weather} air={air} />
                  <SunMoon weather={weather} />
                  <Sounding profile={profile} units={units} timezone={weather.timezone} />
                  <Tropical storms={storms} onFocus={openStorm} />
                  <AirQuality air={air} />
                </div>
              </AdvancedSection>

              <footer className="credits">
                <p>
                  Forecasts by{' '}
                  <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
                    Open-Meteo
                  </a>
                  . Radar by{' '}
                  <a href="https://mesonet.agron.iastate.edu/" target="_blank" rel="noreferrer">
                    IEM NEXRAD
                  </a>
                  {' / '}
                  <a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">
                    RainViewer
                  </a>
                  . Alerts{' '}
                  <a href="https://www.weather.gov/" target="_blank" rel="noreferrer">
                    NWS
                  </a>
                  {' / '}
                  <a href="https://www.weather.gc.ca/" target="_blank" rel="noreferrer">
                    ECCC
                  </a>
                  . Fires{' '}
                  <a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">
                    NASA FIRMS
                  </a>
                  .
                </p>
                <p className="tiny">
                  {user ? `Signed in as ${user.email} · ` : ''}
                  <strong>Storm mode</strong> = radar first. <strong>Notify</strong> = rain watch.
                </p>
              </footer>
            </aside>
          </main>
        )}
      </div>
    </div>
  )
}
