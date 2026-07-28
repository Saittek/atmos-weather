/**
 * Guide: add Solara to the home screen.
 * - Native iOS app: real WidgetKit (Edit → Add Widget → Solara Weather)
 * - Safari/Chrome: PWA “Add to Home Screen” shortcut to /widget
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { isIOS, isNativeApp } from '../lib/native'

type Platform = 'ios-safari' | 'ios-native' | 'android' | 'desktop'

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop'
  if (isNativeApp() && isIOS()) return 'ios-native'
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios-safari'
  return 'desktop'
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  )
}

interface Props {
  /** Compact card for dashboard; full for /widget page */
  compact?: boolean
}

export function HomeScreenWidget({ compact = false }: Props) {
  const [platform, setPlatform] = useState<Platform>('desktop')
  const [standalone, setStandalone] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setPlatform(detectPlatform())
    setStandalone(isStandalone())
  }, [])

  const widgetUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/widget`
      : 'https://solaraweather.com/widget'

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(widgetUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  if (standalone) {
    return (
      <section className={`panel homescreen-widget-card is-installed ${compact ? 'compact' : ''}`}>
        <div className="panel-header">
          <h2>📱 Home screen</h2>
          <span className="panel-hint">Installed</span>
        </div>
        <p className="homescreen-widget-lead">
          You&apos;re running Solara from the home screen. Open the rain widget anytime from the
          icon, or pin a second shortcut to the widget page.
        </p>
        <Link to="/widget" className="primary-btn homescreen-widget-cta">
          Open weather widget
        </Link>
      </section>
    )
  }

  return (
    <section
      className={`panel homescreen-widget-card ${compact ? 'compact' : ''}`}
      aria-label="Add weather widget to home screen"
    >
      <div className="panel-header">
        <h2>📱 Home screen widget</h2>
        <span className="panel-hint">One tap</span>
      </div>

      <p className="homescreen-widget-lead">
        Add a Solara icon to your phone home screen for instant weather and home rain checks — no App
        Store update required for the web shortcut.
      </p>

      {platform === 'ios-safari' && (
        <ol className="homescreen-steps">
          <li>
            Open <Link to="/widget">Weather widget</Link> in <strong>Safari</strong> (not Chrome).
          </li>
          <li>
            Tap the <strong>Share</strong> button (square with ↑).
          </li>
          <li>
            Scroll and tap <strong>Add to Home Screen</strong>.
          </li>
          <li>
            Name it <strong>Solara</strong> or <strong>Weather</strong> → <strong>Add</strong>.
          </li>
        </ol>
      )}

      {platform === 'ios-native' && (
        <ol className="homescreen-steps">
          <li>
            Open Solara once and set your <strong>Home</strong> place (or load your city) so weather is
            saved for the widget.
          </li>
          <li>
            On the Home Screen: long-press → <strong>Edit</strong> → <strong>Add Widget</strong>.
          </li>
          <li>
            Search <strong>Solara</strong> → pick <strong>Small</strong> or <strong>Medium</strong> →
            Add.
          </li>
          <li>Tap the tile anytime to open the app. It refreshes when you open Solara or about every 45 minutes.</li>
        </ol>
      )}

      {platform === 'android' && (
        <ol className="homescreen-steps">
          <li>
            Open <Link to="/widget">Weather widget</Link> in Chrome.
          </li>
          <li>
            Tap the menu (⋮) → <strong>Install app</strong> or <strong>Add to Home screen</strong>.
          </li>
          <li>Confirm — Solara appears as an app icon.</li>
          <li>Long-press the icon for shortcuts: Radar, Rain widget, Dashboard.</li>
        </ol>
      )}

      {platform === 'desktop' && (
        <ol className="homescreen-steps">
          <li>On your phone, open Safari (iPhone) or Chrome (Android).</li>
          <li>
            Go to <code className="homescreen-url">solaraweather.com/widget</code>
          </li>
          <li>
            iPhone: Share → <strong>Add to Home Screen</strong>
            <br />
            Android: Menu → <strong>Install app</strong> / Add to Home screen
          </li>
        </ol>
      )}

      <div className="homescreen-widget-actions">
        <Link to="/widget" className="primary-btn homescreen-widget-cta">
          Open weather widget
        </Link>
        <button type="button" className="chip-btn" onClick={() => void copyLink()}>
          {copied ? 'Link copied' : 'Copy widget link'}
        </button>
      </div>
    </section>
  )
}
