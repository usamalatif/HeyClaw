-- Add Apple Sign In support
-- Run this migration before deploying the new auth code

-- Add apple_user_id column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_user_id TEXT UNIQUE;

-- Create index for faster Apple ID lookups
CREATE INDEX IF NOT EXISTS idx_users_apple_user_id ON users(apple_user_id) WHERE apple_user_id IS NOT NULL;
