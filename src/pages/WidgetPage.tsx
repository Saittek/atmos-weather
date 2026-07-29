import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWeather } from '../hooks/useWeather'
import { sameExactPlace } from '../hooks/useWeather'
import { useRainWatch } from '../hooks/useRainWatch'
import { RainNextHour } from '../components/RainNextHour'
import { NextHourHero } from '../components/NextHourHero'
import { getWeatherInfo } from '../utils/weatherCodes'
import { isDaytimeNow } from '../utils/daylight'
import { formatTemp } from '../utils/format'
import { locationKey } from '../api/weather'

import { InstallPrompt } from '../components/InstallPrompt'
import { todayDailyIndex } from '../utils/weatherStory'

/**
 * Compact installable home/rain widget — prefers exact home pin.
 * Route: /widget — Add to Home Screen from Safari/Chrome for a home icon.
 */
export default function WidgetPage() {
  const {
    location,
    weather,
    units,
    favorites,
    homeLocation,
    notifyAlerts,
    setNotifyAlerts,
    loadForLocation,
    goHome,
    requestMyLocation,
    refresh,
    loading,
    geoLoading,
  } = useWeather()

  const rainWatch = useRainWatch(favorites, notifyAlerts, location, homeLocation)
  const [tick, setTick] = useState(0)
  const [homed, setHomed] = useState(false)
  const [standalone, setStandalone] = useState(false)

  useEffect(() => {
    const s =
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    setStandalone(s)
    document.title = s ? 'Solara' : 'Solara · Weather widget'
    // iOS home-screen icon label hint
    const meta = document.querySelector('meta[name="apple-mobile-web-app-title"]')
    if (!meta) {
      const m = document.createElement('meta')
      m.name = 'apple-mobile-web-app-title'
      m.content = 'Solara'
      document.head.appendChild(m)
    }
  }, [])

  // Always prefer exact home when widget opens
  useEffect(() => {
    if (homed) return
    if (homeLocation) {
      setHomed(true)
      if (!sameExactPlace(location, homeLocation)) {
        void loadForLocation(homeLocation)
      }
    }
  }, [homeLocation, location, loadForLocation, homed])

  // Auto-refresh every 5 minutes while widget is open
  useEffect(() => {
    const id = window.setInterval(() => {
      refresh()
      void rainWatch.refresh()
      setTick((t) => t + 1)
    }, 5 * 60 * 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh])

  const enableNotify = useCallback(async () => {
    await setNotifyAlerts(true)
  }, [setNotifyAlerts])

  const info =
    weather != null
      ? getWeatherInfo(weather.current.weather_code, isDaytimeNow(weather))
      : null

  const rainyPins = rainWatch.snapshots.filter((s) => s.precipSoon)
  const atHome = sameExactPlace(location, homeLocation)
  const ti = weather ? todayDailyIndex(weather) : 0
  const high = weather?.daily.temperature_2m_max[ti]
  const low = weather?.daily.temperature_2m_min[ti]
  const pop = weather?.daily.precipitation_probability_max[ti] ?? 0

  return (
    <div className={`widget-page ${standalone ? 'widget-standalone' : ''}`}>
      {!standalone && <InstallPrompt compact />}
      <header className="widget-bar">
        {!standalone ? (
          <Link to="/" className="chip-btn">
            ← Full app
          </Link>
        ) : (
          <span className="widget-bar-spacer" aria-hidden />
        )}
        <strong className="widget-brand">
          {homeLocation ? '🏠 Solara' : '☔ Solara'}
        </strong>
        <button
          type="button"
          className="chip-btn"
          onClick={() => {
            if (homeLocation) goHome()
            else refresh()
          }}
          disabled={loading}
          title={homeLocation ? 'Reload home' : 'Refresh'}
        >
          {homeLocation ? '🏠' : '↻'}
        </button>
      </header>

      {rainWatch.banner && (
        <div className="widget-alert" role="status">
          {rainWatch.banner}
        </div>
      )}

      {!location && !homeLocation && (
        <div className="widget-empty">
          <p>Set a home pin or location to track rain.</p>
          <button type="button" className="primary-btn" onClick={requestMyLocation} disabled={geoLoading}>
            {geoLoading ? 'Locating…' : 'Use my location'}
          </button>
          <Link to="/" className="chip-btn">
            Open dashboard · set home
          </Link>
        </div>
      )}

      {weather && location && (
        <main className="widget-body">
          <section className="widget-hero">
            <div>
              <h1>
                {atHome ? '🏠 ' : ''}
                {location.name}
              </h1>
              <p className="widget-cond">
                {info?.icon} {info?.label} · {formatTemp(weather.current.temperature_2m, units)}
              </p>
              {high != null && low != null && (
                <p className="widget-hi-lo">
                  H {formatTemp(high, units)} · L {formatTemp(low, units)} · PoP{' '}
                  {Math.round(pop)}%
                </p>
              )}
              {homeLocation && !atHome && (
                <button type="button" className="chip-btn widget-home-chip" onClick={() => goHome()}>
                  Switch to home
                </button>
              )}
            </div>
            <Link
              to={`/radar?lat=${location.latitude.toFixed(4)}&lon=${location.longitude.toFixed(4)}&name=${encodeURIComponent(location.name)}`}
              className="chip-btn"
            >
              Radar
            </Link>
          </section>

          <NextHourHero
            weather={weather}
            units={units}
            placeName={atHome ? 'Home' : location.name}
            compact
          />
          <RainNextHour weather={weather} units={units} />

          {rainyPins.length > 0 && (
            <section className="panel widget-pins">
              <div className="panel-header">
                <h2>Rain near saved</h2>
              </div>
              <ul className="widget-pin-list">
                {rainyPins.map((s) => (
                  <li key={locationKey(s.location)}>
                    <button
                      type="button"
                      onClick={() => void loadForLocation(s.location)}
                    >
                      <strong>{s.location.name}</strong>
                      <span>
                        {s.rainStartsInMin != null && s.rainStartsInMin <= 5
                          ? 'Rain now'
                          : `~${s.rainStartsInMin ?? '?'} min`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {favorites.length > 0 && rainyPins.length === 0 && (
            <p className="widget-foot-note">All saved places look dry for now.</p>
          )}

          {!notifyAlerts && (
            <button type="button" className="primary-btn widget-notify-btn" onClick={() => void enableNotify()}>
              Enable home rain &amp; alert notifications
            </button>
          )}

          <p className="widget-stamp" key={tick}>
            {homeLocation ? 'Home widget' : 'Widget'} · auto-refresh 5 min ·{' '}
            {new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </p>
        </main>
      )}
    </div>
  )
}
