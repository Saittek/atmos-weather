import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './hooks/useAuth'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initNativeShell, isNativeApp } from './lib/native'
import { applyMobilePerfClass } from './utils/device'

applyMobilePerfClass()
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => applyMobilePerfClass(), { passive: true })
}

void initNativeShell()

const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>,
  )
}

// Service worker: production browser only. Force update so mobile leaves stale shells.
if ('serviceWorker' in navigator && !isNativeApp() && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        reg.update().catch(() => {})
        // If a new worker is waiting, activate it
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing
          if (!nw) return
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              // Soft-reload once so mobile picks up the fixed shell
              try {
                if (!sessionStorage.getItem('solara-sw-reloaded')) {
                  sessionStorage.setItem('solara-sw-reloaded', '1')
                  window.location.reload()
                }
              } catch {
                /* ignore */
              }
            }
          })
        })
      })
      .catch(() => {
        /* ignore SW errors */
      })
  })
}
