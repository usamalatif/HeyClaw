# Complete Backend Plan — OpenClaw Multi-Tenant AI Assistant App

## For: Claude Code Implementation
## Server: 4 CPU / 32GB RAM / Ubuntu 24.04 LTS / SSD
## Available RAM: 20GB (other service using ~12GB)
## PostgreSQL & Redis: Already running in Docker containers on this server
## Date: February 2026

---

## RESOURCE ALLOCATION

```
┌──────────────────────────────────────────────────────────────┐
│                 SERVER: 4 CPU / 32GB RAM                      │
│                                                                │
│  ┌──────────────────────┐                                     │
│  │  EXISTING SERVICE     │                                     │
│  │  ~12GB RAM            │                                     │
│  │  (includes Docker     │                                     │
│  │   PostgreSQL + Redis) │                                     │
│  └──────────────────────┘                                     │
│                                                                │
│  ┌──────────────────────┐  ┌───────────────────────────────┐  │
│  │  OPENCLAW ZONE        │  │  BACKEND ZONE                  │  │
│  │  2 CPU / 14GB RAM     │  │  2 CPU / 6GB RAM               │  │
│  │                       │  │                                 │  │
│  │  ├── OpenClaw Gateway │  │  ├── API Server (x2 cluster)   │  │
│  │  │   12GB heap        │  │  │   2GB per worker             │  │
│  │  │                    │  │  │                               │  │
│  │  └── Agent workspaces │  │  ├── Nginx                      │  │
│  │      (filesystem)     │  │  │   ~50MB                      │  │
│  │                       │  │  │                               │  │
│  │  Headroom: ~2GB       │  │  └── Headroom: ~2GB             │  │
│  └──────────────────────┘  └───────────────────────────────┘  │
│                                                                │
│  PostgreSQL ── running in Docker (already exists)              │
│  Redis ─────── running in Docker (already exists)              │
└──────────────────────────────────────────────────────────────┘
```

---

## COMPLETE ARCHITECTURE

```
                        Internet
                           │
                      ┌────▼────┐
                      │  Nginx  │ :80/:443
                      │  (SSL)  │
                      └────┬────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
         /api/*       /ws/chat    /webhooks
              │            │            │
        ┌─────▼─────┐ ┌───▼───┐  ┌────▼────┐
        │ API Server │ │  WS   │  │ Stripe  │
        │ (REST)     │ │ Proxy │  │ Webhook │
        │ Port 3000  │ │       │  │ Handler │
        └─────┬──────┘ └───┬───┘  └────┬────┘
              │            │            │
              ├────────────┼────────────┤
              │            │            │
    ┌─────────▼──┐   ┌────▼─────┐  ┌──▼───┐
    │ PostgreSQL │   │ OpenClaw │  │Redis │
    │ (Docker)   │   │ Gateway  │  │(Docker)│
    │            │   │ :18789   │  │      │
    └────────────┘   └────┬─────┘  └──────┘
                          │
                   External APIs
                   ├── OpenAI GPT-5-nano
                   ├── OpenAI Whisper
                   └── OpenAI TTS
```

---

## FILE STRUCTURE

```
/home/appuser/
├── api/                              # Your backend API
│   ├── package.json
│   ├── .env
│   ├── server.js                     # Entry point
│   │
│   ├── config/
│   │   └── index.js                  # All config from .env
│   │
│   ├── db/
│   │   ├── schema.sql                # Full database schema
│   │   ├── pool.js                   # PostgreSQL connection pool
│   │   ├── redis.js                  # Redis client
│   │   └── migrations/               # Future schema changes
│   │
│   ├── middleware/
│   │   ├── auth.js                   # JWT verify
│   │   ├── rateLimiter.js            # Per-plan rate limiting
│   │   └── errorHandler.js           # Global error handler
│   │
│   ├── templates/
│   │   ├── SOUL.md                   # Default personality (generic)
│   │   └── AGENTS.md                 # Default system prompt
│   │
│   ├── routes/
│   │   ├── auth.js                   # Signup, login, refresh, forgot password
│   │   ├── assistants.js             # CRUD assistants (creates OpenClaw agents)
│   │   ├── voice.js                  # Whisper transcribe + TTS speak
│   │   ├── subscription.js           # Stripe plans, upgrade, cancel
│   │   ├── user.js                   # Profile, usage stats
│   │   └── webhooks.js               # Stripe webhooks
│   │
│   ├── services/
│   │   ├── openclaw-manager.js       # Add/remove/update agents
│   │   ├── gateway-proxy.js          # WebSocket proxy to Gateway
│   │   ├── whisper.js                # OpenAI Whisper API
│   │   ├── tts.js                    # OpenAI TTS API
│   │   ├── billing.js                # Stripe integration
│   │   └── usage.js                  # Usage tracking + limit checking
│   │
│   └── utils/
│       ├── errors.js                 # Custom error classes
│       ├── validators.js             # Input validation (joi/zod)
│       └── logger.js                 # Winston/Pino logger
│
├── .openclaw/                        # OpenClaw home
│   ├── openclaw.json                 # Gateway config (agents, bindings)
│   ├── workspaces/                   # One folder per agent
│   │   ├── agent_abc123/
│   │   │   ├── SOUL.md              # Personality (generic, agent discovers itself)
│   │   │   ├── AGENTS.md            # System prompt
│   │   │   ├── MEMORY.md            # Conversation memory (auto-managed)
│   │   │   └── USER.md              # User preferences (auto-managed)
│   │   └── ...
│   └── agents/                       # OpenClaw managed state
│       ├── agent_abc123/
│       │   └── agent/
│       │       ├── auth-profiles.json
│       │       └── sessions/
│       └── ...
│
├── scripts/
│   ├── backup.sh                     # Daily DB + workspace backup
│   ├── healthcheck.sh                # Cron health monitor
│   ├── setup.sh                      # Initial server setup
│   └── cleanup-inactive.sh           # Remove inactive free tier agents
│
├── ecosystem.config.js               # PM2 config
│
├── backups/
│   └── 2026-02-13/
│       ├── database.sql.gz
│       ├── openclaw.tar.gz
│       └── .env.backup
│
└── logs/
    ├── api-error.log
    ├── api-combined.log
    ├── gateway-error.log
    ├── gateway-out.log
    ├── healthcheck.log
    └── backup.log
```

---

## 1. SERVER SETUP SCRIPT

Create file: `/home/appuser/scripts/setup.sh`

