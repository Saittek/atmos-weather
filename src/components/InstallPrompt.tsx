import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface Props {
  compact?: boolean
}

const DISMISS_KEY = 'atmos-install-dismissed'

/**
 * Capture beforeinstallprompt and show an install CTA for the PWA.
 */
export function InstallPrompt({ compact }: Props) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    setIsStandalone(standalone)
    if (standalone) return

    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return
    } catch {
      /* ignore */
    }

    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onBip)
    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  if (isStandalone || !visible || !deferred) return null

  const install = async () => {
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
        <strong>Install Solara</strong>
        <span>
          {compact
            ? 'Add Rain Widget to your home screen for one-tap checks.'
            : 'Home screen app with Radar & Rain Widget shortcuts.'}
        </span>
      </div>
      <div className="install-prompt-actions">
        <button type="button" className="primary-btn install-btn" onClick={() => void install()}>
          Install
        </button>
        <button type="button" className="chip-btn" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  )
}
