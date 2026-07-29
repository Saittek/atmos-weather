import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import './theme-light.css'
import { applyTheme, bootstrapTheme, readStoredTheme } from './lib/theme'
import { trackPageView } from './lib/analytics'

// Apply before first paint of lazy routes (dashboard is not the only entry)
bootstrapTheme()

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const RadarPage = lazy(() => import('./pages/RadarPage'))
const GlobePage = lazy(() => import('./pages/GlobePage'))
const WidgetPage = lazy(() => import('./pages/WidgetPage'))
const StormChaserPage = lazy(() => import('./pages/StormChaserPage'))

function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      <div className="spinner large" />
      <p>Loading Solara…</p>
    </div>
  )
}

/** Keep html[data-theme] in sync on every route (incl. auto / system changes). */
function ThemeSync() {
  useEffect(() => {
    const apply = () => applyTheme(readStoredTheme())
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onScheme = () => {
      if (readStoredTheme() === 'auto') apply()
    }
    mq.addEventListener('change', onScheme)
    // Other tabs / settings writes
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'atmos-weather-prefs-v2') apply()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      mq.removeEventListener('change', onScheme)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  return null
}

/** Privacy-light page views (path buckets only). */
function AnalyticsRoute() {
  const loc = useLocation()
  useEffect(() => {
    trackPageView(loc.pathname)
  }, [loc.pathname])
  return null
}

export default function App() {
  return (
    <>
      <ThemeSync />
      <AnalyticsRoute />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/radar" element={<RadarPage />} />
          <Route path="/globe" element={<GlobePage />} />
          <Route path="/earth" element={<GlobePage />} />
          <Route path="/chase" element={<StormChaserPage />} />
          <Route path="/storm" element={<StormChaserPage />} />
          <Route path="/widget" element={<WidgetPage />} />
          <Route path="/w" element={<DashboardPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  )
}
