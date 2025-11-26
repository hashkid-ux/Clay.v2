-- Migration 007: Add password reset tokens table
-- Purpose: Secure password reset flow with time-limited tokens

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reset_token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for quick token lookup
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_reset_token 
ON password_reset_tokens(reset_token);

-- Index for finding unused tokens
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id_unused 
ON password_reset_tokens(user_id) WHERE used_at IS NULL;

-- Index for cleanup of expired tokens
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at 
ON password_reset_tokens(expires_at) WHERE used_at IS NULL;
