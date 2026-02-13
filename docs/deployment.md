# HeyClaw Deployment Guide

Step-by-step deployment to your bare-metal server (93.115.26.164).

**Prerequisites on server**: Docker, Docker Compose, PostgreSQL (Docker), Redis (Docker).

---

## Step 1: Get the code on the server

From your Mac:

```bash
# Option A: Git clone
ssh root@93.115.26.164
cd /opt
git clone <your-repo-url> heyclaw
cd heyclaw

# Option B: rsync from local
rsync -avz --exclude node_modules --exclude .git \
  /Users/usamalatif/Desktop/Apps/HeyClaw/ \
  root@93.115.26.164:/opt/heyclaw/
```

---

## Step 2: Create the database

SSH into the server and run schema.sql against your existing Postgres.

```bash
ssh root@93.115.26.164
```

Find your Postgres container name:

```bash
docker ps | grep postgres
# Note the container name, e.g. "my-postgres" or "postgres-1"
```

Create the database and run the schema:

```bash
# Create the database + user (adjust container name)
docker exec -i companion-db psql -U postgres -c "CREATE USER openclaw WITH PASSWORD 'PICK_A_SECURE_PASSWORD';"
docker exec -i companion-db psql -U postgres -c "CREATE DATABASE openclaw_app OWNER openclaw;"

# Run the schema
docker exec -i companion-db psql -U openclaw -d openclaw_app < /opt/heyclaw/infrastructure/server/db/schema.sql
```

Verify tables were created:

```bash
docker exec -i companion-db psql -U openclaw -d openclaw_app -c "\dt"
# Should show: users, subscriptions, plan_limits, assistants, daily_usage, etc.
```

---

## Step 3: Understand the OpenClaw setup

OpenClaw is the AI agent framework that runs inside the `heyclaw-gateway` container. You don't need to install or configure it manually — it's fully automated.

### What happens automatically

When you run `docker compose up`, the gateway container:

1. **Installs OpenClaw** — `npm install -g openclaw@latest` (baked into the Docker image at build time, see `infrastructure/gateway.Dockerfile`)
2. **Generates `openclaw.json`** — on first boot only, the entrypoint script (`infrastructure/gateway-entrypoint.sh`) creates the config at `/root/.openclaw/openclaw.json` with:
   - OpenAI custom provider pointing to `https://api.openai.com/v1`
   - Model: `gpt-5-nano` (via your `OPENAI_API_KEY`)
   - Token-based gateway auth (via your `OPENCLAW_GATEWAY_TOKEN`)
   - Empty agent list (agents get added when users sign up)
3. **Starts the gateway** — runs `openclaw gateway --bind lan --port 18789`
4. **Persists config across restarts** — the `openclaw_config` Docker volume keeps `openclaw.json` and agent state. The config is only generated on first boot; subsequent restarts preserve the existing agent list.

### What happens when a user signs up

The API server (`auth.ts` → `agentManager.ts`):

1. Creates a workspace directory at `/openclaw-workspaces/agent-<userId>/`
2. Copies `SOUL.md` and `AGENTS.md` templates into the workspace (from `infrastructure/server/templates/`)
3. Creates empty `MEMORY.md` and `USER.md` files
4. Adds the agent to `openclaw.json` (agent list + bindings)
5. Runs `docker restart heyclaw-gateway` to pick up the new agent

### Key files

| File | What it does |
|------|-------------|
| `infrastructure/gateway.Dockerfile` | Builds the OpenClaw image (node:22 + openclaw) |
| `infrastructure/gateway-entrypoint.sh` | Generates initial config on first boot, starts gateway |
| `infrastructure/server/templates/SOUL.md` | Agent personality template (copied per user) |
| `infrastructure/server/templates/AGENTS.md` | Agent capabilities/rules (copied per user) |
| `apps/api/src/services/agentManager.ts` | Adds/removes agents from `openclaw.json` at runtime |
| `apps/api/src/services/openclawClient.ts` | Sends messages to specific agents on the gateway |

### Config location inside containers

| Path | Container | Purpose |
|------|-----------|---------|
| `/root/.openclaw/openclaw.json` | heyclaw-gateway | Gateway config (agents, models, auth) |
| `/root/.openclaw/workspaces/agent-xxx/` | heyclaw-gateway | Per-user agent files (SOUL.md, MEMORY.md) |
| `/openclaw-config/openclaw.json` | heyclaw-api | Same file, shared via Docker volume |
| `/openclaw-workspaces/agent-xxx/` | heyclaw-api | Same dir, shared via Docker volume |