```bash
#!/bin/bash
set -e

echo "=== OpenClaw Multi-Tenant Server Setup ==="
echo "=== PostgreSQL & Redis already in Docker — skipping ==="

# ── System ──────────────────────────────────────────────────
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
  curl git wget unzip build-essential \
  nginx certbot python3-certbot-nginx \
  ufw fail2ban jq

# ── Node.js 20 LTS ─────────────────────────────────────────
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

# ── OpenClaw ────────────────────────────────────────────────
sudo npm install -g openclaw

# ── Firewall ────────────────────────────────────────────────
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
# Do NOT expose 18789 (Gateway) — internal only
sudo ufw --force enable

# ── Fail2ban ────────────────────────────────────────────────
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# ── Directories ─────────────────────────────────────────────
mkdir -p /home/appuser/.openclaw/workspaces
mkdir -p /home/appuser/.openclaw/agents
mkdir -p /home/appuser/api
mkdir -p /home/appuser/api/templates
mkdir -p /home/appuser/scripts
mkdir -p /home/appuser/backups
mkdir -p /home/appuser/logs

echo "=== Setup complete ==="
echo "=== Next: apply schema.sql to your Docker PostgreSQL ==="
```

---

## 2. DATABASE SCHEMA

PostgreSQL is already running in Docker. Connect to it and apply this schema.

```bash
# Connect to your Docker PostgreSQL and run the schema
docker exec -i your_postgres_container psql -U appuser -d openclaw_app < /home/appuser/api/db/schema.sql
```

Create file: `/home/appuser/api/db/schema.sql`

```sql
-- ═══════════════════════════════════════════════════════════
-- EXTENSIONS
-- ═══════════════════════════════════════════════════════════

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
    status          VARCHAR(20) DEFAULT 'active',   -- active, suspended, deleted
    email_verified  BOOLEAN DEFAULT FALSE,
    last_login_at   TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);

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
    1,                              -- 1 assistant
    50,                             -- 50 messages/day
    2.00, 2.00,                     -- 2 min voice in/out per day
    5000,                           -- 5K TTS chars/day
    'openai-custom/gpt-5-nano',
    'tts-1',
    ARRAY['nova', 'alloy'],
    0.00, 0.00
),
(
    'pro', 'Pro',
    5,                              -- 5 assistants
    500,                            -- 500 messages/day
    30.00, 30.00,                   -- 30 min voice per day
    50000,                          -- 50K TTS chars/day
    'openai-custom/gpt-5-nano',
    'tts-1',
    ARRAY['nova', 'alloy', 'echo', 'fable', 'onyx', 'shimmer'],
    6.99, 69.99
),
(
    'premium', 'Premium',
    20,                             -- 20 assistants
    2000,                           -- 2000 messages/day
    120.00, 120.00,                 -- 2 hrs voice per day
    200000,                         -- 200K TTS chars/day
    'openai-custom/gpt-5-nano',
    'tts-1-hd',
    ARRAY['nova', 'alloy', 'echo', 'fable', 'onyx', 'shimmer'],
    12.99, 129.99
);

-- ═══════════════════════════════════════════════════════════
-- SUBSCRIPTIONS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE subscriptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    plan                    VARCHAR(20) NOT NULL DEFAULT 'free' REFERENCES plan_limits(plan),
    status                  VARCHAR(20) DEFAULT 'active',  -- active, cancelled, past_due, expired
    billing_cycle           VARCHAR(10) DEFAULT 'monthly', -- monthly, yearly
    stripe_customer_id      VARCHAR(100),
    stripe_subscription_id  VARCHAR(100),
    current_period_start    TIMESTAMP,
    current_period_end      TIMESTAMP,
    cancel_at_period_end    BOOLEAN DEFAULT FALSE,
    created_at              TIMESTAMP DEFAULT NOW(),
    updated_at              TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- ═══════════════════════════════════════════════════════════
-- ASSISTANTS (each maps to an OpenClaw agent)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE assistants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    agent_id        VARCHAR(100) UNIQUE NOT NULL,   -- OpenClaw agent ID
    display_name    VARCHAR(100) DEFAULT 'My Assistant',  -- UI label, user can rename
    voice           VARCHAR(50) DEFAULT 'nova',
    model           VARCHAR(100) DEFAULT 'openai-custom/gpt-5-nano',
    gateway_id      VARCHAR(50) DEFAULT 'gateway-main',
    status          VARCHAR(20) DEFAULT 'active',   -- active, paused, deleted
    last_active_at  TIMESTAMP,
    message_count   INTEGER DEFAULT 0,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_assistants_user ON assistants(user_id);
CREATE INDEX idx_assistants_agent ON assistants(agent_id);
CREATE INDEX idx_assistants_status ON assistants(status);

-- ═══════════════════════════════════════════════════════════
-- DAILY USAGE (for rate limiting — one row per user per day)
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
-- USAGE LOGS (detailed, for billing & analytics)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE usage_logs (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    assistant_id    UUID REFERENCES assistants(id) ON DELETE SET NULL,
    usage_type      VARCHAR(30) NOT NULL,   -- text_message, whisper, tts
    quantity        NUMERIC(10,4) NOT NULL,  -- messages count, seconds, characters
    estimated_cost  NUMERIC(10,6),           -- USD
    metadata        JSONB,                   -- extra details (model used, tokens, etc)
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_usage_logs_user_date ON usage_logs(user_id, created_at);
CREATE INDEX idx_usage_logs_type ON usage_logs(usage_type);

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
-- REFRESH TOKENS (for JWT auth)
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
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════

-- Auto-update updated_at timestamp
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
```

---

## 3. REDIS KEY SCHEMA

Redis is already running in Docker. No setup needed — just connect to it.

```
# Rate limiting — daily counters per user
ratelimit:{userId}:{date}:text_messages     → integer
ratelimit:{userId}:{date}:voice_seconds     → float
ratelimit:{userId}:{date}:tts_chars         → integer
TTL: 86400 (24 hours, auto-expire)

# User plan cache — avoid DB lookups on every request
plan:{userId}                               → JSON {plan, limits}
TTL: 300 (5 minutes)

# Active WebSocket connections
ws:connections:{userId}                     → {socketId, agentId, connectedAt}
TTL: 86400

# Gateway agent count cache
gateway:agent_count:{gatewayId}             → integer
TTL: 60

# JWT blacklist (for logout)
blacklist:jwt:{jti}                         → 1
TTL: matches JWT expiry
```

---

## 4. OPENCLAW GATEWAY

### 4.1 Config

Create file: `/home/appuser/.openclaw/openclaw.json`

