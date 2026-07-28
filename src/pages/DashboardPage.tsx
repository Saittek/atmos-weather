import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SearchBar } from '../components/SearchBar'
import { CurrentWeather } from '../components/CurrentWeather'
import { HourlyForecast } from '../components/HourlyForecast'
import { DailyForecast } from '../components/DailyForecast'
import { AirQuality } from '../components/AirQuality'
import { Alerts } from '../components/Alerts'
import { SunMoon } from '../components/SunMoon'
import { Favorites } from '../components/Favorites'
import { SettingsBar } from '../components/SettingsBar'
import { AllergySection } from '../components/AllergySection'
import { Onboarding } from '../components/Onboarding'
import { ForecastSummary } from '../components/ForecastSummary'
import { GlanceModules } from '../components/GlanceModules'
import { HomeScreenWidget } from '../components/HomeScreenWidget'
import { AlertTopBar, AlertTopBarCircle, setAlertsMinimizedStored } from '../components/AlertTopBar'
import { AmbientOrbs } from '../components/AmbientOrbs'
import { AdvancedSection } from '../components/AdvancedSection'
import { isMobileViewport } from '../utils/device'
import { DashboardSkeleton } from '../components/Skeleton'
import { WeekStrip } from '../components/WeekStrip'
import { Deferred } from '../components/Deferred'
import { useWeather } from '../hooks/useWeather'
import { useThreatProximity } from '../hooks/useThreatProximity'
import { useHomeAlerts } from '../hooks/useHomeAlerts'
import { sameExactPlace } from '../hooks/useWeather'
import { ThreatBanner } from '../components/ThreatBanner'
import { useAuth } from '../hooks/useAuth'
import { useRainWatch } from '../hooks/useRainWatch'
import { isDaytimeNow } from '../utils/daylight'
import { getWeatherInfo } from '../utils/weatherCodes'
import { locationKey, shareUrl } from '../api/weather'
import type { LocationResult } from '../api/types'
import { filterActiveAlerts } from '../utils/activeAlerts'
import { willIGetWet } from '../utils/wetSummary'
import { usePullToRefresh } from '../hooks/usePullToRefresh'

/** Heavy / below-fold — code-split off the critical path */
const RadarMap = lazy(() =>
  import('../components/RadarMap').then((m) => ({ default: m.RadarMap })),
)
const FireMapPanel = lazy(() =>
  import('../components/FireMapPanel').then((m) => ({ default: m.FireMapPanel })),
)
const WeatherVideos = lazy(() =>
  import('../components/WeatherVideos').then((m) => ({ default: m.WeatherVideos })),
)
const HazardBadges = lazy(() =>
  import('../components/HazardBadges').then((m) => ({ default: m.HazardBadges })),
)
const UvWindPanel = lazy(() =>
  import('../components/UvWindPanel').then((m) => ({ default: m.UvWindPanel })),
)
const OutdoorAirStrip = lazy(() =>
  import('../components/OutdoorAirStrip').then((m) => ({ default: m.OutdoorAirStrip })),
)
const ActivityModes = lazy(() =>
  import('../components/ActivityModes').then((m) => ({ default: m.ActivityModes })),
)
const PrecipTotals = lazy(() =>
  import('../components/PrecipTotals').then((m) => ({ default: m.PrecipTotals })),
)
const VisibilityPanel = lazy(() =>
  import('../components/VisibilityPanel').then((m) => ({ default: m.VisibilityPanel })),
)
const StormRisk = lazy(() =>
  import('../components/StormRisk').then((m) => ({ default: m.StormRisk })),
)
const DressForToday = lazy(() =>
  import('../components/DressForToday').then((m) => ({ default: m.DressForToday })),
)
const AreaChat = lazy(() =>
  import('../components/AreaChat').then((m) => ({ default: m.AreaChat })),
)
const ShareWeatherCard = lazy(() =>
  import('../components/ShareWeatherCard').then((m) => ({ default: m.ShareWeatherCard })),
)
const HourlyCharts = lazy(() =>
  import('../components/HourlyCharts').then((m) => ({ default: m.HourlyCharts })),
)
const PrecipChart = lazy(() =>
  import('../components/PrecipChart').then((m) => ({ default: m.PrecipChart })),
)
const ComfortPanel = lazy(() =>
  import('../components/ComfortPanel').then((m) => ({ default: m.ComfortPanel })),
)
const LifestyleScores = lazy(() =>
  import('../components/LifestyleScores').then((m) => ({ default: m.LifestyleScores })),
)
const WeatherDetails = lazy(() =>
  import('../components/WeatherDetails').then((m) => ({ default: m.WeatherDetails })),
)
const DayLastYear = lazy(() =>
  import('../components/DayLastYear').then((m) => ({ default: m.DayLastYear })),
)
const ModelCompare = lazy(() =>
  import('../components/ModelCompare').then((m) => ({ default: m.ModelCompare })),
)
const CityCompare = lazy(() =>
  import('../components/CityCompare').then((m) => ({ default: m.CityCompare })),
)
const ClimateCompare = lazy(() =>
  import('../components/ClimateCompare').then((m) => ({ default: m.ClimateCompare })),
)
const SnowOutlook = lazy(() =>
  import('../components/SnowOutlook').then((m) => ({ default: m.SnowOutlook })),
)
const TripPlanner = lazy(() =>
  import('../components/TripPlanner').then((m) => ({ default: m.TripPlanner })),
)
const OutlookTips = lazy(() =>
  import('../components/OutlookTips').then((m) => ({ default: m.OutlookTips })),
)
const FireSmoke = lazy(() =>
  import('../components/FireSmoke').then((m) => ({ default: m.FireSmoke })),
)
const Sounding = lazy(() =>
  import('../components/Sounding').then((m) => ({ default: m.Sounding })),
)
const Tropical = lazy(() =>
  import('../components/Tropical').then((m) => ({ default: m.Tropical })),
)

