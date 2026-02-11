-- HeyClaw initial schema
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,

  -- Subscription
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'ultra')),
  apple_original_transaction_id TEXT,
  subscription_status TEXT DEFAULT 'none',
  subscription_ends_at TIMESTAMP,

  -- Agent
  agent_machine_id TEXT,
  agent_status TEXT DEFAULT 'pending' CHECK (agent_status IN ('pending', 'provisioning', 'running', 'sleeping', 'error')),
  agent_name TEXT DEFAULT 'HeyClaw',
  agent_personality TEXT,

  -- Credits (reset monthly on subscription renewal)
  credits_remaining INT DEFAULT 50,
  credits_monthly_limit INT DEFAULT 50,
  credits_reset_at TIMESTAMP,

  -- Settings
  tts_voice TEXT DEFAULT 'alloy',
  tts_speed FLOAT DEFAULT 1.0,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_active_at TIMESTAMP
);

-- Usage logs (for analytics + billing)
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  type TEXT NOT NULL CHECK (type IN ('stt', 'tts', 'agent_message')),
  model_tier TEXT CHECK (model_tier IN ('standard', 'power', 'best')),
  model_name TEXT,
  credits_used INT DEFAULT 0,
  duration_ms INT,
  tokens INT,
  cost_usd DECIMAL(10, 6),

  created_at TIMESTAMP DEFAULT NOW()
);

-- Chat sessions (for history)
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  title TEXT,
  messages JSONB DEFAULT '[]',

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_agent_machine ON users(agent_machine_id);
CREATE INDEX idx_usage_user_date ON usage_logs(user_id, created_at);
CREATE INDEX idx_sessions_user ON chat_sessions(user_id);

-- Monthly credit reset function
CREATE OR REPLACE FUNCTION reset_monthly_credits()
RETURNS void AS $$
BEGIN
  UPDATE users
  SET credits_remaining = credits_monthly_limit,
      credits_reset_at = credits_reset_at + INTERVAL '1 month'
  WHERE credits_reset_at <= NOW();
END;
$$ LANGUAGE plpgsql;

-- Auto-create user profile on signup (Supabase auth trigger)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, credits_reset_at)
  VALUES (
    NEW.id,
    NEW.email,
    NOW() + INTERVAL '1 month'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
