-- Add session management columns to app_users table
-- This allows storing the active session token directly with the user
-- Eliminates the need for CRM re-validation and works across all server instances

ALTER TABLE app_users
ADD COLUMN IF NOT EXISTS active_token TEXT,
ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP;

-- Create index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_app_users_active_token
ON app_users(active_token)
WHERE active_token IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN app_users.active_token IS 'Current active session token from CRM';
COMMENT ON COLUMN app_users.token_expires_at IS 'When the current session token expires';