Both containers mount the same Docker volumes (`openclaw_config`, `openclaw_workspaces`), so the API can write config changes and the gateway reads them.

### No OpenClaw account needed

OpenClaw runs with `--allow-unconfigured`, meaning it doesn't need a cloud account or license. It uses your OpenAI API key directly via the custom provider config.

---

## Step 4: Find your Postgres + Redis container names

You need the container names (or IPs) of your existing Postgres and Redis.

```bash
# Get container names
docker ps --format "{{.Names}}\t{{.Image}}\t{{.Ports}}" | grep -E "postgres|redis"

# Example output:
# my-postgres   postgres:16    0.0.0.0:5432->5432/tcp
# my-redis      redis:7        0.0.0.0:6379->6379/tcp
```

companion-db	postgres:15-alpine	5432/tcp
companion-redis	redis:7-alpine	6379/tcp

Note down the container names. You'll use them in Step 5.

---

## Step 5: Create .env.production

```bash
cd /opt/heyclaw
cp .env.production.example .env.production
nano .env.production    # or vim
```

Fill in the values:

```env
PORT=3000
NODE_ENV=production

# Point to your EXISTING Postgres container
# Replace YOUR_POSTGRES_CONTAINER with the actual container name
# Replace YOUR_PASSWORD with the password from Step 2
DATABASE_URL=postgres://openclaw:YOUR_PASSWORD@YOUR_POSTGRES_CONTAINER:5432/openclaw_app

# Point to your EXISTING Redis container
REDIS_URL=redis://YOUR_REDIS_CONTAINER:6379

# Generate a random JWT secret
JWT_SECRET=PASTE_OUTPUT_OF_NEXT_COMMAND

# Your API keys
OPENAI_API_KEY=sk-proj-...
ELEVENLABS_API_KEY=sk_...

# Gateway (don't change these — they use Docker service names)
OPENCLAW_GATEWAY_URL=http://gateway:18789
OPENCLAW_CONFIG_PATH=/openclaw-config/openclaw.json
WORKSPACES_DIR=/openclaw-workspaces
TEMPLATES_DIR=/app/templates
GATEWAY_CONTAINER_NAME=heyclaw-gateway
```

Generate the JWT secret:

```bash
openssl rand -hex 64
```

> **Note:** The gateway auth token is auto-generated by OpenClaw on first boot. The API reads it automatically from the shared `openclaw.json` config volume — no manual setup needed.

---

## Step 6: Connect your existing containers to the heyclaw network

The API and gateway containers run on a Docker network called `heyclaw`. Your existing Postgres and Redis containers need to be on the same network so they can talk to each other.

```bash
# Create the network (docker compose will also do this, but do it now so we can connect)
docker network create heyclaw 2>/dev/null || true

# Connect your existing containers
docker network connect heyclaw companion-db
docker network connect heyclaw companion-redis
```

Verify they're connected:

```bash
docker network inspect heyclaw --format '{{range .Containers}}{{.Name}} {{end}}'
# Should list your postgres and redis container names
```

---

## Step 7: Build and start

```bash
cd /opt/heyclaw

# Load env vars for docker-compose substitution
set -a && source .env.production && set +a

# Build both images
docker compose build

# Start everything
docker compose up -d
```

This starts two containers:
- `heyclaw-gateway` — OpenClaw AI gateway (port 18789, localhost only)
- `heyclaw-api` — Hono API server (port 3000, public)

---

## Step 8: Verify

```bash
# Check containers are running
docker compose ps

# Check API health
curl http://localhost:3000/health

# Check gateway is reachable from API
docker exec heyclaw-api node -e "fetch('http://gateway:18789/').then(r => r.text()).then(console.log).catch(e => console.error('Gateway not ready:', e.message))"

# Check API can reach Postgres
docker exec heyclaw-api node -e "
  const {Pool} = require('pg');
  const p = new Pool({connectionString: process.env.DATABASE_URL});
  p.query('SELECT COUNT(*) FROM users').then(r => {
    console.log('DB OK — users:', r.rows[0].count);
    p.end();
  }).catch(e => { console.error('DB error:', e.message); p.end(); });
"

# Check API can reach Redis
docker exec heyclaw-api node -e "
  const Redis = require('ioredis');
  const r = new Redis(process.env.REDIS_URL);
  r.ping().then(res => { console.log('Redis OK:', res); r.disconnect(); })
    .catch(e => { console.error('Redis error:', e.message); r.disconnect(); });
"
```