```json
{
  "gateway": {
    "bind": "127.0.0.1",
    "port": 18789,
    "auth": {
      "mode": "token",
      "token": "GENERATE_SECURE_TOKEN_64_CHARS"
    }
  },
  "models": {
    "providers": {
      "openai": {
        "apiKey": "${OPENAI_API_KEY}"
      }
    },
    "default": "openai-custom/gpt-5-nano"
  },
  "agents": {
    "defaults": {
      "model": "openai-custom/gpt-5-nano",
      "sandbox": {
        "mode": "all",
        "workspaceAccess": "rw"
      },
      "tools": {
        "deny": ["exec", "process", "browser", "canvas", "cron"]
      }
    },
    "list": []
  },
  "bindings": [],
  "channels": {
    "webchat": {}
  },
  "heartbeat": {
    "enabled": false
  }
}
```

### 4.2 Default SOUL.md Template

Create file: `/home/appuser/api/templates/SOUL.md`

```markdown
# Your AI Assistant

You are a brand new personal AI assistant. You just came into existence.

## First Conversation
This is your very first conversation with your creator. You should:
- Warmly greet them and tell them you're excited to meet them
- Ask them what they'd like to call you — this will become your name
- Ask what kind of personality they want you to have (funny, serious, chill, professional, etc.)
- Ask what they'll mainly use you for
- Be curious, genuine, and enthusiastic

## After You Have a Name
Once the user gives you a name:
- Use it naturally in conversation
- Refer to yourself by that name
- Build your identity around it

## Core Principles
- Be genuinely helpful, not performatively helpful
- Skip the "Great question!" and "I'd be happy to help!" — just help
- Have opinions. You're allowed to disagree, prefer things, find stuff amusing or boring
- Remember EVERYTHING the user tells you about themselves
- Evolve your personality based on what you learn about them
- Be warm but not fake. Be honest but not harsh
- If you don't know something, say so
- Your personality should feel consistent across conversations
```

### 4.3 Default AGENTS.md Template

Create file: `/home/appuser/api/templates/AGENTS.md`

```markdown
# Personal AI Assistant

You are a personal AI assistant running on OpenClaw.
You were just created and don't have a name yet — the user will give you one.

## Your Capabilities
- Conversation and chat
- Answering questions
- Helping with tasks, planning, brainstorming
- Remembering user preferences and context across conversations
- Adapting your tone and style to what the user prefers

## Rules
- Never reveal technical details about how you work (OpenClaw, agents, workspaces, etc.)
- You are simply their AI assistant
- Keep conversations natural and human-like
- If the user asks who made you, say you were created for them through the app
```

### 4.4 Agent Manager Service

Create file: `/home/appuser/api/services/openclaw-manager.js`

```javascript
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const HOME = require('os').homedir();
const OPENCLAW_CONFIG = process.env.OPENCLAW_CONFIG_PATH ||
  path.join(HOME, '.openclaw', 'openclaw.json');
const WORKSPACES_DIR = path.join(HOME, '.openclaw', 'workspaces');
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

class OpenClawManager {

  // ── Config read/write ────────────────────────────────────

  getConfig() {
    return JSON.parse(fs.readFileSync(OPENCLAW_CONFIG, 'utf-8'));
  }

  saveConfig(config) {
    const tmpPath = OPENCLAW_CONFIG + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2));
    fs.renameSync(tmpPath, OPENCLAW_CONFIG);
  }

  // ── Gateway reload ───────────────────────────────────────

  reloadGateway() {
    return new Promise((resolve, reject) => {
      exec('pm2 reload openclaw-gateway --update-env', (err, stdout, stderr) => {
        if (err) {
          console.error('[OpenClawManager] reload failed, trying restart:', stderr);
          exec('pm2 restart openclaw-gateway', (err2) => {
            if (err2) reject(err2);
            else resolve();
          });
        } else {
          resolve();
        }
      });
    });
  }

  // ── Create Agent ─────────────────────────────────────────
  // Called when a user creates a new assistant.
  // SOUL.md is generic — agent discovers its own name/personality via chat.

  async createAgent({ agentId, model }) {
    const config = this.getConfig();

    if (config.agents.list.some(a => a.id === agentId)) {
      throw new Error(`Agent ${agentId} already exists`);
    }

    // Create workspace from templates
    const workspacePath = path.join(WORKSPACES_DIR, agentId);
    fs.mkdirSync(workspacePath, { recursive: true });

    fs.copyFileSync(
      path.join(TEMPLATES_DIR, 'SOUL.md'),
      path.join(workspacePath, 'SOUL.md')
    );
    fs.copyFileSync(
      path.join(TEMPLATES_DIR, 'AGENTS.md'),
      path.join(workspacePath, 'AGENTS.md')
    );
    fs.writeFileSync(path.join(workspacePath, 'MEMORY.md'), '# Memory\n');
    fs.writeFileSync(path.join(workspacePath, 'USER.md'), '# User Preferences\n');

    // Add to config
    config.agents.list.push({
      id: agentId,
      name: agentId,
      workspace: workspacePath,
      model: model || 'openai-custom/gpt-5-nano'
    });

    config.bindings.push({
      agentId: agentId,
      match: {
        channel: 'webchat',
        peer: { kind: 'dm', id: agentId }
      }
    });

    this.saveConfig(config);
    await this.reloadGateway();

    return { agentId, workspacePath };
  }

  // ── Update Agent Model ───────────────────────────────────

  async updateAgentModel(agentId, model) {
    const config = this.getConfig();
    const agent = config.agents.list.find(a => a.id === agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    agent.model = model;
    this.saveConfig(config);
    await this.reloadGateway();
  }

  // ── Remove Agent ─────────────────────────────────────────

  async removeAgent(agentId) {
    const config = this.getConfig();

    config.agents.list = config.agents.list.filter(a => a.id !== agentId);
    config.bindings = config.bindings.filter(b => b.agentId !== agentId);

    this.saveConfig(config);

    const workspacePath = path.join(WORKSPACES_DIR, agentId);
    if (fs.existsSync(workspacePath)) {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    }

    const agentDir = path.join(HOME, '.openclaw', 'agents', agentId);
    if (fs.existsSync(agentDir)) {
      fs.rmSync(agentDir, { recursive: true, force: true });
    }

    await this.reloadGateway();
  }

  // ── Pause Agent (keep data, remove from Gateway) ────────

  async pauseAgent(agentId) {
    const config = this.getConfig();
    config.agents.list = config.agents.list.filter(a => a.id !== agentId);
    config.bindings = config.bindings.filter(b => b.agentId !== agentId);
    this.saveConfig(config);
    await this.reloadGateway();
  }

  // ── Resume Agent ─────────────────────────────────────────

  async resumeAgent(agentId, model) {
    const workspacePath = path.join(WORKSPACES_DIR, agentId);
    if (!fs.existsSync(workspacePath)) {
      throw new Error(`Agent workspace not found: ${agentId}`);
    }

    const config = this.getConfig();
    if (config.agents.list.some(a => a.id === agentId)) return;

    config.agents.list.push({
      id: agentId,
      name: agentId,
      workspace: workspacePath,
      model: model || 'openai-custom/gpt-5-nano'
    });

    config.bindings.push({
      agentId,
      match: { channel: 'webchat', peer: { kind: 'dm', id: agentId } }
    });

    this.saveConfig(config);
    await this.reloadGateway();
  }

  // ── Batch Create ─────────────────────────────────────────

  async batchCreate(agents) {
    const config = this.getConfig();

    for (const { agentId, model } of agents) {
      const workspacePath = path.join(WORKSPACES_DIR, agentId);
      fs.mkdirSync(workspacePath, { recursive: true });

      fs.copyFileSync(path.join(TEMPLATES_DIR, 'SOUL.md'), path.join(workspacePath, 'SOUL.md'));
      fs.copyFileSync(path.join(TEMPLATES_DIR, 'AGENTS.md'), path.join(workspacePath, 'AGENTS.md'));
      fs.writeFileSync(path.join(workspacePath, 'MEMORY.md'), '# Memory\n');
      fs.writeFileSync(path.join(workspacePath, 'USER.md'), '# User Preferences\n');

      config.agents.list.push({
        id: agentId, name: agentId,
        workspace: workspacePath,
        model: model || 'openai-custom/gpt-5-nano'
      });

      config.bindings.push({
        agentId, match: { channel: 'webchat', peer: { kind: 'dm', id: agentId } }
      });
    }

    this.saveConfig(config);
    await this.reloadGateway();
    return agents.length;
  }

  async batchRemove(agentIds) {
    const config = this.getConfig();
    config.agents.list = config.agents.list.filter(a => !agentIds.includes(a.id));
    config.bindings = config.bindings.filter(b => !agentIds.includes(b.agentId));
    this.saveConfig(config);

    for (const id of agentIds) {
      const wp = path.join(WORKSPACES_DIR, id);
      if (fs.existsSync(wp)) fs.rmSync(wp, { recursive: true, force: true });
      const ad = path.join(HOME, '.openclaw', 'agents', id);
      if (fs.existsSync(ad)) fs.rmSync(ad, { recursive: true, force: true });
    }

    await this.reloadGateway();
  }

  // ── Utilities ────────────────────────────────────────────

  getAgentCount() {
    return this.getConfig().agents.list.length;
  }

  listAgents() {
    return this.getConfig().agents.list.map(a => ({
      id: a.id, name: a.name, model: a.model
    }));
  }

  agentExists(agentId) {
    return this.getConfig().agents.list.some(a => a.id === agentId);
  }
}

module.exports = new OpenClawManager();
```

