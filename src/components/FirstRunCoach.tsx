/**
 * After first successful forecast: coach for install + notifications + widget.
 */
import { useEffect, useState } from 'react'
import { InstallPrompt } from './InstallPrompt'
import { isNativeApp, isIOS } from '../lib/native'
import { useI18n } from '../i18n/I18nProvider'

const SEEN_KEY = 'solara-first-coach-v1'
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

export function FirstRunCoach({
  weatherReady,
  notifyOn,
  onEnableNotify,
  hasHome,
  hasWork = false,
}: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!weatherReady) return
    try {
      if (localStorage.getItem(SEEN_KEY) === '1') return
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
  const steps: {
    title: string
    body: string
    action?: { label: string; run: () => void | Promise<void> }
  }[] = [
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

  return (
    <div className="first-run-coach" role="dialog" aria-label={t('coach.kicker', { n: 1, total: steps.length })}>
      <div className="first-run-coach-card">
        <p className="first-run-kicker">
          {t('coach.kicker', { n: step + 1, total: steps.length })}
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
            <button type="button" className="primary-btn" onClick={() => void s.action?.run()}>
              {s.action.label}
            </button>
          )}
          {step < steps.length - 1 ? (
            <button type="button" className="chip-btn" onClick={() => setStep((n) => n + 1)}>
              {t('coach.next')}
            </button>
          ) : (
            <button type="button" className="primary-btn" onClick={dismiss}>
              {t('coach.done')}
            </button>
          )}
          <button type="button" className="chip-btn" onClick={dismiss}>
            {t('coach.skip')}
          </button>
        </div>
      </div>
    </div>
  )
}
