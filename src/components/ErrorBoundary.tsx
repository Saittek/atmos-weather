import { Component, type ErrorInfo, type ReactNode } from 'react'
import { trackClientError } from '../lib/analytics'

interface Props {
  children: ReactNode
  /** Compact inline fallback (radar / maps) instead of a full-page crash */
  compact?: boolean
  label?: string
}

interface State {
  error: Error | null
}

/** Catch render crashes so the whole app doesn’t white-screen */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Solara UI error:', error, info.componentStack)
    try {
      trackClientError(error.message || 'render', 'error-boundary')
    } catch {
      /* ignore */
    }
  }

  private retry = () => {
    this.setState({ error: null })
  }

  private hardReload = () => {
    this.setState({ error: null })
    try {
      // Drop possible bad SW caches, then hard reload home
      if ('serviceWorker' in navigator) {
        void navigator.serviceWorker.getRegistrations().then((regs) => {
          for (const r of regs) void r.unregister()
        })
      }
      if ('caches' in window) {
        void caches.keys().then((keys) => {
          for (const k of keys) void caches.delete(k)
        })
      }
    } catch {
      /* ignore */
    }
    window.location.assign('/')
  }

  render() {
    if (this.state.error) {
      if (this.props.compact) {
        return (
          <div className="panel-error-boundary" role="alert">
            <p>{this.props.label || 'This panel hit a problem.'}</p>
            <span>{this.state.error.message || 'Unexpected UI error'}</span>
            <button type="button" className="chip-btn" onClick={this.retry}>
              Try again
            </button>
          </div>
        )
      }
      return (
        <div className="error-boundary">
          <h1>Something went wrong</h1>
          <p>{this.state.error.message || 'Unexpected UI error'}</p>
          <div className="error-boundary-actions">
            <button type="button" className="primary-btn" onClick={this.retry}>
              Try again
            </button>
            <button type="button" className="chip-btn" onClick={this.hardReload}>
              Reload Solara
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
