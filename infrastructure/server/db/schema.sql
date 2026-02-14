-- HeyClaw Multi-Tenant Schema
-- Target: Self-hosted PostgreSQL (Docker on 93.115.26.164)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════════
-- USERS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    name            VARCHAR(100),
    avatar_url      VARCHAR(500),
    apple_user_id   VARCHAR(255) UNIQUE,
    status          VARCHAR(20) DEFAULT 'active',
    email_verified  BOOLEAN DEFAULT FALSE,
    last_login_at   TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_apple_id ON users(apple_user_id);

-- ═══════════════════════════════════════════════════════════
-- PLAN LIMITS (reference table)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE plan_limits (
    plan                        VARCHAR(20) PRIMARY KEY,
    display_name                VARCHAR(50) NOT NULL,
    max_assistants              INTEGER NOT NULL,
    daily_text_messages         INTEGER NOT NULL,
    daily_voice_input_minutes   NUMERIC(10,2) NOT NULL,
    daily_voice_output_minutes  NUMERIC(10,2) NOT NULL,
    daily_tts_characters        INTEGER NOT NULL,
    model                       VARCHAR(100) NOT NULL,
    tts_model                   VARCHAR(50) NOT NULL,
    tts_voice_options           TEXT[] NOT NULL,
    price_monthly_usd           NUMERIC(10,2) NOT NULL,
    price_yearly_usd            NUMERIC(10,2) NOT NULL
);

INSERT INTO plan_limits VALUES
(
    'free', 'Free',
    1, 5,
    2.00, 2.00, 5000,
    'openai-custom/gpt-5-nano', 'tts-1',
    ARRAY['nova', 'alloy'],
    0.00, 0.00
),
(
    'starter', 'Starter',
    1, 200,
    15.00, 15.00, 20000,
    'openai-custom/gpt-5-nano', 'tts-1',
    ARRAY['nova', 'alloy', 'echo', 'fable'],
    19.99, 0.00
),
(
    'pro', 'Pro',
    5, 1000,
    60.00, 60.00, 100000,
    'openai-custom/gpt-5-nano', 'tts-1',
    ARRAY['nova', 'alloy', 'echo', 'fable', 'onyx', 'shimmer'],
    60.99, 0.00
),
(
    'premium', 'Premium',
    20, 999999,
    240.00, 240.00, 500000,
    'openai-custom/gpt-5-nano', 'tts-1-hd',
    ARRAY['nova', 'alloy', 'echo', 'fable', 'onyx', 'shimmer'],
    149.99, 0.00
);

