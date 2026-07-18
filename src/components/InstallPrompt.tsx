import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface Props {
  compact?: boolean
}

const DISMISS_KEY = 'atmos-install-dismissed'

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOS = /iPhone|iPad|iPod/i.test(ua)
  const webkit = /WebKit/i.test(ua)
  const chrome = /CriOS|FxiOS|EdgiOS/i.test(ua)
  return iOS && webkit && !chrome
}

/**
 * Capture beforeinstallprompt and show an install CTA for the PWA.
 * On iOS Safari, show manual “Add to Home Screen” steps (no BIP event).
 */
export function InstallPrompt({ compact }: Props) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [iosGuide, setIosGuide] = useState(false)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    setIsStandalone(standalone)
    if (standalone) return

    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return
    } catch {
      /* ignore */
    }

    if (isIosSafari()) {
      setIosGuide(true)
      setVisible(true)
      return
    }

    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onBip)
    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  if (isStandalone || !visible) return null
  if (!deferred && !iosGuide) return null

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    try {
      await deferred.userChoice
    } catch {
      /* ignore */
    }
    setDeferred(null)
    setVisible(false)
  }

  const dismiss = () => {
    setVisible(false)
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  return (
    <div className={`install-prompt ${compact ? 'compact' : ''}`} role="dialog" aria-label="Install Solara">
      <div className="install-prompt-text">
        <strong>{iosGuide ? 'Add Solara to Home Screen' : 'Install Solara'}</strong>
        <span>
          {iosGuide
            ? compact
              ? 'Safari → Share → Add to Home Screen for a rain widget icon.'
              : 'On iPhone: tap Share, then Add to Home Screen. Or open the Rain Widget page for a compact icon.'
            : compact
              ? 'Add Rain Widget to your home screen for one-tap checks.'
              : 'Home screen app with Radar & Rain Widget shortcuts.'}
        </span>
        {iosGuide && (
          <Link to="/widget" className="install-widget-link" onClick={dismiss}>
            Open rain widget →
          </Link>
        )}
      </div>
      <div className="install-prompt-actions">
        {deferred && (
          <button type="button" className="primary-btn install-btn" onClick={() => void install()}>
            Install
          </button>
        )}
        <button type="button" className="chip-btn" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  )
}
