# HeyClaw Deployment Guide

Step-by-step deployment to your bare-metal server (93.115.26.164).

**Prerequisites on server**: Docker, Docker Compose, PostgreSQL (Docker), Redis (Docker).

---

## Architecture Overview

```
Internet
   |
   v :3000
+--------------+     +------------------+
|  heyclaw-api |---->| heyclaw-gateway  |
|  (Hono)      | HTTP|  (OpenClaw)      |
|              |:18789                   |
| - Auth (JWT) |     | - agent-user1    |
| - Rate limit |     | - agent-user2    |
| - TTS        |     | - agent-user3    |
+------+-------+     +------------------+
       |                  ^
       |                  | reads config +
       |                  | workspaces
       v                  |
+--------------+   +-------------+
| PostgreSQL   |   | Docker      |
| (existing)   |   | Volumes     |
+--------------+   |             |
| Redis        |   | - config    |
| (existing)   |   | - workspaces|
+--------------+   +-------------+

All on Docker network: "heyclaw"
```

**Two Docker containers:**
- `heyclaw-gateway` — OpenClaw AI agent framework (WebSocket + HTTP API on port 18789)
- `heyclaw-api` — Hono API server (auth, billing, agent management, TTS on port 3000)

**Shared Docker volumes (mounted at different paths per container):**

| Volume | Gateway Container | API Container |
|--------|-------------------|---------------|
| `openclaw_config` | `/root/.openclaw` | `/openclaw-config` |
| `openclaw_workspaces` | `/root/.openclaw/workspaces` | `/openclaw-workspaces` |

---

## Step 1: Get the code on the server

```bash
# Option A: Git clone
ssh root@93.115.26.164
cd /root
git clone <your-repo-url> heyclaw
cd heyclaw

# Option B: rsync from local Mac
rsync -avz --exclude node_modules --exclude .git \
  /Users/usamalatif/Desktop/Apps/HeyClaw/ \
  root@93.115.26.164:/root/heyclaw/
```

---

## Step 2: Create the database

SSH into the server:

```bash
ssh root@93.115.26.164
```

Find your Postgres container:

```bash
docker ps | grep postgres
# Note the container name, e.g. "companion-db"
```

Create the database and run the schema:

```bash
# Create user + database (adjust container name)
docker exec -i companion-db psql -U postgres -c "CREATE USER openclaw WITH PASSWORD 'PICK_A_SECURE_PASSWORD';"
docker exec -i companion-db psql -U postgres -c "CREATE DATABASE openclaw_app OWNER openclaw;"

# Run the schema
docker exec -i companion-db psql -U openclaw -d openclaw_app < /root/heyclaw/infrastructure/server/db/schema.sql
```

Verify tables:

```bash
docker exec -i companion-db psql -U openclaw -d openclaw_app -c "\dt"
# Should show: users, subscriptions, plan_limits, assistants, daily_usage, etc.
```

This creates:
- Auto-creates a `free` subscription on user signup (DB trigger)
- `increment_daily_usage()` function for atomic rate limiting
- Three plans: `free` (50 msgs/day), `pro` (500/day), `premium` (2000/day)

---

## Step 3: Understanding the OpenClaw Gateway

OpenClaw is the AI agent framework running inside `heyclaw-gateway`. It's fully automated — no manual installation needed.

### What happens automatically on first boot

1. **OpenClaw is pre-installed** in the Docker image (`npm install -g openclaw@latest`, see `infrastructure/gateway.Dockerfile`)
2. **Config is auto-generated** by `infrastructure/gateway-entrypoint.sh` at `/root/.openclaw/openclaw.json` with:
   - OpenAI custom provider: `openai-custom/gpt-5-nano`
   - Token-based auth (from `OPENCLAW_GATEWAY_TOKEN` env var)
   - HTTP chatCompletions endpoint enabled
   - Sandbox mode OFF (critical — see troubleshooting)
   - Empty agent list (populated as users sign up)
