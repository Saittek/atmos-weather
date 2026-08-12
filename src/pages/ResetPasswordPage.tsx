/**
 * /reset-password?token=… — complete email reset flow
 */
import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { forgotPassword, resetPassword } from '../api/auth'
import { useI18n } from '../i18n/I18nProvider'

export default function ResetPasswordPage() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const token = useMemo(() => (params.get('token') || '').trim(), [params])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const requestLink = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const res = await forgotPassword(email.trim())
      setMsg(res.message)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  const submitNew = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      if (password.length < 8) throw new Error('Password must be at least 8 characters')
      const res = await resetPassword(token, password)
      setMsg(res.message)
      setDone(true)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Reset failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app reset-password-page solara-redesign-m4">
      <header className="topbar reset-topbar">
        <Link to="/" className="chip-btn">
          ← Solara
        </Link>
      </header>
      <main className="reset-password-main">
        <div className="auth-modal reset-card">
          <h1>{token ? 'Choose a new password' : t('auth.forgot')}</h1>
          {!token ? (
            <>
              <p className="auth-sub">{t('auth.resetHint')}</p>
              <form className="auth-form" onSubmit={(e) => void requestLink(e)}>
                <label>
                  Email
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>
                {err && (
                  <p className="auth-error" role="alert">
                    {err}
                  </p>
                )}
                {msg && (
                  <p className="auth-success" role="status">
                    {msg}
                  </p>
                )}
                <button type="submit" className="primary-btn" disabled={busy}>
                  {busy ? '…' : t('auth.resetSend')}
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="auth-sub">Enter a new password for your Solara account (8+ characters).</p>
              <form className="auth-form" onSubmit={(e) => void submitNew(e)}>
                <label>
                  New password
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                    disabled={done}
                  />
                </label>
                {err && (
                  <p className="auth-error" role="alert">
                    {err}
                  </p>
                )}
                {msg && (
                  <p className="auth-success" role="status">
                    {msg}
                  </p>
                )}
                {!done && (
                  <button type="submit" className="primary-btn" disabled={busy}>
                    {busy ? '…' : 'Update password'}
                  </button>
                )}
                {done && (
                  <Link to="/" className="primary-btn" style={{ textAlign: 'center' }}>
                    Sign in on home
                  </Link>
                )}
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
