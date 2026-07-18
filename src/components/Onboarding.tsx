import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { isNativeApp } from '../lib/native'

const KEY = 'solara-onboarding-v1'

const STEPS = [
  {
    emoji: '☀️',
    title: 'Weather that answers first',
    body: 'See if you’ll get wet, what to wear, and the next few hours — before the deep charts.',
  },
  {
    emoji: '📡',
    title: 'Radar when you need it',
    body: 'Live radar stays light on battery. Open it anytime — it auto-opens when rain risk is high.',
  },
  {
    emoji: '🏠',
    title: 'Home screen rain widget',
    body: 'Add the Rain Widget for one-tap checks. On iPhone: Share → Add to Home Screen from the widget page.',
  },
] as const

export function Onboarding() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === '1') return
    } catch {
      return
    }
    // Native apps still get a short tour; delay so weather paints first
    const t = window.setTimeout(() => setOpen(true), 600)
    return () => window.clearTimeout(t)
  }, [])

  const finish = () => {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* ignore */
    }
    setOpen(false)
  }

  if (!open || typeof document === 'undefined') return null

  const s = STEPS[step]
  const last = step >= STEPS.length - 1
  const iosHint =
    !isNativeApp() &&
    /iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    step === 2

  return createPortal(
    <div className="onboard-overlay" role="dialog" aria-modal="true" aria-labelledby="onboard-title">
      <button type="button" className="onboard-backdrop" aria-label="Skip" onClick={finish} />
      <div className="onboard-card">
        <div className="onboard-progress" aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className={i <= step ? 'on' : ''} />
          ))}
        </div>
        <div className="onboard-emoji" aria-hidden>
          {s.emoji}
        </div>
        <h2 id="onboard-title">{s.title}</h2>
        <p>{s.body}</p>
        {iosHint && (
          <p className="onboard-ios-hint">
            Safari → <strong>Share</strong> → <strong>Add to Home Screen</strong> on{' '}
            <Link to="/widget" onClick={finish}>
              Rain Widget
            </Link>
            .
          </p>
        )}
        <div className="onboard-actions">
          {!last ? (
            <>
              <button type="button" className="chip-btn" onClick={finish}>
                Skip
              </button>
              <button type="button" className="primary-btn" onClick={() => setStep((n) => n + 1)}>
                Next
              </button>
            </>
          ) : (
            <button type="button" className="primary-btn onboard-done" onClick={finish}>
              Let’s go
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