3. **Gateway starts** with `openclaw gateway --bind lan --port 18789 --allow-unconfigured`
4. **Config persists** via Docker volume — only regenerated if the file doesn't exist

### What happens when a user signs up

1. API creates workspace at `/openclaw-workspaces/agent-<userId>/` with SOUL.md, AGENTS.md, MEMORY.md, USER.md
2. API adds agent to `/openclaw-config/openclaw.json` (agent list + bindings)
3. API runs `docker restart heyclaw-gateway` to load the new agent
4. Assistant row inserted in DB (maps user_id -> agent_id)

### How messages are routed

```
POST /agent/message {"text": "Hello"}
  -> JWT auth + rate limit check
  -> Look up agent_id from assistants table
  -> POST to gateway:18789/v1/chat/completions
     Headers: Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>
              x-openclaw-agent-id: <agent-id>
  -> Gateway routes to correct agent, calls OpenAI
  -> Response returned with usage counter
```

### Key files

| File | Purpose |
|------|---------|
| `infrastructure/gateway.Dockerfile` | Gateway image (Node 22 + OpenClaw) |
| `infrastructure/gateway-entrypoint.sh` | Config generation + gateway startup |
| `infrastructure/server/templates/SOUL.md` | Default agent personality |
| `infrastructure/server/templates/AGENTS.md` | Default agent instructions |
| `apps/api/src/services/agentManager.ts` | Adds/removes agents from config |
| `apps/api/src/services/openclawClient.ts` | HTTP client for gateway |

---

## Step 4: Create .env.production

```bash
cd /root/heyclaw
cp .env.production.example .env.production
nano .env.production
```

Fill in:

```env
PORT=3000
NODE_ENV=production

# PostgreSQL (use Docker container name, NOT host.docker.internal)
DATABASE_URL=postgres://openclaw:YOUR_PASSWORD@companion-db:5432/openclaw_app

# Redis (use Docker container name)
REDIS_URL=redis://companion-redis:6379

# Auth — generate a strong secret
JWT_SECRET=<paste output of: openssl rand -hex 64>

# OpenAI (for GPT-5 Nano model + Whisper STT)
OPENAI_API_KEY=sk-your-real-key

# ElevenLabs TTS
ELEVENLABS_API_KEY=your-real-key

# OpenClaw Gateway — shared token between API and gateway
OPENCLAW_GATEWAY_URL=http://gateway:18789
OPENCLAW_GATEWAY_TOKEN=<paste output of: openssl rand -hex 32>

# Paths (API container paths — gateway overrides these in docker-compose.yml)
OPENCLAW_CONFIG_PATH=/openclaw-config/openclaw.json
WORKSPACES_DIR=/openclaw-workspaces
GATEWAY_WORKSPACES_DIR=/root/.openclaw/workspaces
TEMPLATES_DIR=/app/templates
GATEWAY_CONTAINER_NAME=heyclaw-gateway
```

Generate secrets:

```bash
echo "JWT_SECRET: $(openssl rand -hex 64)"
echo "OPENCLAW_GATEWAY_TOKEN: $(openssl rand -hex 32)"
```

---

## Step 5: Connect existing containers to the heyclaw network

```bash
# Create network (docker compose also does this, but create now for pre-connecting)
docker network create heyclaw 2>/dev/null || true

# Connect your existing Postgres + Redis containers
docker network connect heyclaw companion-db
docker network connect heyclaw companion-redis

# Verify
docker network inspect heyclaw --format '{{range .Containers}}{{.Name}} {{end}}'
```

---

## Step 6: Build and start

```bash
cd /root/heyclaw
docker compose up -d --build
```

This builds two images:
- **Gateway** (`infrastructure/gateway.Dockerfile`): Node.js 22 + OpenClaw globally installed
- **API** (`apps/api/Dockerfile`): Node.js 20 + compiled TypeScript + Docker CLI

---

## Step 7: Verify deployment

