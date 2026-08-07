import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './hooks/useAuth'
import { ErrorBoundary } from './components/ErrorBoundary'
import { I18nProvider } from './i18n/I18nProvider'
import { initNativeShell, isNativeApp } from './lib/native'
import { applyMobilePerfClass, loadAdSenseDeferred, scheduleIdle } from './utils/device'
import { detectLocale, saveLocale } from './i18n/messages'

// Document language early for a11y / SEO
try {
  saveLocale(detectLocale())
} catch {
  /* ignore */
}

applyMobilePerfClass()
if (typeof window !== 'undefined') {
  let resizeTimer = 0
  window.addEventListener(
    'resize',
    () => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => applyMobilePerfClass(), 200)
    },
    { passive: true },
  )
  // AdSense after first paint — huge win on mid-range phones
  if (import.meta.env.PROD) loadAdSenseDeferred()
}

void initNativeShell()

const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <I18nProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </I18nProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>,
  )
}

// Service worker: register after idle so it doesn't fight first weather fetch
if ('serviceWorker' in navigator && !isNativeApp() && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    scheduleIdle(() => {
      void navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          reg.update().catch(() => {})
          if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
        })
        .catch(() => {})
    }, 6000)
  })
}