---

## 5. API SERVER

### 5.1 Package.json

```json
{
  "name": "openclaw-app-api",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "ws": "^8.18.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.0",
    "pg": "^8.13.0",
    "ioredis": "^5.4.0",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "uuid": "^10.0.0",
    "joi": "^17.13.0",
    "stripe": "^17.0.0",
    "helmet": "^8.0.0",
    "morgan": "^1.10.0",
    "express-rate-limit": "^7.4.0",
    "node-fetch": "^2.7.0",
    "form-data": "^4.0.0",
    "pino": "^9.0.0",
    "pino-pretty": "^11.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.0"
  }
}
```

### 5.2 Environment

Create file: `/home/appuser/api/.env`

```env
# ── Server ──────────────────────────────────────────────────
NODE_ENV=production
PORT=3000
API_URL=https://yourdomain.com

# ── Database (Docker PostgreSQL) ────────────────────────────
DATABASE_URL=postgresql://appuser:YOUR_PG_PASSWORD@172.17.0.1:5432/openclaw_app
DB_POOL_MIN=5
DB_POOL_MAX=30

# ── Redis (Docker Redis) ───────────────────────────────────
REDIS_URL=redis://:YOUR_REDIS_PASSWORD@172.17.0.1:6379

# ── JWT ─────────────────────────────────────────────────────
JWT_SECRET=GENERATE_64_CHAR_RANDOM_STRING_HERE
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=30d

# ── OpenAI ──────────────────────────────────────────────────
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx

# ── OpenClaw Gateway ────────────────────────────────────────
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=SAME_TOKEN_AS_OPENCLAW_JSON
OPENCLAW_CONFIG_PATH=/home/appuser/.openclaw/openclaw.json

# ── Stripe ──────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx

# ── App Config ──────────────────────────────────────────────
MAX_AGENTS_PER_GATEWAY=300
GATEWAY_RELOAD_DEBOUNCE_MS=5000
```

### 5.3 Database Pool

Create file: `/home/appuser/api/db/pool.js`

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  min: parseInt(process.env.DB_POOL_MIN || '5'),
  max: parseInt(process.env.DB_POOL_MAX || '30'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool,
};
```

### 5.4 Redis Client

Create file: `/home/appuser/api/db/redis.js`

```javascript
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    return Math.min(times * 100, 3000);
  },
});

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err);
});

module.exports = redis;
```

### 5.5 Config

Create file: `/home/appuser/api/config/index.js`

```javascript
require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '3000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  apiUrl: process.env.API_URL,

  jwt: {
    secret: process.env.JWT_SECRET,
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '30d',
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    whisperUrl: 'https://api.openai.com/v1/audio/transcriptions',
    ttsUrl: 'https://api.openai.com/v1/audio/speech',
  },

  gateway: {
    url: process.env.OPENCLAW_GATEWAY_URL,
    token: process.env.OPENCLAW_GATEWAY_TOKEN,
    maxAgents: parseInt(process.env.MAX_AGENTS_PER_GATEWAY || '300'),
    reloadDebounce: parseInt(process.env.GATEWAY_RELOAD_DEBOUNCE_MS || '5000'),
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },
};
```

### 5.6 Auth Middleware

Create file: `/home/appuser/api/middleware/auth.js`

```javascript
const jwt = require('jsonwebtoken');
const redis = require('../db/redis');
const config = require('../config');

