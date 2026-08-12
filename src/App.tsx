import { lazy, Suspense, useEffect, useLayoutEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import './theme-light.css'
/* Redesign: tokens + atmospheric glass layer (must load after legacy CSS) */
import './styles/tokens.css'
import './styles/redesign.css'
import './styles/redesign-m2m3.css'
import './styles/redesign-m4.css'
import { applyTheme, bootstrapTheme, readStoredTheme } from './lib/theme'
import { trackPageView } from './lib/analytics'
import { detectLocale, t as translate } from './i18n/messages'

// Apply before first paint of lazy routes (dashboard is not the only entry)
bootstrapTheme()

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const RadarPage = lazy(() => import('./pages/RadarPage'))
const GlobePage = lazy(() => import('./pages/GlobePage'))
const StormChaserPage = lazy(() => import('./pages/StormChaserPage'))
const StargazePage = lazy(() => import('./pages/StargazePage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))

function RouteFallback() {
  const msg = translate(detectLocale(), 'app.loading')
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      <div className="spinner large" />
      <p>{msg}</p>
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

/** Reset scroll on path change (SPA navigations feel snappier / less janky). */
function ScrollToTop() {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    // Full-screen map routes own their own scroll lock — don't fight them
    if (pathname === '/radar' || pathname === '/globe' || pathname === '/earth') return
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <>
      <ThemeSync />
      <ScrollToTop />
      <AnalyticsRoute />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/radar" element={<RadarPage />} />
          <Route path="/globe" element={<GlobePage />} />
          <Route path="/earth" element={<GlobePage />} />
          <Route path="/chase" element={<StormChaserPage />} />
          <Route path="/storm" element={<StormChaserPage />} />
          <Route path="/stargaze" element={<StargazePage />} />
          <Route path="/astro" element={<StargazePage />} />
          <Route path="/stars" element={<StargazePage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/forgot-password" element={<ResetPasswordPage />} />
          <Route path="/widget" element={<Navigate to="/" replace />} />
          <Route path="/w" element={<DashboardPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  )
}