---

## Step 9: Test signup + message flow

```bash
# Sign up a test user
curl -s -X POST http://93.115.26.164:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"testpass123","name":"Test User"}' | jq .

# Save the access token from the response
TOKEN="paste-access-token-here"

# Check agent was created
curl -s http://93.115.26.164:3000/agent/status \
  -H "Authorization: Bearer $TOKEN" | jq .

# Send a message
curl -s -X POST http://93.115.26.164:3000/agent/message \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello, who are you?"}' | jq .
```

If the message returns a response from the AI, everything is working.

---

## Step 10: View logs

```bash
# API logs (requests, errors)
docker compose logs -f api

# Gateway logs (OpenClaw, agent creation)
docker compose logs -f gateway

# Both
docker compose logs -f
```

---

## Updating / Redeploying

After code changes, push to the server and rebuild:

```bash
# From your Mac — sync code
rsync -avz --exclude node_modules --exclude .git \
  /Users/usamalatif/Desktop/Apps/HeyClaw/ \
  root@93.115.26.164:/opt/heyclaw/

# On the server — rebuild + restart API only (gateway rarely changes)
ssh root@93.115.26.164
cd /opt/heyclaw
docker compose build api && docker compose up -d api

# If gateway code changed too:
docker compose build && docker compose up -d
```

---

## Troubleshooting

### API can't reach Postgres/Redis

```bash
# Check your containers are on the heyclaw network
docker network inspect heyclaw

# If not, reconnect them
docker network connect heyclaw YOUR_POSTGRES_CONTAINER
docker network connect heyclaw YOUR_REDIS_CONTAINER
```

### Gateway takes long to start

OpenClaw needs 10-30 seconds to initialize. The API retries automatically. Check gateway logs:

```bash
docker compose logs -f gateway
```

### Agent creation fails on signup

Check the API logs for the error:

```bash
docker compose logs api | grep "Failed to create agent"
```

Common causes:
- Gateway not ready yet (restart API: `docker compose restart api`)
- Config volume permissions (check: `docker exec heyclaw-api ls -la /openclaw-config/`)

### Database schema missing

```bash
docker exec -i YOUR_POSTGRES_CONTAINER psql -U openclaw -d openclaw_app < /opt/heyclaw/infrastructure/server/db/schema.sql
```

### Reset everything (start fresh)

```bash
docker compose down
docker volume rm heyclaw_openclaw_config heyclaw_openclaw_workspaces

# Re-create database
docker exec -i YOUR_POSTGRES_CONTAINER psql -U postgres -c "DROP DATABASE IF EXISTS openclaw_app;"
docker exec -i YOUR_POSTGRES_CONTAINER psql -U postgres -c "CREATE DATABASE openclaw_app OWNER openclaw;"
docker exec -i YOUR_POSTGRES_CONTAINER psql -U openclaw -d openclaw_app < /opt/heyclaw/infrastructure/server/db/schema.sql

# Rebuild and start
docker compose build && docker compose up -d
```

---

## Architecture Summary

```
Internet
   │
   ▼ :3000
┌──────────────┐     ┌──────────────────┐
│  heyclaw-api │────▶│ heyclaw-gateway   │
│  (Hono)      │     │ (OpenClaw)        │
│              │     │                   │
│ • Auth (JWT) │     │ • agent-user1     │
│ • Rate limit │     │ • agent-user2     │
│ • TTS        │     │ • agent-user3     │
└──────┬───────┘     └───────────────────┘
       │                  ▲
       │                  │ reads config +
       │                  │ workspaces
       ▼                  │
┌──────────────┐   ┌─────────────┐
│ PostgreSQL   │   │ Docker      │
│ (existing)   │   │ Volumes     │
├──────────────┤   │             │
│ Redis        │   │ • config    │
│ (existing)   │   │ • workspaces│
└──────────────┘   └─────────────┘
```

All on Docker network: `heyclaw`
