import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import './App.css'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const RadarPage = lazy(() => import('./pages/RadarPage'))
const WidgetPage = lazy(() => import('./pages/WidgetPage'))

function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      <div className="spinner large" />
      <p>Loading Solara…</p>
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/radar" element={<RadarPage />} />
        <Route path="/widget" element={<WidgetPage />} />
        <Route path="/w" element={<DashboardPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
