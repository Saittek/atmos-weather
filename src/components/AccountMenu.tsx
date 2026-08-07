import { useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { changePassword } from '../api/auth'
import { useAuth } from '../hooks/useAuth'
import { useI18n } from '../i18n/I18nProvider'
import { AuthModal } from './AuthModal'

interface Props {
  onCloudSync: () => void
  synced: boolean
}

export function AccountMenu({ onCloudSync, synced }: Props) {
  const { t } = useI18n()
  const { user, logout, loading } = useAuth()
  const [open, setOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwMsg, setPwMsg] = useState<string | null>(null)
  const [pwErr, setPwErr] = useState<string | null>(null)

  // Only show spinner when we have no user yet (token revalidating with no cache)
  if (loading && !user) {
    return (
      <button
        type="button"
        className="chip-btn icon-chip account-btn"
        disabled
        title={t('account.signingIn')}
        aria-label={t('account.signingIn')}
      >
        …
      </button>
    )
  }

  if (!user) {
    return (
      <>
        <button
          type="button"
          className="chip-btn icon-chip account-btn account-signin"
          onClick={() => setAuthOpen(true)}
          title={t('auth.signIn')}
          aria-label={t('auth.signIn')}
        >
          <span className="account-signin-icon" aria-hidden>
            👤
          </span>
        </button>
        <AuthModal
          open={authOpen}
          onClose={() => setAuthOpen(false)}
          onSuccess={onCloudSync}
        />
      </>
    )
  }

  const submitPw = async (e: FormEvent) => {
    e.preventDefault()
    setPwBusy(true)
    setPwErr(null)
    setPwMsg(null)
    try {
      if (newPw.length < 8) throw new Error('New password must be at least 8 characters')
      await changePassword(currentPw, newPw)
      setPwMsg('Password updated')
      setCurrentPw('')
      setNewPw('')
      window.setTimeout(() => {
        setPwOpen(false)
        setPwMsg(null)
      }, 1200)
    } catch (err) {
      setPwErr(err instanceof Error ? err.message : 'Could not change password')
    } finally {
      setPwBusy(false)
    }
  }

  return (
    <div className="account-menu-wrap">
      <button
        type="button"
        className={`chip-btn icon-chip account-btn active ${synced ? 'synced' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title={user.email}
        aria-label={`Account · ${user.name}`}
      >
        <span className="account-avatar">{(user.name || user.email).charAt(0).toUpperCase()}</span>
      </button>
      {open &&
        createPortal(
          <>
            <button
              type="button"
              className="account-popover-backdrop"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            />
            <div className="account-popover account-popover-portal">
              <div className="account-popover-head">
                <strong>{user.name}</strong>
                <span>{user.email}</span>
                {synced && <em className="sync-badge">{t('account.synced')}</em>}
              </div>
              <p className="account-popover-note">{t('account.note')}</p>
              <button
                type="button"
                className="chip-btn"
                onClick={() => {
                  onCloudSync()
                  setOpen(false)
                }}
              >
                {t('account.sync')}
              </button>
              <button
                type="button"
                className="chip-btn"
                onClick={() => {
                  setPwOpen(true)
                  setOpen(false)
                  setPwErr(null)
                  setPwMsg(null)
                }}
              >
                {t('account.changePassword')}
              </button>
              <button
                type="button"
                className="chip-btn account-logout"
                onClick={() => {
                  logout()
                  setOpen(false)
                }}
              >
                {t('account.signOut')}
              </button>
            </div>
          </>,
          document.body,
        )}

      {pwOpen &&
        createPortal(
          <div className="auth-overlay" role="dialog" aria-modal="true" aria-labelledby="pw-title">
            <button
              type="button"
              className="auth-backdrop"
              aria-label="Close"
              onClick={() => setPwOpen(false)}
            />
            <div className="auth-modal">
              <div className="auth-header">
                <h2 id="pw-title">{t('account.changePassword')}</h2>
                <button
                  type="button"
                  className="auth-close"
                  onClick={() => setPwOpen(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <p className="auth-sub">{t('account.pwHelp')}</p>
              <form className="auth-form" onSubmit={(e) => void submitPw(e)}>
                <label>
                  {t('auth.currentPassword')}
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    required
                  />
                </label>
                <label>
                  {t('auth.newPassword')}
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    minLength={8}
                    required
                  />
                </label>
                {pwErr && (
                  <p className="auth-error" role="alert">
                    {pwErr}
                  </p>
                )}
                {pwMsg && (
                  <p className="auth-success" role="status">
                    {pwMsg}
                  </p>
                )}
                <button type="submit" className="primary-btn" disabled={pwBusy}>
                  {pwBusy ? t('auth.wait') : t('auth.updatePassword')}
                </button>
              </form>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