module.exports = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.secret);

    const blacklisted = await redis.get(`blacklist:jwt:${decoded.jti}`);
    if (blacklisted) {
      return res.status(401).json({ error: 'Token revoked' });
    }

    req.user = { id: decoded.sub, email: decoded.email };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};
```

### 5.7 Rate Limiter Middleware

Create file: `/home/appuser/api/middleware/rateLimiter.js`

```javascript
const redis = require('../db/redis');
const db = require('../db/pool');

module.exports = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    let planData = await redis.get(`plan:${userId}`);
    if (!planData) {
      const result = await db.query(
        `SELECT pl.* FROM subscriptions s
         JOIN plan_limits pl ON s.plan = pl.plan
         WHERE s.user_id = $1 AND s.status = 'active'`,
        [userId]
      );
      planData = JSON.stringify(result.rows[0] || { plan: 'free' });
      await redis.set(`plan:${userId}`, planData, 'EX', 300);
    }

    const limits = JSON.parse(planData);

    const textCount = parseInt(await redis.get(`ratelimit:${userId}:${today}:text_messages`) || '0');
    const voiceSeconds = parseFloat(await redis.get(`ratelimit:${userId}:${today}:voice_seconds`) || '0');
    const ttsChars = parseInt(await redis.get(`ratelimit:${userId}:${today}:tts_chars`) || '0');

    req.usage = { text_messages: textCount, voice_input_seconds: voiceSeconds, tts_characters: ttsChars };
    req.limits = limits;

    res.set('X-RateLimit-Plan', limits.plan);
    res.set('X-RateLimit-Text-Remaining', Math.max(0, limits.daily_text_messages - textCount));
    res.set('X-RateLimit-Voice-Remaining', Math.max(0, limits.daily_voice_input_minutes * 60 - voiceSeconds));

    next();
  } catch (err) {
    console.error('[RateLimiter] Error:', err);
    next();
  }
};
```

### 5.8 Usage Service

Create file: `/home/appuser/api/services/usage.js`

```javascript
const redis = require('../db/redis');
const db = require('../db/pool');

class UsageService {

  async checkLimit(userId, type) {
    const today = new Date().toISOString().split('T')[0];

    let planData = await redis.get(`plan:${userId}`);
    if (!planData) {
      const result = await db.query(
        `SELECT pl.* FROM subscriptions s
         JOIN plan_limits pl ON s.plan = pl.plan
         WHERE s.user_id = $1 AND s.status = 'active'`,
        [userId]
      );
      planData = JSON.stringify(result.rows[0]);
      await redis.set(`plan:${userId}`, planData, 'EX', 300);
    }
    const limits = JSON.parse(planData);

    const current = parseFloat(await redis.get(`ratelimit:${userId}:${today}:${type}`) || '0');

    switch (type) {
      case 'text_messages':
        return current < limits.daily_text_messages;
      case 'voice_seconds':
        return current < (limits.daily_voice_input_minutes * 60);
      case 'tts_chars':
        return current < limits.daily_tts_characters;
      default:
        return true;
    }
  }

  async increment(userId, type, amount = 1) {
    const today = new Date().toISOString().split('T')[0];
    const key = `ratelimit:${userId}:${today}:${type}`;

    const newVal = await redis.incrbyfloat(key, amount);
    const ttl = await redis.ttl(key);
    if (ttl === -1) {
      await redis.expire(key, 86400);
    }

    this._syncToDB(userId, type, amount).catch(err =>
      console.error('[Usage] DB sync error:', err)
    );

    return newVal;
  }

  async _syncToDB(userId, type, amount) {
    const fieldMap = {
      'text_messages': 'text_messages',
      'voice_seconds': 'voice_input_seconds',
      'tts_chars': 'tts_characters',
    };
    const field = fieldMap[type];
    if (field) {
      await db.query('SELECT increment_daily_usage($1, $2, $3)', [userId, field, amount]);
    }
  }

  async log(userId, assistantId, usageType, quantity, estimatedCost, metadata = {}) {
    await db.query(
      `INSERT INTO usage_logs (user_id, assistant_id, usage_type, quantity, estimated_cost, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, assistantId, usageType, quantity, estimatedCost, JSON.stringify(metadata)]
    );
  }

  async getTodayUsage(userId) {
    const today = new Date().toISOString().split('T')[0];
    return {
      text_messages: parseInt(await redis.get(`ratelimit:${userId}:${today}:text_messages`) || '0'),
      voice_seconds: parseFloat(await redis.get(`ratelimit:${userId}:${today}:voice_seconds`) || '0'),
      tts_characters: parseInt(await redis.get(`ratelimit:${userId}:${today}:tts_chars`) || '0'),
    };
  }

  async clearPlanCache(userId) {
    await redis.del(`plan:${userId}`);
  }
}

module.exports = new UsageService();
```

### 5.9 Whisper Service

Create file: `/home/appuser/api/services/whisper.js`

```javascript
const fetch = require('node-fetch');
const FormData = require('form-data');
const config = require('../config');

class WhisperService {

  async transcribe(audioBuffer, filename = 'audio.m4a') {
    const formData = new FormData();
    formData.append('file', audioBuffer, { filename });
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'json');

    const response = await fetch(config.openai.whisperUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.openai.apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Whisper API error: ${error.error?.message}`);
    }

    const result = await response.json();
    return { text: result.text, duration: result.duration };
  }
}

module.exports = new WhisperService();
```

### 5.10 TTS Service

Create file: `/home/appuser/api/services/tts.js`

```javascript
const fetch = require('node-fetch');
const config = require('../config');

class TTSService {

  async speak(text, options = {}) {
    const {
      voice = 'nova',
      model = 'tts-1',
      format = 'mp3',
      speed = 1.0
    } = options;

    const response = await fetch(config.openai.ttsUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.openai.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, input: text, voice, response_format: format, speed }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`TTS API error: ${error.error?.message}`);
    }

    const audioBuffer = await response.buffer();
    return { audio: audioBuffer, characterCount: text.length, format };
  }
}

module.exports = new TTSService();
```

### 5.11 Voice Route

Create file: `/home/appuser/api/routes/voice.js`

```javascript
const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const whisperService = require('../services/whisper');
const ttsService = require('../services/tts');
const usage = require('../services/usage');

