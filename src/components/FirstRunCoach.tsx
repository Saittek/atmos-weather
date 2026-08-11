/**
 * Single first-run tour: product intro + home/modes/notify/widget/stargaze.
 * Replaces separate Onboarding + coach overlays.
 */
import { useEffect, useState } from 'react'
import { InstallPrompt } from './InstallPrompt'
import { isNativeApp, isIOS } from '../lib/native'
import { useI18n } from '../i18n/I18nProvider'

const SEEN_KEY = 'solara-first-coach-v1'
/** Legacy onboarding key — also marked done so old clients stay quiet */
const ONBOARD_KEY = 'solara-onboarding-v1'
const READY_KEY = 'solara-first-weather-ok'

interface Props {
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

function alreadySeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return true
  }
}

function markAllSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1')
    localStorage.setItem(ONBOARD_KEY, '1')
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
  const { t, te } = useI18n()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!weatherReady) return
    if (alreadySeen()) return
    try {
      if (localStorage.getItem(READY_KEY) !== '1' && !weatherReady) return
      // Slight delay so first paint / weather card show before tour
      const id = window.setTimeout(() => setOpen(true), 500)
      return () => window.clearTimeout(id)
    } catch {
      /* ignore */
    }
  }, [weatherReady])

  const dismiss = () => {
    setOpen(false)
    markAllSeen()
  }

  if (!open) return null

  const nativeIos = isNativeApp() && isIOS()
  const steps: {
    emoji?: string
    title: string
    body: string
    action?: { label: string; run: () => void | Promise<void> }
  }[] = [
    // Former Onboarding steps
    {
      emoji: '☀️',
      title: te('coach.ob1Title'),
      body: te('coach.ob1Body'),
    },
    {
      emoji: '📡',
      title: te('coach.ob2Title'),
      body: te('coach.ob2Body'),
    },
    {
      emoji: '🏠',
      title: te('coach.ob3Title'),
      body: te('coach.ob3Body'),
    },
    // Former FirstRunCoach steps
    {
      title: t('coach.set'),
      body: hasHome ? t('coach.setHomeDone') : t('coach.setHome'),
    },
    {
      title: t('coach.modes'),
      body: t('coach.modesBody'),
    },
    {
      title: t('coach.homeWork'),
      body: hasWork ? t('coach.homeWorkDone') : t('coach.homeWorkBody'),
    },
    {
      title: t('coach.alerts'),
      body: notifyOn ? t('coach.alertsOn') : t('coach.alertsOff'),
      action: !notifyOn
        ? {
            label: t('coach.enableNotify'),
            run: async () => {
              await onEnableNotify()
            },
          }
        : undefined,
    },
    {
      title: nativeIos ? t('coach.widget') : t('coach.install'),
      body: nativeIos ? t('coach.widgetBody') : t('coach.installBody'),
    },
    {
      title: t('coach.stargaze'),
      body: t('coach.stargazeBody'),
    },
  ]

  const s = steps[step] ?? steps[0]
  const last = step >= steps.length - 1
  // Install prompt on the install/widget step (index 7 with 9 steps)
  const installStepIndex = 7

  return (
    <div
      className="first-run-coach"
      role="dialog"
      aria-label={t('coach.kicker', { n: step + 1, total: steps.length })}
    >
      <div className="first-run-coach-card">
        <p className="first-run-kicker">
          {t('coach.kicker', { n: step + 1, total: steps.length })}
        </p>
        {s.emoji && (
          <div className="onboard-emoji" aria-hidden style={{ fontSize: '2rem', marginBottom: '0.35rem' }}>
            {s.emoji}
          </div>
        )}
        <h2>{s.title}</h2>
        <p>{s.body}</p>
        {step === installStepIndex && !nativeIos && (
          <div className="first-run-install">
            <InstallPrompt compact />
          </div>
        )}
        <div className="first-run-actions">
          {s.action && (
            <button type="button" className="primary-btn" onClick={() => void s.action?.run()}>
              {s.action.label}
            </button>
          )}
          {!last ? (
            <>
              <button type="button" className="chip-btn" onClick={dismiss}>
                {t('coach.skip')}
              </button>
              <button type="button" className="primary-btn" onClick={() => setStep((n) => n + 1)}>
                {t('coach.next')}
              </button>
            </>
          ) : (
            <button type="button" className="primary-btn" onClick={dismiss}>
              {te('coach.letsGo')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