```bash
# 1. Check containers are running
docker compose ps

# 2. Check API health
curl http://localhost:3000/health
# Expected: {"status":"ok","service":"heyclaw-api"}

# 3. Check gateway logs
docker logs heyclaw-gateway --tail 10
# Expected: "[gateway] listening on ws://0.0.0.0:18789"

# 4. Verify gateway config is correct
docker exec heyclaw-gateway python3 -c "
import json
c = json.load(open('/root/.openclaw/openclaw.json'))
print('chatCompletions:', c['gateway']['http']['endpoints']['chatCompletions'])
print('sandbox:', c['agents']['defaults']['sandbox'])
print('auth mode:', c['gateway']['auth']['mode'])
"
# Expected:
#   chatCompletions: {'enabled': True}
#   sandbox: {'mode': 'off', 'workspaceAccess': 'rw'}
#   auth mode: token

# 5. Verify both containers have the same gateway token
docker exec heyclaw-gateway sh -c 'echo "GW: $OPENCLAW_GATEWAY_TOKEN"'
docker exec heyclaw-api sh -c 'echo "API: $OPENCLAW_GATEWAY_TOKEN"'
# Must match!

# 6. Test gateway directly from API container
docker exec heyclaw-api curl -s --max-time 15 -X POST http://gateway:18789/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(docker exec heyclaw-api printenv OPENCLAW_GATEWAY_TOKEN)" \
  -H "x-openclaw-agent-id: test-agent" \
  -d '{"model":"openclaw","messages":[{"role":"user","content":"Hello"}]}'
# Expected: JSON with choices[0].message.content
```

---

## Step 8: Test the full signup + message flow

```bash
# Sign up a test user
curl -s -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"testpass123","name":"Test User"}' | python3 -m json.tool

# Save the access_token from the response
TOKEN="<paste access_token here>"

# Check agent was created
curl -s http://localhost:3000/agent/status \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Send a message (NOTE: field is "text", not "message")
curl -s --max-time 30 -X POST http://localhost:3000/agent/message \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello, what can you help me with?"}' | python3 -m json.tool

# Expected response includes:
# {
#     "response": "I can help with ...",
#     "usage": { "messagesUsed": 1, "messagesLimit": 50 }
# }
```

If the message returns an AI response with usage tracking, everything is working end-to-end.

---

## How docker-compose.yml Works

Both containers share `.env.production` via `env_file`. The gateway needs **environment overrides** because volume paths differ:

```yaml
gateway:
  env_file:
    - .env.production         # All env vars from this file
  environment:
    # CRITICAL: Override paths that are API-specific
    OPENCLAW_CONFIG_PATH: /root/.openclaw/openclaw.json   # gateway's mount
    WORKSPACES_DIR: /root/.openclaw/workspaces            # gateway's mount
    TEMPLATES_DIR: ""           # not needed in gateway
    GATEWAY_CONTAINER_NAME: ""  # not needed in gateway
    DATABASE_URL: ""            # not needed in gateway
    REDIS_URL: ""               # not needed in gateway
```