// Speech to Text
router.post('/transcribe', authMiddleware, rateLimiter, async (req, res) => {
  try {
    const { audio } = req.body;
    if (!audio) return res.status(400).json({ error: 'No audio data provided' });

    const canUse = await usage.checkLimit(req.user.id, 'voice_seconds');
    if (!canUse) {
      return res.status(429).json({ error: 'Daily voice limit reached. Upgrade your plan.' });
    }

    const audioBuffer = Buffer.from(audio, 'base64');
    const result = await whisperService.transcribe(audioBuffer);

    await usage.increment(req.user.id, 'voice_seconds', result.duration);

    res.json({ text: result.text, duration: result.duration });
  } catch (error) {
    console.error('Transcribe error:', error);
    res.status(500).json({ error: 'Transcription failed' });
  }
});

// Text to Speech
router.post('/speak', authMiddleware, rateLimiter, async (req, res) => {
  try {
    const { text, voice, agent_id } = req.body;
    if (!text) return res.status(400).json({ error: 'No text provided' });

    const canUse = await usage.checkLimit(req.user.id, 'tts_chars');
    if (!canUse) {
      return res.status(429).json({ error: 'Daily TTS limit reached. Upgrade your plan.' });
    }

    const ttsModel = req.limits?.tts_model || 'tts-1';

    const result = await ttsService.speak(text, {
      voice: voice || 'nova',
      model: ttsModel,
    });

    await usage.increment(req.user.id, 'tts_chars', result.characterCount);

    res.json({
      audio: result.audio.toString('base64'),
      format: result.format,
      characterCount: result.characterCount,
    });
  } catch (error) {
    console.error('TTS error:', error);
    res.status(500).json({ error: 'Speech generation failed' });
  }
});

module.exports = router;
```

### 5.12 Assistants Route

Create file: `/home/appuser/api/routes/assistants.js`

```javascript
const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const openclawManager = require('../services/openclaw-manager');
const db = require('../db/pool');
const { v4: uuidv4 } = require('uuid');

// List assistants
router.get('/', authMiddleware, async (req, res) => {
  const result = await db.query(
    'SELECT * FROM assistants WHERE user_id = $1 AND status = $2 ORDER BY created_at',
    [req.user.id, 'active']
  );
  res.json(result.rows);
});