function LazyPanel({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>
}

function MapChunkFallback({ label }: { label: string }) {
  return (
    <div className="map-chunk-fallback" role="status" aria-live="polite">
      <div className="spinner" />
      <span>{label}</span>
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [isMobile] = useState(() => isMobileViewport())
  /** Mobile: radar is opt-in — Leaflet + tile loops are the #1 resource hog */
  const [radarOpen, setRadarOpen] = useState(false)
  /** User manually hid radar — don't auto-reopen until conditions/place change */
  const [userClosedRadar, setUserClosedRadar] = useState(false)
  const [autoOpenedFor, setAutoOpenedFor] = useState<string | null>(null)
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
    homeLocation,
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
    setHomeLocation,
    isHome,
    goHome,
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

  const threat = useThreatProximity(location?.latitude, location?.longitude, {
    enabled: Boolean(location && (severeMode || stormMode || notifyAlerts)),
    maxKm: 60,
  })

  const rainWatch = useRainWatch(favorites, notifyAlerts, location, homeLocation)

  useHomeAlerts({
    home: homeLocation,
    weather,
    units,
    enabled: Boolean(homeLocation && (notifyAlerts || severeMode)),
    homeWeather: sameExactPlace(location, homeLocation) ? weather : null,
  })

  const rainWatchRefresh = rainWatch.refresh
  const doRefresh = useCallback(async () => {
    refresh()
    await rainWatchRefresh()
  }, [refresh, rainWatchRefresh])

  const pull = usePullToRefresh(doRefresh, isMobile)

  const [shareMsg, setShareMsg] = useState<string | null>(null)
  /** When true, full alert strip is hidden — circle shows in the top bar */
  const [alertsMinimized, setAlertsMinimized] = useState(() => {
    try {
      return localStorage.getItem('atmos-alerts-minimized') === '1'
    } catch {
      return false
    }
  })

  const activeAlerts = useMemo(() => filterActiveAlerts(alerts), [alerts])
  const topAlertSeverity = useMemo(() => {
    if (!activeAlerts.length) return undefined
    const rank = (s: string) =>
      s === 'Extreme' ? 0 : s === 'Severe' ? 1 : s === 'Moderate' ? 2 : 3
    return [...activeAlerts].sort((a, b) => rank(a.severity) - rank(b.severity))[0]?.severity
  }, [activeAlerts])

  const expandAlerts = useCallback(() => {
    setAlertsMinimized(false)
    setAlertsMinimizedStored(false)
  }, [])

  const bg =
    weather != null && resolvedTheme === 'dark'
      ? getWeatherInfo(weather.current.weather_code, isDaytimeNow(weather)).gradient
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

  const severe = (severeMode && severeActive) || stormMode
  const statusMsg =
    shareMsg ||
    cloudStatus ||
    rainWatch.banner ||
    (offline ? 'Offline — showing last saved weather' : null)

  const jumpAlerts = () => {
    document.getElementById('alerts-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Smart radar: auto-open on mobile when wet risk is high (once per place+level)
  useEffect(() => {
    if (!isMobile || !weather || !location || stormMode) return
    const wet = willIGetWet(weather)
    if (wet.level !== 'wet' && !(wet.level === 'maybe' && wet.umbrella)) return
    const key = `${locationKey(location)}:${wet.level}`
    if (userClosedRadar && autoOpenedFor === key) return
    if (autoOpenedFor === key) return
    setAutoOpenedFor(key)
    setUserClosedRadar(false)
    setRadarOpen(true)
  }, [isMobile, weather, location, stormMode, userClosedRadar, autoOpenedFor])

  // Reset manual-hide when place changes
  useEffect(() => {
    setUserClosedRadar(false)
    setAutoOpenedFor(null)
    if (isMobile) setRadarOpen(false)
  }, [location?.latitude, location?.longitude, isMobile])

  const wantRadar = stormMode || radarOpen || !isMobile

  const radarBlock = location && weather && (
    <div className="priority-radar" id="radar-map-wrap">
      {isMobile && !wantRadar ? (
        <section className="panel radar-cta-panel" aria-label="Radar">
          <div className="panel-header">
            <h2>📡 Radar</h2>
            <span className="panel-hint">Off until you open it</span>
          </div>
          <p className="radar-cta-copy muted-center">
            Live radar uses more battery. Opens automatically when rain risk is high.
          </p>
          <div className="radar-cta-actions">
            <button
              type="button"
              className="primary-btn radar-view-btn"
              onClick={() => {
                setUserClosedRadar(false)
                setRadarOpen(true)
              }}
            >
              View radar
            </button>
            <Link to={radarPath} className="chip-btn">
              Full page
            </Link>
          </div>
        </section>
      ) : (
        <>
          <div className="radar-jump-row">
            <Link to={radarPath} className="primary-btn radar-open-btn">
              📡 Full-page radar
            </Link>
            <Link to="/widget" className="chip-btn hide-sm">
              ☔ Rain widget
            </Link>
            {isMobile && wantRadar && !stormMode && (
              <button
                type="button"
                className="chip-btn"
                onClick={() => {
                  setUserClosedRadar(true)
                  setRadarOpen(false)
                }}
              >
                Hide radar
              </button>
            )}
            {!stormMode && (
              <button type="button" className="chip-btn" onClick={() => setStormMode(true)}>
                🌩 Storm mode
              </button>
            )}
          </div>
          <Deferred
            force={stormMode || !isMobile || radarOpen}
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
                homeLocation={homeLocation}
              />
            </Suspense>
          </Deferred>
        </>
      )}
    </div>
  )

  return (
    <div
      className={`app ${severe ? 'app-severe' : ''} ${stormMode ? 'app-storm' : ''} ${refreshing || pull.refreshing ? 'is-refreshing' : ''} ${activeAlerts.length ? 'has-alerts' : ''} ${alertsMinimized ? 'alerts-minimized' : ''}`}
      style={bg ? { background: bg } : undefined}
      data-theme-active={theme}
      data-density={density}
    >
      {!isMobile && <div className="bg-noise" aria-hidden />}
      <div className="bg-scrim" aria-hidden />
      {!isMobile && <AmbientOrbs />}

      {/* Pull-to-refresh indicator (mobile) */}
      {(pull.pulling || pull.refreshing) && (
        <div
          className={`ptr-indicator ${pull.refreshing ? 'is-refreshing' : ''} ${pull.progress >= 1 ? 'is-ready' : ''}`}
          style={{ transform: `translateY(${pull.refreshing ? 12 : Math.max(0, pull.distance - 24)}px)` }}
          aria-hidden
        >
          <span className="ptr-spinner" />
          <span>{pull.refreshing ? 'Updating…' : pull.progress >= 1 ? 'Release' : 'Pull to refresh'}</span>
        </div>
      )}

      <AlertTopBar
        alerts={activeAlerts}
        placeName={location?.name}
        onJumpDetails={jumpAlerts}
        minimized={alertsMinimized}
        onMinimizedChange={setAlertsMinimized}
      />

      {location && threat.threats.length > 0 && (
        <div className="dashboard-threat-wrap">
          <ThreatBanner
            threats={threat.threats}
            loading={threat.loading}
            muted={threat.muted}
            onMute={threat.setMuted}
            onJump={() => {
              const p = location
              navigate(
                `/chase?lat=${p.latitude.toFixed(4)}&lon=${p.longitude.toFixed(4)}&name=${encodeURIComponent(p.name)}`,
              )
            }}
            onRefresh={() => threat.refresh()}
          />
        </div>
      )}

      <Onboarding />

      {/* Fixed topbar lives outside .app-shell so overflow-x:clip never affects pin-to-viewport */}
      <header className="topbar">
        <div className="topbar-left">
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
          {/* 3D Earth + global radar */}
          <Link
            to="/globe"
            className="chip-btn nav-chip earth-nav-btn"
            title="3D Earth · global radar"
            aria-label="3D Earth with global radar"
          >
            <span className="earth-nav-orb" aria-hidden>
              <span className="earth-nav-glow" />
            </span>
            <span className="earth-nav-label hide-sm">Earth</span>
          </Link>
          {/* Storm chasers — sits with brand so it never stacks under account/settings */}
          <Link
            to={
              location
                ? `/chase?lat=${location.latitude.toFixed(4)}&lon=${location.longitude.toFixed(4)}&name=${encodeURIComponent(location.name)}`
                : '/chase'
            }
            className="chip-btn nav-chip chaser-nav-btn chaser-nav-top"
            title="Storm chasers desk"
            aria-label="Storm chasers"
          >
            <span aria-hidden>🌪</span>
            <span className="chaser-nav-label">Chasers</span>
          </Link>
          {/* Hidden alerts → circle in top bar */}
          {alertsMinimized && activeAlerts.length > 0 && (
            <AlertTopBarCircle
              count={activeAlerts.length}
              severity={topAlertSeverity}
              onClick={expandAlerts}
            />
          )}
        </div>
        <SearchBar
          onSelect={loadForLocation}
          onUseLocation={requestMyLocation}
          geoLoading={geoLoading}
        />
        <div className="topbar-right">
            <nav className="quick-nav" aria-label="App modes">
              {homeLocation && (
                <button
                  type="button"
                  className={`chip-btn icon-chip nav-chip home-nav-btn ${isHome(location) ? 'active' : ''}`}
                  title={`Go home · ${homeLocation.name || 'Home'}`}
                  aria-label="Go home"
                  onClick={() => goHome()}
                >
                  🏠
                </button>
              )}
              <Link to={radarPath} className="chip-btn icon-chip nav-chip" title="Full-page radar" aria-label="Radar">
                📡
              </Link>
              <Link
                to="/widget"
                className="chip-btn icon-chip nav-chip hide-sm"
                title="Home rain widget"
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
              hasHome={Boolean(homeLocation)}
              isHome={isHome(location)}
              onUnits={setUnits}
              onTheme={setTheme}
              onDensity={setDensity}
              onSevereMode={setSevereMode}
              onStormMode={setStormMode}
              onNotify={(v) => void setNotifyAlerts(v)}
              onToggleFavorite={() => location && toggleFavorite(location)}
              onGoHome={() => goHome()}
              onSetHome={() => {
                if (!location) return
                if (isHome(location)) setHomeLocation(null)
                else {
                  setHomeLocation({
                    ...location,
                    name: location.name?.includes('Home')
                      ? location.name
                      : `${location.name} (Home)`,
                  })
                }
              }}
              onShare={() => void onShare()}
              onRefresh={() => refresh()}
              onCloudSync={() => void syncNow()}
              loading={loading}
              refreshing={refreshing}
            />
          </div>
      </header>

      <div className="app-shell">
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
            home={homeLocation}
            geoLoading={geoLoading}
            onSetHome={setHomeLocation}
            onGoHome={goHome}
          />
        </div>

        {!location && !loading && !error && (
          <div className="empty-state empty-state-rich">
            <div className="empty-icon" aria-hidden>
              <img src="/icons/solara-logo.png" alt="" width={72} height={72} decoding="async" />
            </div>
            <h1>Where should we look?</h1>
            <p className="empty-lead">
              Search a city or use your location for forecasts, radar, and alerts.
            </p>
            <div className="empty-actions">
              <button type="button" className="primary-btn" onClick={requestMyLocation}>
                Use my location
              </button>
              <Link to="/radar" className="chip-btn empty-secondary">
                Open radar
              </Link>
            </div>
          </div>
        )}

        {loading && !weather && <DashboardSkeleton />}

        {weather && location && (
          <main
            className={`dashboard ${stormMode ? 'dashboard-storm' : ''}`}
          >
            <div className="col main-col">
              <div className="priority-stack">
                <CurrentWeather
                  weather={weather}
                  location={location}
                  units={units}
                  isFavorite={isFavorite(location)}
                  onToggleFavorite={() => toggleFavorite(location)}
                  isHome={isHome(location)}
                  onSetHome={() => {
                    if (isHome(location)) {
                      setHomeLocation(null)
                    } else {
                      setHomeLocation({
                        ...location,
                        name: location.name?.includes('Home')
                          ? location.name
                          : `${location.name} (Home)`,
                      })
                    }
                  }}
                  updatedAt={updatedAt}
                  refreshing={refreshing}
                  alertCount={alertsMinimized ? 0 : activeAlerts.length}
                  offline={offline}
                  air={air}
                />

                {/* Directly under “Right now” */}
                <GlanceModules weather={weather} units={units} air={air} />

                <HomeScreenWidget compact />

                <div id="alerts-panel">
                  {!alertsMinimized && <Alerts alerts={activeAlerts} />}
                </div>

                <ForecastSummary
                  weather={weather}
                  units={units}
                  placeName={location.name}
                  air={air}
                />
              </div>

              <HourlyForecast weather={weather} units={units} />
              <WeekStrip weather={weather} units={units} />

              <div className="daily-mobile-slot">
                <DailyForecast weather={weather} units={units} />
              </div>

              {/* Radar above allergies */}
              {radarBlock}

              {/* Allergies — pollen, mold-friendly air, tips */}
              <AllergySection air={air} weather={weather} />

              <>
                  <div className="outdoor-mobile-slot">
                    <SunMoon weather={weather} />
                    <AirQuality air={air} />
                  </div>

                  <Deferred
                    force={!isMobile}
                    rootMargin="100px 0px"
                    minHeight={isMobile ? 72 : undefined}
                  >
                    <LazyPanel>
                      <HazardBadges weather={weather} units={units} air={air} />
                      <UvWindPanel weather={weather} units={units} />
                      <OutdoorAirStrip weather={weather} air={air} />
                      <ActivityModes weather={weather} units={units} air={air} />
                    </LazyPanel>
                  </Deferred>

                  <Deferred
                    force={!isMobile}
                    rootMargin="160px 0px"
                    minHeight={isMobile ? 64 : undefined}
                  >
                    <LazyPanel>
                      <PrecipTotals weather={weather} units={units} />
                      <VisibilityPanel weather={weather} units={units} air={air} />
                      {!isMobile && <StormRisk weather={weather} profile={profile} />}
                    </LazyPanel>
                  </Deferred>

                  <LazyPanel>
                    <DressForToday weather={weather} units={units} air={air} />
                  </LazyPanel>

                  <Deferred force={!isMobile} rootMargin="120px 0px" minHeight={isMobile ? 200 : 320}>
                    <LazyPanel>
                      <WeatherVideos />
                    </LazyPanel>
                  </Deferred>

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
                        homeLocation={homeLocation}
                      />
                    </Suspense>
                  </Deferred>

                  <Deferred force={!isMobile} rootMargin="120px 0px" minHeight={isMobile ? 0 : 48}>
                    <LazyPanel>
                      <AreaChat location={location} />
                    </LazyPanel>
                  </Deferred>

                  <Deferred force={!isMobile} rootMargin="100px 0px">
                    <LazyPanel>
                      <ShareWeatherCard weather={weather} location={location} units={units} />
                    </LazyPanel>
                  </Deferred>

                  <AdvancedSection title="More details" defaultOpen={false}>
                    <div className="advanced-grid">
                      <LazyPanel>
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
                      </LazyPanel>
                    </div>
                  </AdvancedSection>
              </>
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
                  home={homeLocation}
                  geoLoading={geoLoading}
                  onSetHome={setHomeLocation}
                  onGoHome={goHome}
                />
              </div>

              <>
                  <div className="daily-desktop-slot">
                    <DailyForecast weather={weather} units={units} />
                  </div>

                  <div className="outdoor-desktop-slot">
                    <SunMoon weather={weather} />
                    <AirQuality air={air} />
                  </div>

                  <AdvancedSection title="Planning & environment" defaultOpen={false} id="advanced-side">
                    <div className="advanced-grid">
                      <LazyPanel>
                        <ClimateCompare
                          weather={weather}
                          units={units}
                          lat={location.latitude}
                          lon={location.longitude}
                        />
                        <SnowOutlook weather={weather} units={units} />
                        <TripPlanner weather={weather} units={units} placeName={location.name} />
                        <OutlookTips weather={weather} units={units} />
                        <FireSmoke weather={weather} air={air} />
                        <Sounding profile={profile} units={units} timezone={weather.timezone} />
                        <Tropical storms={storms} onFocus={openStorm} />
                      </LazyPanel>
                    </div>
                  </AdvancedSection>
              </>

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
                {user && (
                  <p className="tiny">Signed in as {user.email}</p>
                )}
              </footer>
            </aside>
          </main>
        )}

        {/* Chat / community — below weather so it never blocks the forecast */}
        {!weather && (
          <Deferred rootMargin="200px 0px" minHeight={isMobile ? 0 : 48}>
            <AreaChat location={location} />
          </Deferred>
        )}
      </div>
    </div>
  )
}