-- ═══════════════════════════════════════════════════════════
-- SUBSCRIPTIONS (Apple IAP)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE subscriptions (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                         UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    plan                            VARCHAR(20) NOT NULL DEFAULT 'free' REFERENCES plan_limits(plan),
    status                          VARCHAR(20) DEFAULT 'active',
    apple_original_transaction_id   VARCHAR(100),
    apple_product_id                VARCHAR(100),
    subscription_ends_at            TIMESTAMP,
    current_period_start            TIMESTAMP,
    current_period_end              TIMESTAMP,
    cancel_at_period_end            BOOLEAN DEFAULT FALSE,
    created_at                      TIMESTAMP DEFAULT NOW(),
    updated_at                      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_apple_txn ON subscriptions(apple_original_transaction_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- ═══════════════════════════════════════════════════════════
-- ASSISTANTS (each maps to an OpenClaw agent)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE assistants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    agent_id        VARCHAR(100) UNIQUE NOT NULL,
    display_name    VARCHAR(100) DEFAULT 'My Assistant',
    voice           VARCHAR(50) DEFAULT 'nova',
    model           VARCHAR(100) DEFAULT 'openai-custom/gpt-5-nano',
    gateway_id      VARCHAR(50) DEFAULT 'gateway-main',
    status          VARCHAR(20) DEFAULT 'active',
    last_active_at  TIMESTAMP,
    message_count   INTEGER DEFAULT 0,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_assistants_user ON assistants(user_id);
CREATE INDEX idx_assistants_agent ON assistants(agent_id);
CREATE INDEX idx_assistants_status ON assistants(status);

-- ═══════════════════════════════════════════════════════════
-- DAILY USAGE (rate limiting — one row per user per day)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE daily_usage (
    id                      BIGSERIAL PRIMARY KEY,
    user_id                 UUID REFERENCES users(id) ON DELETE CASCADE,
    date                    DATE NOT NULL DEFAULT CURRENT_DATE,
    text_messages           INTEGER DEFAULT 0,
    voice_input_seconds     NUMERIC(10,2) DEFAULT 0,
    voice_output_seconds    NUMERIC(10,2) DEFAULT 0,
    tts_characters          INTEGER DEFAULT 0,
    UNIQUE(user_id, date)
);

CREATE INDEX idx_daily_usage_lookup ON daily_usage(user_id, date);

-- ═══════════════════════════════════════════════════════════
-- USAGE LOGS (detailed, for analytics)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE usage_logs (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    assistant_id    UUID REFERENCES assistants(id) ON DELETE SET NULL,
    usage_type      VARCHAR(30) NOT NULL,
    quantity        NUMERIC(10,4) NOT NULL,
    estimated_cost  NUMERIC(10,6),
    metadata        JSONB,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_usage_logs_user_date ON usage_logs(user_id, created_at);
CREATE INDEX idx_usage_logs_type ON usage_logs(usage_type);

-- ═══════════════════════════════════════════════════════════
-- CHAT SESSIONS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE chat_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT,
    messages    JSONB DEFAULT '[]',
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON chat_sessions(user_id);

-- ═══════════════════════════════════════════════════════════
-- AUTOMATION RESULTS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE automation_results (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    job_id      TEXT,
    job_name    TEXT,
    result      TEXT,
    run_at      TIMESTAMP,
    seen        BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_automation_user ON automation_results(user_id, seen);

-- ═══════════════════════════════════════════════════════════
-- REFRESH TOKENS (JWT auth)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL,
    device_info VARCHAR(255),
    expires_at  TIMESTAMP NOT NULL,
    revoked     BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- ═══════════════════════════════════════════════════════════
-- PASSWORD RESET TOKENS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE password_reset_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL,
    expires_at  TIMESTAMP NOT NULL,
    used        BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- GATEWAY MAP (for future multi-gateway scaling)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE user_gateway_map (
    user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    gateway_id  VARCHAR(50) NOT NULL DEFAULT 'gateway-main',
    agent_id    VARCHAR(100) NOT NULL,
    assigned_at TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER assistants_updated_at BEFORE UPDATE ON assistants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Increment daily usage atomically
CREATE OR REPLACE FUNCTION increment_daily_usage(
    p_user_id UUID,
    p_field TEXT,
    p_amount NUMERIC
) RETURNS VOID AS $$
BEGIN
    INSERT INTO daily_usage (user_id, date)
    VALUES (p_user_id, CURRENT_DATE)
    ON CONFLICT (user_id, date) DO NOTHING;

    EXECUTE format(
        'UPDATE daily_usage SET %I = %I + $1 WHERE user_id = $2 AND date = CURRENT_DATE',
        p_field, p_field
    ) USING p_amount, p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Auto-create free subscription on user signup
CREATE OR REPLACE FUNCTION create_default_subscription()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO subscriptions (user_id, plan, status)
    VALUES (NEW.id, 'free', 'active');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_signup_subscription
    AFTER INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION create_default_subscription();

-- Cleanup expired tokens (run via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_tokens() RETURNS VOID AS $$
BEGIN
    DELETE FROM password_reset_tokens WHERE expires_at < NOW();
    DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked = TRUE;
END;
$$ LANGUAGE plpgsql;
