import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { getRememberedEmail } from '../api/auth'
import { useAuth } from '../hooks/useAuth'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

type Mode = 'login' | 'register'

export function AuthModal({ open, onClose, onSuccess }: Props) {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState(() => getRememberedEmail() ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Prefill remembered email each time the modal opens
  useEffect(() => {
    if (!open) return
    const remembered = getRememberedEmail()
    if (remembered) setEmail(remembered)
  }, [open])

  // Lock body scroll + Esc to close while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'login') {
        await login(email.trim(), password)
      } else {
        await register(email.trim(), password, name.trim())
      }
      onSuccess()
      onClose()
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="auth-overlay" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button type="button" className="auth-backdrop" aria-label="Close" onClick={onClose} />
      <div className="auth-modal">
        <div className="auth-header">
          <h2 id="auth-title">{mode === 'login' ? 'Welcome back' : 'Create account'}</h2>
          <button type="button" className="auth-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="auth-sub">
          Sync home pin, favorites, last place, units, and theme across desktop and phone.
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => {
              setMode('login')
              setError(null)
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => {
              setMode('register')
              setError(null)
            }}
          >
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={(e) => void submit(e)}>
          {mode === 'register' && (
            <label>
              Name
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </label>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="primary-btn auth-submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="auth-foot">
          Accounts are stored on your Solara server. Passwords are hashed — never stored
          plain text.
        </p>
      </div>
    </div>,
    document.body,
  )
}
