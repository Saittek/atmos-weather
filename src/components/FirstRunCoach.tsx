/**
 * After first successful forecast: coach for install + notifications + widget.
 */
import { useEffect, useState } from 'react'
import { InstallPrompt } from './InstallPrompt'
import { isNativeApp, isIOS } from '../lib/native'

const SEEN_KEY = 'solara-first-coach-v1'
const READY_KEY = 'solara-first-weather-ok'

interface Props {
  /** True once weather has loaded successfully at least once this session / ever */
  weatherReady: boolean
  notifyOn: boolean
  onEnableNotify: () => void | Promise<boolean | void>
  hasHome: boolean
  hasWork?: boolean
}

export function markFirstWeatherOk(): void {
  try {
    localStorage.setItem(READY_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function FirstRunCoach({
  weatherReady,
  notifyOn,
  onEnableNotify,
  hasHome,
  hasWork = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!weatherReady) return
    try {
      if (localStorage.getItem(SEEN_KEY) === '1') return
      // Need evidence of a successful load
      if (localStorage.getItem(READY_KEY) !== '1' && !weatherReady) return
      setOpen(true)
    } catch {
      /* ignore */
    }
  }, [weatherReady])

  const dismiss = () => {
    setOpen(false)
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  if (!open) return null

  const nativeIos = isNativeApp() && isIOS()
  const steps = [
    {
      title: 'You’re set',
      body: hasHome
        ? 'Home is pinned. Solara will keep this place ready on open and on the widget.'
        : 'Set Home with the 🏠 on the place card so alerts, rain watch, and the widget use your pin.',
    },
    {
      title: 'Modes on your phone',
      body: nativeIos
        ? 'Under Today at a glance you’ll see Radar · Stargaze · Earth · Chase. Or open ⚙ Settings → Explore. (Top-bar icons hide on small screens.)'
        : 'Use the modes row under Today, or ⚙ Settings → Explore for Radar, Stargaze, Earth, and Storm desk.',
    },
    {
      title: 'Home & Work',
      body: hasWork
        ? 'Work is saved too — jump there from Settings when you need commute weather.'
        : 'Optional: open your office/school and use Settings → Work pin for commute rain watch.',
    },
    {
      title: 'Alerts when closed',
      body: notifyOn
        ? 'Notifications are on. Sign in so server push works when the app is closed.'
        : 'Turn on Notify for rain watch and severe alerts — works best when signed in.',
      action: !notifyOn
        ? {
            label: 'Enable notifications',
            run: async () => {
              await onEnableNotify()
            },
          }
        : undefined,
    },
    {
      title: nativeIos ? 'Home Screen widget' : 'Install Solara',
      body: nativeIos
        ? 'Long-press Home Screen → Add Widget → Solara Weather for temp, rain timing, UV, and a day tip. Open the app once so the tile fills in.'
        : 'Install to your home screen for one-tap weather (PWA). On iPhone Safari: Share → Add to Home Screen.',
    },
    {
      title: 'Stargaze ✨',
      body: 'Plan the night: sky score, moon, Bortle, ISS, and clear-sky timing. Tap ✨ Stargaze on the modes row or in Settings → Explore.',
    },
  ]

  const s = steps[step] ?? steps[0]

  return (
    <div className="first-run-coach" role="dialog" aria-label="Getting started with Solara">
      <div className="first-run-coach-card">
        <p className="first-run-kicker">
          Getting started · {step + 1}/{steps.length}
        </p>
        <h2>{s.title}</h2>
        <p>{s.body}</p>
        {step === 4 && !nativeIos && (
          <div className="first-run-install">
            <InstallPrompt compact />
          </div>
        )}
        <div className="first-run-actions">
          {s.action && (
            <button
              type="button"
              className="primary-btn"
              onClick={() => void s.action?.run()}
            >
              {s.action.label}
            </button>
          )}
          {step < steps.length - 1 ? (
            <button type="button" className="chip-btn" onClick={() => setStep((n) => n + 1)}>
              Next
            </button>
          ) : (
            <button type="button" className="primary-btn" onClick={dismiss}>
              Done
            </button>
          )}
          <button type="button" className="chip-btn" onClick={dismiss}>
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}
