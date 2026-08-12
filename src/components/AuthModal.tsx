import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { forgotPassword, getRememberedEmail } from '../api/auth'
import { useAuth } from '../hooks/useAuth'
import { useI18n } from '../i18n/I18nProvider'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

type Mode = 'login' | 'register' | 'forgot'

export function AuthModal({ open, onClose, onSuccess }: Props) {
  const { login, register } = useAuth()
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState(() => getRememberedEmail() ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

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
    setInfo(null)
    try {
      if (mode === 'forgot') {
        const res = await forgotPassword(email.trim())
        setInfo(res.message)
        return
      }
      if (mode === 'register' && password.length < 8) {
        throw new Error('Password must be at least 8 characters')
      }
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
    <div className="auth-overlay redesign-auth" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button type="button" className="auth-backdrop" aria-label="Close" onClick={onClose} />
      <div className="auth-modal">
        <div className="auth-header">
          <h2 id="auth-title">
            {mode === 'login'
              ? t('auth.welcome')
              : mode === 'forgot'
                ? t('auth.forgot')
                : t('auth.create')}
          </h2>
          <button type="button" className="auth-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="auth-sub">
          {mode === 'forgot' ? t('auth.resetHint') : t('auth.sub')}
        </p>

        {mode !== 'forgot' && (
          <div className="auth-tabs">
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => {
                setMode('login')
                setError(null)
                setInfo(null)
              }}
            >
              {t('auth.signIn')}
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'active' : ''}
              onClick={() => {
                setMode('register')
                setError(null)
                setInfo(null)
              }}
            >
              {t('auth.create')}
            </button>
          </div>
        )}

        <form className="auth-form" onSubmit={(e) => void submit(e)}>
          {mode === 'register' && (
            <label>
              {t('auth.name')}
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          <label>
            {t('auth.email')}
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {mode !== 'forgot' && (
            <label>
              {t('auth.password')}
              <input
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          {info && (
            <p className="auth-success" role="status">
              {info}
            </p>
          )}

          <button type="submit" className="primary-btn auth-submit" disabled={busy}>
            {busy
              ? t('auth.wait')
              : mode === 'login'
                ? t('auth.signIn')
                : mode === 'forgot'
                  ? t('auth.resetSend')
                  : t('auth.create')}
          </button>
        </form>

        {mode === 'login' && (
          <p className="auth-foot">
            <button
              type="button"
              className="auth-link-btn"
              onClick={() => {
                setMode('forgot')
                setError(null)
                setInfo(null)
              }}
            >
              {t('auth.forgot')}
            </button>
            {' · '}
            <Link to="/reset-password" onClick={onClose}>
              {t('auth.fullReset')}
            </Link>
          </p>
        )}
        {mode === 'forgot' && (
          <p className="auth-foot">
            <button
              type="button"
              className="auth-link-btn"
              onClick={() => {
                setMode('login')
                setError(null)
                setInfo(null)
              }}
            >
              {t('auth.backSignIn')}
            </button>
          </p>
        )}
        {mode === 'register' && <p className="auth-foot">{t('auth.hashed')}</p>}
      </div>
    </div>,
    document.body,
  )
}