// Create assistant
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { display_name, voice } = req.body;

    // Check plan limit
    const countResult = await db.query(
      'SELECT COUNT(*) FROM assistants WHERE user_id = $1 AND status = $2',
      [req.user.id, 'active']
    );
    const currentCount = parseInt(countResult.rows[0].count);

    const planResult = await db.query(
      `SELECT pl.max_assistants, pl.model FROM subscriptions s
       JOIN plan_limits pl ON s.plan = pl.plan
       WHERE s.user_id = $1 AND s.status = 'active'`,
      [req.user.id]
    );
    const { max_assistants, model } = planResult.rows[0] || { max_assistants: 1, model: 'openai-custom/gpt-5-nano' };

    if (currentCount >= max_assistants) {
      return res.status(403).json({
        error: `Your plan allows ${max_assistants} assistant(s). Upgrade to add more.`
      });
    }

    // Generate agent ID
    const agentId = `agent_${uuidv4().replace(/-/g, '').substring(0, 16)}`;

    // Create OpenClaw agent (generic SOUL.md — agent discovers identity via chat)
    await openclawManager.createAgent({ agentId, model });

    // Save to database
    const result = await db.query(
      `INSERT INTO assistants (user_id, agent_id, display_name, voice, model)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, agentId, display_name || 'My Assistant', voice || 'nova', model]
    );

    // Save gateway mapping
    await db.query(
      `INSERT INTO user_gateway_map (user_id, gateway_id, agent_id)
       VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET agent_id = $3`,
      [req.user.id, 'gateway-main', agentId]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create assistant error:', error);
    res.status(500).json({ error: 'Failed to create assistant' });
  }
});

// Get assistant
router.get('/:id', authMiddleware, async (req, res) => {
  const result = await db.query(
    'SELECT * FROM assistants WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Assistant not found' });
  res.json(result.rows[0]);
});

// Update assistant
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { display_name, voice } = req.body;

    const result = await db.query(
      `UPDATE assistants SET
          display_name = COALESCE($1, display_name),
          voice = COALESCE($2, voice),
          updated_at = NOW()
       WHERE id = $3 AND user_id = $4 RETURNING *`,
      [display_name, voice, req.params.id, req.user.id]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Assistant not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update assistant error:', error);
    res.status(500).json({ error: 'Failed to update assistant' });
  }
});

// Delete assistant
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const assistant = await db.query(
      'SELECT * FROM assistants WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!assistant.rows[0]) return res.status(404).json({ error: 'Assistant not found' });

    await openclawManager.removeAgent(assistant.rows[0].agent_id);

    await db.query(
      'UPDATE assistants SET status = $1, updated_at = NOW() WHERE id = $2',
      ['deleted', req.params.id]
    );

    res.json({ message: 'Assistant deleted' });
  } catch (error) {
    console.error('Delete assistant error:', error);
    res.status(500).json({ error: 'Failed to delete assistant' });
  }
});

module.exports = router;
```

### 5.13 Gateway WebSocket Proxy

Create file: `/home/appuser/api/services/gateway-proxy.js`

```javascript
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db/pool');
const usage = require('./usage');

const connections = new Map();

function init(wss) {

  wss.on('connection', async (clientSocket, req) => {
    let userId, agentId;

    try {
      // 1. Authenticate
      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      agentId = url.searchParams.get('agent_id');

      if (!token || !agentId) {
        clientSocket.close(1008, 'Missing token or agent_id');
        return;
      }

      const decoded = jwt.verify(token, config.jwt.secret);
      userId = decoded.sub;

      // 2. Verify ownership
      const result = await db.query(
        `SELECT a.agent_id, a.voice, pl.daily_text_messages
         FROM assistants a
         JOIN subscriptions s ON s.user_id = a.user_id
         JOIN plan_limits pl ON pl.plan = s.plan
         WHERE a.agent_id = $1 AND a.user_id = $2 AND a.status = 'active'`,
        [agentId, userId]
      );

      if (!result.rows[0]) {
        clientSocket.close(1008, 'Assistant not found');
        return;
      }

      // 3. Connect to OpenClaw Gateway
      const gatewaySocket = new WebSocket(config.gateway.url);

      gatewaySocket.on('open', () => {
        gatewaySocket.send(JSON.stringify({
          method: 'connect',
          params: {
            auth: { token: config.gateway.token },
            device: { id: `app-${userId}`, name: `user-${userId}` }
          }
        }));
      });

      gatewaySocket.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.method === 'hello-ok') {
            clientSocket.send(JSON.stringify({ type: 'connected', agentId }));
            return;
          }

          if (msg.params?.text || msg.text) {
            clientSocket.send(JSON.stringify({
              type: 'message',
              content: msg.params?.text || msg.text,
              agentId,
              timestamp: new Date().toISOString()
            }));
          }

          if (msg.method === 'agent.chunk' || msg.params?.chunk) {
            clientSocket.send(JSON.stringify({
              type: 'chunk',
              content: msg.params?.chunk || msg.params?.text || '',
              agentId,
            }));
          }
        } catch (e) {
          console.error('[GatewayProxy] Parse error:', e);
        }
      });

      // 4. Handle client messages
      clientSocket.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.type === 'message' && msg.content) {
            const canSend = await usage.checkLimit(userId, 'text_messages');
            if (!canSend) {
              clientSocket.send(JSON.stringify({
                type: 'error',
                code: 'RATE_LIMITED',
                message: 'Daily message limit reached. Upgrade your plan for more messages.'
              }));
              return;
            }

            if (gatewaySocket.readyState === WebSocket.OPEN) {
              gatewaySocket.send(JSON.stringify({
                method: 'send',
                id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                params: {
                  channel: 'webchat',
                  peer: { kind: 'dm', id: agentId },
                  text: msg.content
                }
              }));

              await usage.increment(userId, 'text_messages', 1);
            }
          }
        } catch (e) {
          console.error('[GatewayProxy] Client message error:', e);
        }
      });

      // 5. Cleanup
      clientSocket.on('close', () => {
        gatewaySocket.close();
        connections.delete(userId);
      });

      gatewaySocket.on('close', () => {
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(JSON.stringify({ type: 'disconnected' }));
          clientSocket.close();
        }
        connections.delete(userId);
      });

      gatewaySocket.on('error', (err) => {
        console.error('[GatewayProxy] Gateway error:', err.message);
        clientSocket.close(1011, 'Gateway connection failed');
      });

      connections.set(userId, { client: clientSocket, gateway: gatewaySocket });

    } catch (err) {
      console.error('[GatewayProxy] Connection error:', err.message);
      clientSocket.close(1008, 'Authentication failed');
    }
  });
}

function getActiveConnections() {
  return connections.size;
}

module.exports = { init, getActiveConnections };
```

### 5.14 Main Server

Create file: `/home/appuser/api/server.js`

```javascript
require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));

// Stripe webhooks need raw body
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '25mb' }));

// REST Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/assistants', require('./routes/assistants'));
app.use('/api/voice', require('./routes/voice'));
app.use('/api/subscription', require('./routes/subscription'));
app.use('/api/webhooks', require('./routes/webhooks'));

// Health check
app.get('/health', async (req, res) => {
  const redis = require('./db/redis');
  const db = require('./db/pool');

  try {
    await db.query('SELECT 1');
    await redis.ping();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      db: 'connected',
      redis: 'connected',
    });
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: err.message });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(err.status || 500).json({
    error: config.nodeEnv === 'production' ? 'Internal server error' : err.message,
  });
});

// WebSocket server for chat
const wss = new WebSocket.Server({ server, path: '/ws/chat' });
const gatewayProxy = require('./services/gateway-proxy');
gatewayProxy.init(wss);

// Start
server.listen(config.port, '127.0.0.1', () => {
  console.log(`[API] Server running on port ${config.port}`);
  console.log(`[API] Environment: ${config.nodeEnv}`);
});
```

---

## 6. NGINX

Create file: `/etc/nginx/sites-available/openclaw-app`

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;

upstream api_backend {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    client_max_body_size 25M;

    location /api/auth/ {
        limit_req zone=auth burst=3 nodelay;
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        limit_req zone=api burst=50 nodelay;
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/webhooks/ {
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws/ {
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    location /health {
        proxy_pass http://api_backend;
        access_log off;
    }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/openclaw-app /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo certbot --nginx -d yourdomain.com
sudo nginx -t && sudo systemctl reload nginx
```

---

## 7. PM2 PROCESS MANAGEMENT

Create file: `/home/appuser/ecosystem.config.js`

```javascript
module.exports = {
  apps: [
    // ── OpenClaw Gateway (max power: 2 CPU / 14GB zone) ────
    {
      name: 'openclaw-gateway',
      script: 'openclaw',
      args: 'gateway',
      cwd: '/home/appuser',
      env: {
        OPENCLAW_CONFIG_PATH: '/home/appuser/.openclaw/openclaw.json',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        NODE_OPTIONS: '--max-old-space-size=12288',  // 12GB heap
      },
      max_memory_restart: '12G',
      restart_delay: 3000,
      max_restarts: 10,
      kill_timeout: 10000,
      error_file: '/home/appuser/logs/gateway-error.log',
      out_file: '/home/appuser/logs/gateway-out.log',
      merge_logs: true,
    },

    // ── API Server (2 CPU / 6GB zone) ──────────────────────
    {
      name: 'api-server',
      script: '/home/appuser/api/server.js',
      cwd: '/home/appuser/api',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=2048',  // 2GB per worker
      },
      max_memory_restart: '2G',
      restart_delay: 1000,
      max_restarts: 15,
      kill_timeout: 5000,
      listen_timeout: 8000,
      wait_ready: true,
      error_file: '/home/appuser/logs/api-error.log',
      out_file: '/home/appuser/logs/api-out.log',
      merge_logs: true,
    },
  ],
};
```

```bash
cd /home/appuser
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u appuser --hp /home/appuser
```

---

## 8. CRON JOBS & MAINTENANCE

Create file: `/home/appuser/scripts/backup.sh`

```bash
#!/bin/bash
set -e
BACKUP_DIR="/home/appuser/backups/$(date +%Y-%m-%d)"
mkdir -p "$BACKUP_DIR"

# Database (connect to Docker PostgreSQL)
docker exec your_postgres_container pg_dump -U appuser openclaw_app | gzip > "$BACKUP_DIR/database.sql.gz"

# OpenClaw workspaces + config
tar -czf "$BACKUP_DIR/openclaw.tar.gz" \
  /home/appuser/.openclaw/workspaces/ \
  /home/appuser/.openclaw/openclaw.json \
  /home/appuser/.openclaw/agents/

# API env
cp /home/appuser/api/.env "$BACKUP_DIR/.env.backup"

# Cleanup 30+ day old backups
find /home/appuser/backups/ -type d -mtime +30 -exec rm -rf {} + 2>/dev/null || true

echo "[$(date)] Backup done: $BACKUP_DIR"
```

Create file: `/home/appuser/scripts/healthcheck.sh`

```bash
#!/bin/bash
API=$(curl -sf -o /dev/null -w "%{http_code}" https://yourdomain.com/health)
if [ "$API" != "200" ]; then
  echo "[$(date)] API DOWN ($API) — restarting"
  pm2 restart api-server
fi

GW=$(pm2 jlist 2>/dev/null | jq -r '.[0].pm2_env.status // "unknown"')
if [ "$GW" != "online" ]; then
  echo "[$(date)] Gateway DOWN ($GW) — restarting"
  pm2 restart openclaw-gateway
fi
```

Create file: `/home/appuser/scripts/cleanup-inactive.sh`

```bash
#!/bin/bash
# Pause free-tier agents inactive for 30+ days

docker exec your_postgres_container psql -U appuser -d openclaw_app -t -c "
  SELECT a.agent_id FROM assistants a
  JOIN subscriptions s ON s.user_id = a.user_id
  WHERE s.plan = 'free'
  AND a.last_active_at < NOW() - INTERVAL '30 days'
  AND a.status = 'active'
" | while read agent_id; do
  agent_id=$(echo "$agent_id" | xargs)
  if [ -n "$agent_id" ]; then
    echo "[$(date)] Pausing inactive free agent: $agent_id"
    docker exec your_postgres_container psql -U appuser -d openclaw_app -c "
      UPDATE assistants SET status = 'paused' WHERE agent_id = '$agent_id'
    "
  fi
done
```

Setup crontab:

```bash
crontab -e
```

```cron
# Backup daily at 2 AM
0 2 * * * /home/appuser/scripts/backup.sh >> /home/appuser/logs/backup.log 2>&1

# Health check every 5 minutes
*/5 * * * * /home/appuser/scripts/healthcheck.sh >> /home/appuser/logs/healthcheck.log 2>&1

# Cleanup inactive free agents weekly (Sunday 3 AM)
0 3 * * 0 /home/appuser/scripts/cleanup-inactive.sh >> /home/appuser/logs/cleanup.log 2>&1

# Cleanup expired tokens daily at 4 AM
0 4 * * * docker exec your_postgres_container psql -U appuser -d openclaw_app -c "SELECT cleanup_expired_tokens();" >> /home/appuser/logs/cleanup.log 2>&1

# PM2 log rotation
0 0 * * * pm2 flush >> /dev/null 2>&1
```

```bash
chmod +x /home/appuser/scripts/*.sh
```

---

## 9. API ENDPOINTS SUMMARY

```
── Authentication ──────────────────────────────────────────
POST   /api/auth/signup           { email, password, name }
POST   /api/auth/login            { email, password }
POST   /api/auth/refresh          { refresh_token }
POST   /api/auth/logout           (revokes token)
POST   /api/auth/forgot-password  { email }
POST   /api/auth/reset-password   { token, new_password }

── User ────────────────────────────────────────────────────
GET    /api/user/profile          → user info + plan
PUT    /api/user/profile          { name, avatar_url }
GET    /api/user/usage            → today's usage + limits
DELETE /api/user/account          → delete account + all agents

── Assistants ──────────────────────────────────────────────
GET    /api/assistants            → list user's assistants
POST   /api/assistants            { display_name?, voice? }
GET    /api/assistants/:id        → assistant details
PUT    /api/assistants/:id        { display_name, voice }
DELETE /api/assistants/:id        → delete assistant + agent

── Chat (WebSocket) ────────────────────────────────────────
WS     /ws/chat?token=JWT&agent_id=AGENT_ID

Client → Server:
  { type: "message", content: "Hello!" }
  { type: "typing" }

Server → Client:
  { type: "connected", agentId }
  { type: "message", content: "...", agentId, timestamp }
  { type: "chunk", content: "...", agentId }
  { type: "error", code: "RATE_LIMITED", message: "..." }
  { type: "disconnected" }

── Voice ───────────────────────────────────────────────────
POST   /api/voice/transcribe      { audio: base64, format? }
       → { text, duration_seconds }

POST   /api/voice/speak           { text, voice?, agent_id? }
       → { audio: base64, format, character_count }

── Subscription ────────────────────────────────────────────
GET    /api/subscription          → current plan + billing info
POST   /api/subscription/checkout { plan, billing_cycle }
       → { checkout_url }
POST   /api/subscription/cancel   → cancel at period end
GET    /api/subscription/plans    → available plans + prices

── Webhooks ────────────────────────────────────────────────
POST   /api/webhooks/stripe       (Stripe webhook events)

── System ──────────────────────────────────────────────────
GET    /health                    → server status
```

---

## DEPLOYMENT CHECKLIST

```
── Server ──────────────────────────────────────────────────
[ ] Run setup.sh (installs Node, Nginx, OpenClaw, PM2)
[ ] Domain DNS pointed to server IP

── Database (Docker — already running) ─────────────────────
[ ] Create openclaw_app database in existing Docker PostgreSQL
[ ] Run schema.sql against Docker PostgreSQL
[ ] Verify connection from host: DATABASE_URL works

── Redis (Docker — already running) ────────────────────────
[ ] Verify connection from host: REDIS_URL works

── OpenClaw ────────────────────────────────────────────────
[ ] openclaw.json created with model: openai-custom/gpt-5-nano
[ ] SOUL.md template created (generic — agent discovers identity)
[ ] AGENTS.md template created
[ ] Gateway starts successfully via PM2

── API Server ──────────────────────────────────────────────
[ ] npm install in /home/appuser/api/
[ ] .env configured (Docker PG + Redis URLs, OpenAI key, JWT secret)
[ ] API starts in cluster mode via PM2
[ ] Test: POST /api/auth/signup
[ ] Test: POST /api/assistants (creates OpenClaw agent)
[ ] Test: WS /ws/chat (text chat works)
[ ] Test: POST /api/voice/transcribe
[ ] Test: POST /api/voice/speak

── Infrastructure ──────────────────────────────────────────
[ ] Nginx configured + SSL (certbot)
[ ] Firewall enabled (only 80/443/SSH)
[ ] PM2 auto-restart on boot
[ ] Backup cron running (uses docker exec for pg_dump)
[ ] Health check cron running
[ ] Cleanup cron running

── Billing ─────────────────────────────────────────────────
[ ] Stripe products + prices created
[ ] Webhook endpoint configured
[ ] Test: upgrade plan, verify limits change

── Final ───────────────────────────────────────────────────
[ ] Full flow: signup → create assistant → chat → voice → works
[ ] Rate limits enforced per plan
[ ] Multiple concurrent users tested
```
