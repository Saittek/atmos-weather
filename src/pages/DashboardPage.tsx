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
import { AlertTopBar, AlertTopBarCircle, setAlertsMinimizedStored } from '../components/AlertTopBar'
import { AmbientOrbs } from '../components/AmbientOrbs'
import { WeatherAtmosphere } from '../components/WeatherAtmosphere'
import { AdvancedSection } from '../components/AdvancedSection'
import { isMobileViewport } from '../utils/device'
import { DashboardSkeleton } from '../components/Skeleton'
import { Deferred } from '../components/Deferred'
import { useWeather } from '../hooks/useWeather'
import { useThreatProximity } from '../hooks/useThreatProximity'
import { useHomeAlerts } from '../hooks/useHomeAlerts'
import { sameExactPlace } from '../hooks/useWeather'
import { ThreatBanner } from '../components/ThreatBanner'
import { WhatMattersNow } from '../components/WhatMattersNow'
import { ModelConfidence } from '../components/ModelConfidence'
import { TodayHero } from '../components/TodayHero'
import { OutdoorGlance } from '../components/OutdoorGlance'
import { ModulePrefsPanel } from '../components/ModulePrefsPanel'
import { WhatChanged } from '../components/WhatChanged'
import { WeekendBrief } from '../components/WeekendBrief'
import { AlertTimeline } from '../components/AlertTimeline'
import { FirstRunCoach, markFirstWeatherOk } from '../components/FirstRunCoach'
import { loadPushStatus, sendTestNotification } from '../api/push'
import { useAuth } from '../hooks/useAuth'
import { useRainWatch } from '../hooks/useRainWatch'
import { isDaytimeNow } from '../utils/daylight'
import { getWeatherInfo } from '../utils/weatherCodes'
import { locationKey, shareUrl } from '../api/weather'
import type { LocationResult } from '../api/types'
import { filterActiveAlerts } from '../utils/activeAlerts'
import { willIGetWet } from '../utils/wetSummary'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import {
  loadModulePrefs,
  saveModulePrefs,
  type ModulePrefs,
} from '../lib/modulePrefs'
import { fireSmokeRisk } from '../utils/fireRisk'

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
  const [modPrefs, setModPrefs] = useState<ModulePrefs>(() => loadModulePrefs())
  const setModulePrefs = useCallback((next: ModulePrefs) => {
    setModPrefs(next)
    saveModulePrefs(next)
  }, [])
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
    workLocation,
    severeMode,
    stormMode,
    notifyAlerts,
    quietHoursEnabled,
    quietStart,
    quietEnd,
    severeActive,
    setUnits,
    setTheme,
    setDensity,
    setSevereMode,
    setStormMode,
    setNotifyAlerts,
    setQuietHours,
    toggleFavorite,
    isFavorite,
    setHomeLocation,
    isHome,
    goHome,
    setWorkLocation,
    isWork,
    goWork,
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

  const rainWatch = useRainWatch(favorites, notifyAlerts, location, homeLocation, workLocation)

  useEffect(() => {
    if (weather && location) markFirstWeatherOk()
  }, [weather, location])

  const [pushLabel, setPushLabel] = useState<string | null>(() => {
    const s = loadPushStatus()
    if (s.lastTestAt) return `Last test ${new Date(s.lastTestAt).toLocaleString()}`
    if (s.lastError) return s.lastError
    if (s.lastOkAt) return `Push OK ${new Date(s.lastOkAt).toLocaleString()}`
    return null
  })

  useHomeAlerts({
    home: homeLocation,
    weather,
    units,
    enabled: Boolean(homeLocation && (notifyAlerts || severeMode)),
    homeWeather: sameExactPlace(location, homeLocation) ? weather : null,
  })

  const rainWatchRefresh = rainWatch.refresh
  const doRefresh = useCallback(async () => {
    // Wait for weather reload so the spinner stays up until data arrives
    await Promise.resolve(refresh())
    await rainWatchRefresh()
  }, [refresh, rainWatchRefresh])

  // Touch devices + native app — pull down at top of page to refresh
  const pull = usePullToRefresh(doRefresh, true)

  const [shareMsg, setShareMsg] = useState<string | null>(null)

  const onTestNotify = useCallback(async () => {
    const r = await sendTestNotification()
    if (r.ok) {
      setPushLabel(`Test sent · ${new Date().toLocaleTimeString()}`)
      setShareMsg('Test notification sent')
      window.setTimeout(() => setShareMsg(null), 2500)
    } else {
      setPushLabel(r.reason || 'Test failed')
      setShareMsg(r.reason || 'Test notification failed')
      window.setTimeout(() => setShareMsg(null), 3500)
    }
  }, [])
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
            /* Defer radar until near viewport (or storm/user-open) so first paint is weather */
            force={stormMode || radarOpen}
            rootMargin={isMobile ? '120px 0px' : '320px 0px'}
            minHeight={isMobile ? 320 : 420}
            placeholder={<MapChunkFallback label="Radar loads when you scroll here…" />}
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
      aria-busy={loading || refreshing || pull.refreshing || geoLoading ? true : undefined}
    >
      <a className="skip-link" href="#main-content">
        Skip to forecast
      </a>
      {!isMobile && <div className="bg-noise" aria-hidden />}
      <div className="bg-scrim" aria-hidden />
      {!isMobile && <AmbientOrbs />}
      {weather && (
        <WeatherAtmosphere
          code={weather.current.weather_code}
          isDay={isDaytimeNow(weather)}
          mobile={isMobile}
        />
      )}

      {/* Pull-to-refresh indicator (mobile) */}
      {(pull.pulling || pull.refreshing) && (
        <div
          className={`ptr-indicator ${pull.refreshing ? 'is-refreshing' : ''} ${pull.progress >= 1 ? 'is-ready' : ''}`}
          style={{
            transform: `translate(-50%, ${pull.refreshing ? 10 : Math.max(0, pull.distance - 20)}px)`,
          }}
          role="status"
          aria-live="polite"
        >
          <span className="ptr-spinner" aria-hidden />
          <span>
            {pull.refreshing
              ? 'Updating…'
              : pull.progress >= 1
                ? 'Release to refresh'
                : 'Pull to refresh'}
          </span>
        </div>
      )}

      <AlertTopBar
        alerts={activeAlerts}
        placeName={location?.name}
        onJumpDetails={jumpAlerts}
        minimized={alertsMinimized}
        onMinimizedChange={setAlertsMinimized}
      />

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
          {/* Primary modes — icon-only circles (same shape as right-side controls) */}
          <Link
            to="/globe"
            className="chip-btn icon-chip nav-chip earth-nav-btn"
            title="3D Earth · global radar"
            aria-label="3D Earth with global radar"
          >
            <span className="earth-nav-orb" aria-hidden>
              <span className="earth-nav-glow" />
            </span>
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
          home={homeLocation}
          onGoHome={homeLocation ? () => goHome() : undefined}
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
              {workLocation && (
                <button
                  type="button"
                  className={`chip-btn icon-chip nav-chip work-nav-btn ${isWork(location) ? 'active' : ''}`}
                  title={`Go work · ${workLocation.name || 'Work'}`}
                  aria-label="Go to work"
                  onClick={() => goWork()}
                >
                  💼
                </button>
              )}
              <Link to={radarPath} className="chip-btn icon-chip nav-chip" title="Full-page radar" aria-label="Radar">
                📡
              </Link>
              <Link
                to={
                  location
                    ? `/chase?lat=${location.latitude.toFixed(4)}&lon=${location.longitude.toFixed(4)}&name=${encodeURIComponent(location.name)}`
                    : '/chase'
                }
                className="chip-btn icon-chip nav-chip hide-sm"
                title="Storm chasers"
                aria-label="Storm chasers"
              >
                🌪
              </Link>
            </nav>
            <SettingsBar
              units={units}
              theme={theme}
              density={density}
              severeMode={severeMode}
              stormMode={stormMode}
              notifyAlerts={notifyAlerts}
              quietHoursEnabled={quietHoursEnabled}
              quietStart={quietStart}
              quietEnd={quietEnd}
              isFavorite={isFavorite(location)}
              cloudSynced={cloudSynced}
              hasHome={Boolean(homeLocation)}
              isHome={isHome(location)}
              hasWork={Boolean(workLocation)}
              isWork={isWork(location)}
              onUnits={setUnits}
              onTheme={setTheme}
              onDensity={setDensity}
              onSevereMode={setSevereMode}
              onStormMode={setStormMode}
              onNotify={(v) => void setNotifyAlerts(v)}
              onQuietHours={setQuietHours}
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
              onGoWork={() => goWork()}
              onSetWork={() => {
                if (!location) return
                if (isWork(location)) setWorkLocation(null)
                else setWorkLocation(location)
              }}
              onShare={() => void onShare()}
              onRefresh={() => refresh()}
              onCloudSync={() => void syncNow()}
              onTestNotify={() => void onTestNotify()}
              pushStatusLabel={pushLabel}
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

        {/* Threat strip lives in the padded shell — not under the fixed top bar */}
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
            id="main-content"
            className={`dashboard ${stormMode ? 'dashboard-storm' : ''}`}
            tabIndex={-1}
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
                  onShare={() => void onShare()}
                />

                <TodayHero
                  weather={weather}
                  units={units}
                  placeName={
                    homeLocation && sameExactPlace(location, homeLocation)
                      ? 'Home'
                      : workLocation && sameExactPlace(location, workLocation)
                        ? 'Work'
                        : location.name
                  }
                  air={air}
                />

                <WhatChanged
                  location={location}
                  weather={weather}
                  alerts={activeAlerts}
                  units={units}
                />

                <WeekendBrief weather={weather} units={units} placeName={location.name} />

                {/* Compact alert action — full text only when expanded */}
                {!alertsMinimized && activeAlerts.length > 0 && (
                  <>
                    <WhatMattersNow
                      alerts={activeAlerts}
                      onOpenAlerts={() => {
                        document
                          .getElementById('alerts-panel')
                          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }}
                    />
                    <AlertTimeline
                      alerts={activeAlerts}
                      onOpenDetails={() => {
                        document
                          .getElementById('alerts-panel')
                          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }}
                    />
                  </>
                )}

                <div id="alerts-panel">
                  {!alertsMinimized && activeAlerts.length > 0 && (
                    <Alerts alerts={activeAlerts} />
                  )}
                </div>
              </div>

              <HourlyForecast weather={weather} units={units} />

              {/* One 7-day control (removed duplicate WeekStrip) */}
              <div className="daily-mobile-slot">
                <DailyForecast weather={weather} units={units} />
              </div>

              {radarBlock}

              <AllergySection air={air} weather={weather} />

              <>
                  <div className="outdoor-mobile-slot">
                    <SunMoon weather={weather} />
                    <AirQuality air={air} />
                  </div>

                  <OutdoorGlance weather={weather} units={units} air={air} />

                  {modPrefs.dress && (
                    <LazyPanel>
                      <DressForToday weather={weather} units={units} air={air} />
                    </LazyPanel>
                  )}

                  {/* Fire map only when risk elevated or user opts in */}
                  {(modPrefs.fireMap ||
                    (() => {
                      const fr = fireSmokeRisk(weather, air)
                      const aqi = air?.current?.us_aqi ?? 0
                      return (
                        fr.fireLevel === 'elevated' ||
                        fr.fireLevel === 'high' ||
                        aqi >= 100 ||
                        (fr.pm25 != null && fr.pm25 >= 35)
                      )
                    })()) && (
                    <Deferred
                      force={false}
                      rootMargin={isMobile ? '40px 0px' : '200px 0px'}
                      minHeight={isMobile ? 120 : 280}
                      placeholder={
                        <p className="muted-center">Smoke / fire map loads near view…</p>
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
                  )}

                  {modPrefs.videos && (
                    <Deferred force={false} rootMargin="120px 0px" minHeight={isMobile ? 120 : 200}>
                      <LazyPanel>
                        <WeatherVideos />
                      </LazyPanel>
                    </Deferred>
                  )}

                  {modPrefs.chat && (
                    <Deferred force={false} rootMargin="120px 0px" minHeight={isMobile ? 0 : 48}>
                      <LazyPanel>
                        <AreaChat location={location} />
                      </LazyPanel>
                    </Deferred>
                  )}

                  {modPrefs.shareCard && (
                    <Deferred force={false} rootMargin="100px 0px">
                      <LazyPanel>
                        <ShareWeatherCard weather={weather} location={location} units={units} />
                      </LazyPanel>
                    </Deferred>
                  )}

                  {/* Tropical only when active storms */}
                  {storms.length > 0 && (
                    <LazyPanel>
                      <Tropical storms={storms} onFocus={openStorm} />
                    </LazyPanel>
                  )}

                  <AdvancedSection title="More details" defaultOpen={false}>
                    <div className="advanced-grid">
                      <LazyPanel>
                        <PrecipTotals weather={weather} units={units} />
                        <VisibilityPanel weather={weather} units={units} air={air} />
                        {!isMobile && <StormRisk weather={weather} profile={profile} />}
                        <HourlyCharts weather={weather} units={units} />
                        <PrecipChart weather={weather} units={units} />
                        <ComfortPanel weather={weather} units={units} />
                        <LifestyleScores weather={weather} units={units} />
                        {!isMobile && (
                          <DayLastYear
                            weather={weather}
                            units={units}
                            lat={location.latitude}
                            lon={location.longitude}
                          />
                        )}
                        {(modPrefs.models || !isMobile) && models.length >= 2 && (
                          <ModelConfidence
                            models={models}
                            weather={weather}
                            units={units}
                          />
                        )}
                        {(modPrefs.models || !isMobile) && (
                          <ModelCompare models={models} units={units} timezone={weather.timezone} />
                        )}
                        {!isMobile && (
                          <CityCompare units={units} home={location} homeWeather={weather} />
                        )}
                      </LazyPanel>
                    </div>
                  </AdvancedSection>

                  {modPrefs.planning && (
                    <AdvancedSection title="Planning & environment" defaultOpen={false} id="advanced-planning-main">
                      <div className="advanced-grid">
                        <LazyPanel>
                          <ClimateCompare
                            weather={weather}
                            units={units}
                            lat={location.latitude}
                            lon={location.longitude}
                          />
                          <SnowOutlook weather={weather} units={units} />
                          <TripPlanner
                            weather={weather}
                            units={units}
                            placeName={location.name}
                            origin={location}
                          />
                          <OutlookTips weather={weather} units={units} />
                          <FireSmoke weather={weather} air={air} />
                          <Sounding profile={profile} units={units} timezone={weather.timezone} />
                        </LazyPanel>
                      </div>
                    </AdvancedSection>
                  )}

                  <AdvancedSection title="Customize home" defaultOpen={false} id="module-prefs">
                    <ModulePrefsPanel prefs={modPrefs} onChange={setModulePrefs} />
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

              <div className="daily-desktop-slot">
                <DailyForecast weather={weather} units={units} />
              </div>

              <div className="outdoor-desktop-slot">
                <SunMoon weather={weather} />
                <AirQuality air={air} />
              </div>

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
                {user && <p className="tiny">Signed in as {user.email}</p>}
              </footer>
            </aside>
          </main>
        )}
      </div>

      <FirstRunCoach
        weatherReady={Boolean(weather && location)}
        notifyOn={notifyAlerts}
        hasHome={Boolean(homeLocation)}
        onEnableNotify={() => setNotifyAlerts(true)}
      />
    </div>
  )
}
