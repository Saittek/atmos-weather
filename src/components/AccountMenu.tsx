import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../hooks/useAuth'
import { AuthModal } from './AuthModal'

interface Props {
  onCloudSync: () => void
  synced: boolean
}

export function AccountMenu({ onCloudSync, synced }: Props) {
  const { user, logout, loading } = useAuth()
  const [open, setOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)

  if (loading) {
    return (
      <button type="button" className="chip-btn account-btn" disabled>
        …
      </button>
    )
  }

  if (!user) {
    return (
      <>
        <button
          type="button"
          className="chip-btn account-btn account-signin"
          onClick={() => setAuthOpen(true)}
        >
          Account
        </button>
        <AuthModal
          open={authOpen}
          onClose={() => setAuthOpen(false)}
          onSuccess={onCloudSync}
        />
      </>
    )
  }

  return (
    <div className="account-menu-wrap">
      <button
        type="button"
        className={`chip-btn account-btn active ${synced ? 'synced' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title={user.email}
      >
        <span className="account-avatar">{(user.name || user.email).charAt(0).toUpperCase()}</span>
        <span className="account-label">{user.name.split(' ')[0]}</span>
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
                {synced && <em className="sync-badge">☁ Synced</em>}
              </div>
              <p className="account-popover-note">
                Favorites, last place, units & theme save to your account automatically.
              </p>
              <button
                type="button"
                className="chip-btn"
                onClick={() => {
                  onCloudSync()
                  setOpen(false)
                }}
              >
                Sync now
              </button>
              <button
                type="button"
                className="chip-btn account-logout"
                onClick={() => {
                  logout()
                  setOpen(false)
                }}
              >
                Sign out
              </button>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
