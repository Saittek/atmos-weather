-- One-time password reset tokens (email link flow)
CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_resets_email ON password_resets(email);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
