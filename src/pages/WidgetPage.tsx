import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWeather } from '../hooks/useWeather'
import { useRainWatch } from '../hooks/useRainWatch'
import { RainNextHour } from '../components/RainNextHour'
import { getWeatherInfo } from '../utils/weatherCodes'
import { formatTemp } from '../utils/format'
import { locationKey } from '../api/weather'
import { InstallPrompt } from '../components/InstallPrompt'

/**
 * Compact installable rain widget — designed for home-screen / PWA shortcut.
 * Route: /widget
 */
export default function WidgetPage() {
  const {
    location,
    weather,
    units,
    favorites,
    notifyAlerts,
    setNotifyAlerts,
    loadForLocation,
    requestMyLocation,
    refresh,
    loading,
    geoLoading,
  } = useWeather()

  const rainWatch = useRainWatch(favorites, notifyAlerts, location)
  const [tick, setTick] = useState(0)

  // Auto-refresh every 5 minutes while widget is open
  useEffect(() => {
    const id = window.setInterval(() => {
      refresh()
      void rainWatch.refresh()
      setTick((t) => t + 1)
    }, 5 * 60 * 1000)
    return () => clearInterval(id)
    // rainWatch.refresh is stable enough via favorites; avoid re-binding loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh])

  const enableNotify = useCallback(async () => {
    await setNotifyAlerts(true)
  }, [setNotifyAlerts])

  const info =
    weather != null
      ? getWeatherInfo(weather.current.weather_code, weather.current.is_day === 1)
      : null

  const rainyPins = rainWatch.snapshots.filter((s) => s.precipSoon)

  return (
    <div className="widget-page" data-theme="dark">
      <InstallPrompt compact />
      <header className="widget-bar">
        <Link to="/" className="chip-btn">
          ← Full app
        </Link>
        <strong className="widget-brand">☔ Solara Rain</strong>
        <button
          type="button"
          className="chip-btn"
          onClick={() => refresh()}
          disabled={loading}
          title="Refresh"
        >
          ↻
        </button>
      </header>

      {rainWatch.banner && (
        <div className="widget-alert" role="status">
          {rainWatch.banner}
        </div>
      )}

      {!location && (
        <div className="widget-empty">
          <p>Set a location to track rain.</p>
          <button type="button" className="primary-btn" onClick={requestMyLocation} disabled={geoLoading}>
            {geoLoading ? 'Locating…' : 'Use my location'}
          </button>
          <Link to="/" className="chip-btn">
            Open dashboard
          </Link>
        </div>
      )}

      {weather && location && (
        <main className="widget-body">
          <section className="widget-hero">
            <div>
              <h1>{location.name}</h1>
              <p className="widget-cond">
                {info?.icon} {info?.label} · {formatTemp(weather.current.temperature_2m, units)}
              </p>
            </div>
            <Link
              to={`/radar?lat=${location.latitude.toFixed(4)}&lon=${location.longitude.toFixed(4)}&name=${encodeURIComponent(location.name)}`}
              className="chip-btn"
            >
              Radar
            </Link>
          </section>

          <RainNextHour weather={weather} units={units} />

          {rainyPins.length > 0 && (
            <section className="panel widget-pins">
              <div className="panel-header">
                <h2>Rain near pins</h2>
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
            <p className="widget-foot-note">All pinned places look dry for now.</p>
          )}

          {!notifyAlerts && (
            <button type="button" className="primary-btn widget-notify-btn" onClick={() => void enableNotify()}>
              Enable rain notifications
            </button>
          )}

          <p className="widget-stamp" key={tick}>
            Widget mode · auto-refresh 5 min ·{' '}
            {new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </p>
        </main>
      )}
    </div>
  )
}
