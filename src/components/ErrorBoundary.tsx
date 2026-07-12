import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
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
    console.error('Atmos UI error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <h1>Something went wrong</h1>
          <p>{this.state.error.message}</p>
          <button
            type="button"
            className="primary-btn"
            onClick={() => {
              this.setState({ error: null })
              window.location.href = '/'
            }}
          >
            Reload Atmos
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