**Why?** `.env.production` has `OPENCLAW_CONFIG_PATH=/openclaw-config/openclaw.json` (the API container's path). Without the override, the gateway tries to read from `/openclaw-config/` which doesn't exist inside the gateway container, causing it to fall back to defaults with HTTP API disabled.

---

## API Endpoints Reference

### Auth

| Method | Path | Auth | Body | Description |
|--------|------|------|------|-------------|
| POST | `/auth/signup` | No | `{email, password, name?}` | Create account + agent |
| POST | `/auth/login` | No | `{email, password}` | Login, get tokens |
| POST | `/auth/refresh` | No | `{refresh_token}` | Rotate tokens |
| POST | `/auth/logout` | Yes | — | Blacklist JWT, revoke refresh |
| POST | `/auth/forgot-password` | No | `{email}` | Request password reset |
| POST | `/auth/reset-password` | No | `{token, new_password}` | Reset password |

### Agent

| Method | Path | Auth | Body | Description |
|--------|------|------|------|-------------|
| POST | `/agent/message` | Yes | `{"text": "..."}` | Send message, get response |
| POST | `/agent/voice` | Yes | `{"text": "...", "voice?": "nova", "nativeTts?": false}` | SSE stream with text + audio |
| GET | `/agent/status` | Yes | — | Agent status + message count |
| GET | `/agent/health` | Yes | — | Gateway health check |
| PATCH | `/agent/personality` | Yes | `{displayName?, voice?}` | Update assistant settings |

### Other

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | API health check |
| GET | `/user/me` | Yes | User profile + usage |
| * | `/chat/*` | Yes | Chat session CRUD |
| * | `/billing/*` | Yes | Apple IAP management |

---

## Common Operations

### View logs

```bash
docker compose logs -f          # Both containers
docker compose logs -f api      # API only
docker compose logs -f gateway  # Gateway only
```

### Rebuild and redeploy

```bash
cd /root/heyclaw
git pull    # or rsync from Mac
docker compose down
docker compose up -d --build
```

Agent data persists (Docker volumes). Gateway config is only regenerated if deleted.

### Rebuild API only (faster)

```bash
docker compose build api && docker compose up -d api
```

### Check registered agents

```bash
docker exec heyclaw-gateway python3 -c "
import json
c = json.load(open('/root/.openclaw/openclaw.json'))
for a in c['agents']['list']:
    print(f\"  {a['id']} -> {a['workspace']}\")
print(f'Total: {len(c[\"agents\"][\"list\"])} agents')
"
```

### Force regenerate gateway config

**Warning:** This removes all registered agents. Users will need agents re-created (happens on next signup/login).

```bash
docker exec heyclaw-gateway rm /root/.openclaw/openclaw.json
docker restart heyclaw-gateway
sleep 15
docker exec heyclaw-gateway python3 -c "
import json; print(json.dumps(json.load(open('/root/.openclaw/openclaw.json')), indent=2))
"
```

### Database queries

```bash
# Connect to PostgreSQL
docker exec -it companion-db psql -U openclaw -d openclaw_app

# Useful queries:
SELECT id, email, created_at FROM users;
SELECT user_id, agent_id, status, message_count FROM assistants;
SELECT u.email, d.date, d.text_messages FROM daily_usage d JOIN users u ON u.id = d.user_id ORDER BY d.date DESC;
SELECT u.email, s.plan, s.status FROM subscriptions s JOIN users u ON u.id = s.user_id;
```

### Reset everything (start fresh)

```bash
docker compose down
docker volume rm heyclaw_openclaw_config heyclaw_openclaw_workspaces

# Re-create database
docker exec -i companion-db psql -U postgres -c "DROP DATABASE IF EXISTS openclaw_app;"
docker exec -i companion-db psql -U postgres -c "CREATE DATABASE openclaw_app OWNER openclaw;"
docker exec -i companion-db psql -U openclaw -d openclaw_app < /root/heyclaw/infrastructure/server/db/schema.sql

# Rebuild and start
docker compose build && docker compose up -d
```

---

## Troubleshooting

### Gateway returns 405 Method Not Allowed on POST

The HTTP chatCompletions endpoint is disabled in the config.

```bash
docker exec heyclaw-gateway python3 -c "
import json; c = json.load(open('/root/.openclaw/openclaw.json'))
print(c['gateway']['http']['endpoints'])
"
```

**Fix:** Must show `{'chatCompletions': {'enabled': True}}`. If wrong, delete config and restart to regenerate (see "Force regenerate" above).

**Root cause:** The gateway read `OPENCLAW_CONFIG_PATH` from `.env.production` which points to `/openclaw-config/...` (API's path). That path doesn't exist in the gateway container, so OpenClaw fell back to defaults with HTTP disabled. The `environment:` overrides in `docker-compose.yml` fix this.

### Gateway crashes with `spawn docker ENOENT`

OpenClaw sandbox mode tries to spawn Docker CLI, which isn't installed in the gateway container.

```bash
docker exec heyclaw-gateway python3 -c "
import json; c = json.load(open('/root/.openclaw/openclaw.json'))
print(c['agents']['defaults']['sandbox'])
"
```

**Fix:** Must show `{'mode': 'off', 'workspaceAccess': 'rw'}`. If it shows `mode: 'all'`, delete config and restart to regenerate with the corrected entrypoint.

### API gets 401 Unauthorized from Gateway

Token mismatch between containers.

```bash
docker exec heyclaw-gateway sh -c 'echo "GW: $OPENCLAW_GATEWAY_TOKEN"'
docker exec heyclaw-api sh -c 'echo "API: $OPENCLAW_GATEWAY_TOKEN"'
```

**Fix:** Both must show the same token. If empty or different, check `.env.production` has `OPENCLAW_GATEWAY_TOKEN` set, then `docker compose down && docker compose up -d`.

### Gateway reads wrong config path

```bash
docker exec heyclaw-gateway env | grep OPENCLAW_CONFIG_PATH
```

**Fix:** Must show `/root/.openclaw/openclaw.json` (not `/openclaw-config/...`). Ensure `docker-compose.yml` has the `environment:` override for `OPENCLAW_CONFIG_PATH`.

### Empty reply from server / Connection reset

Gateway crashed mid-request. Check logs:

```bash
docker logs heyclaw-gateway --tail 30
```

Most common cause: sandbox `spawn docker ENOENT` crash (see above).

### Agent creation fails on signup

```bash
docker compose logs api | grep "Failed to create agent"
```

Common causes:
- Gateway not ready (takes 10-30s to start) — restart API: `docker compose restart api`
- Config volume permissions: `docker exec heyclaw-api ls -la /openclaw-config/`
- Templates missing: `docker exec heyclaw-api ls -la /app/templates/`

### Config change not taking effect

The gateway entrypoint only generates config if the file doesn't exist (`if [ ! -f "$CONFIG_PATH" ]`). To apply entrypoint changes:

```bash
# Delete old config so it regenerates
docker exec heyclaw-gateway rm /root/.openclaw/openclaw.json
docker restart heyclaw-gateway
```

### Env var changes not taking effect

Docker container env vars are baked at creation time. Changing `.env.production` requires container recreation:

```bash
docker compose down && docker compose up -d
```

Just `docker restart` is NOT enough.

---

## File Structure

```
HeyClaw/
  .env.production              # Production secrets (NOT in git)
  .env.production.example      # Template with placeholder values
  docker-compose.yml           # Orchestrates gateway + API containers

  apps/api/
    Dockerfile                 # API image (Node 20 + Docker CLI)
    src/
      index.ts                 # Hono app entry point
      routes/
        auth.ts                # Signup, login, refresh, logout, password reset
        agent.ts               # Message, voice (SSE), status, personality
        user.ts                # Profile, usage info
        chat.ts                # Chat session CRUD
        billing.ts             # Apple IAP subscription management
        voice.ts               # STT (Whisper)
      services/
        agentManager.ts        # Create/remove agents in openclaw.json
        openclawClient.ts      # HTTP client for gateway (token auth + agent routing)
        tts.ts                 # ElevenLabs TTS
        usage.ts               # Daily usage tracking (Redis + PostgreSQL)
      middleware/
        auth.ts                # JWT verification + Redis blacklist
        rateLimiter.ts         # Daily limit enforcement per plan
      db/
        pool.ts                # PostgreSQL connection pool
        redis.ts               # Redis (ioredis) connection

  infrastructure/
    gateway.Dockerfile         # Gateway image (Node 22 + OpenClaw)
    gateway-entrypoint.sh      # Config generation + gateway startup
    server/
      db/schema.sql            # Full database schema (tables, triggers, functions)
      templates/
        SOUL.md                # Default agent personality (copied per user)
        AGENTS.md              # Default agent instructions (copied per user)
```
