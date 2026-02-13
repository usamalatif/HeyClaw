# HeyClaw Multi-User Architecture

How a single OpenClaw gateway serves many users, each with their own isolated AI agent.

## Overview

```
                                  +-----------------+
  Mobile App  ───HTTP───>  API   │  OpenClaw Gateway│
  (per user)              Server │                  │
                            │    │  agent-abc123    │
                            │    │  agent-def456    │
                            │    │  agent-ghi789    │
                            │    │  ...             │
                            │    +-----------------+
                            │           │
                    +-------+-------+   │
                    │  PostgreSQL   │   │  (reads config,
                    │  Redis       │   │   loads workspaces)
                    +--------------+   │
                                       v
                              /openclaw-workspaces/
                                agent-abc123/
                                  SOUL.md
                                  MEMORY.md
                                agent-def456/
                                  SOUL.md
                                  MEMORY.md
```

## Core Concept: One Gateway, Many Agents

OpenClaw supports running multiple named **agents** inside a single gateway process. Each agent has:

- A unique `agent_id` (e.g. `agent-<userId>`)
- Its own **workspace directory** with SOUL.md, MEMORY.md, AGENTS.md
- Its own conversation context and memory
- Shared model configuration (all agents use the same LLM)

The gateway routes requests to the correct agent via the `agent` field in the API request body.

## How It Works Step-by-Step

### 1. User Signs Up

```
POST /auth/signup { email, password, name }
```

The signup handler does three things:

1. **Creates user row** in `users` table (PostgreSQL trigger auto-creates a `subscriptions` row with `plan='free'`)
2. **Creates OpenClaw agent** via `agentManager.createAgent(agentId)`:
   - Creates workspace at `/openclaw-workspaces/agent-<userId>/`
   - Copies SOUL.md and AGENTS.md templates into workspace
   - Creates empty MEMORY.md and USER.md files
   - Adds agent to `openclaw.json` config (agents list + bindings)
   - Restarts the gateway container to pick up the new config
3. **Creates assistant row** in `assistants` table linking `user_id` to `agent_id`

**File**: `apps/api/src/routes/auth.ts` (lines 47-80)

### 2. User Sends a Message

```
POST /agent/message { text: "What's the weather?" }
Authorization: Bearer <jwt>
```

The message flow:

1. **Auth middleware** verifies JWT, extracts `userId`
2. **Rate limiter** checks `daily_usage` against `plan_limits` (Redis-cached)
3. **Agent lookup**: `SELECT agent_id FROM assistants WHERE user_id = $1`
4. **Route to OpenClaw**: POST to gateway with `{ agent: "agent-<userId>", messages: [...] }`
5. **Increment usage**: `daily_usage.text_messages += 1`
6. **Return response** with updated usage counts

**File**: `apps/api/src/routes/agent.ts` (lines 28-66)

### 3. OpenClaw Processes the Request

The gateway receives:

```json
{
  "model": "openclaw",
  "agent": "agent-abc123",
  "messages": [{ "role": "user", "content": "What's the weather?" }]
}
```

OpenClaw:
1. Looks up `agent-abc123` in its config
2. Loads the agent's workspace (SOUL.md for personality, MEMORY.md for context)
3. Sends the prompt to the configured LLM (gpt-5-nano via OpenAI API)
4. Returns the response (streaming or non-streaming)
5. Updates the agent's MEMORY.md with new conversation context

**File**: `apps/api/src/services/openclawClient.ts`

### 4. Voice Flow (Streaming)

```
POST /agent/voice { text: "Tell me a joke" }
```

Same agent routing, but:
1. Uses `streamFromOpenClaw()` (SSE streaming)
2. API streams tokens back to mobile in real-time
3. Sentences are batched and sent to ElevenLabs TTS
4. Audio chunks are streamed alongside text tokens

**File**: `apps/api/src/routes/agent.ts` (lines 69-223)

## Key Files

| File | Purpose |
|------|---------|
| `services/agentManager.ts` | Creates/removes/pauses agents in openclaw.json |
| `services/openclawClient.ts` | Routes API requests to specific agents on the gateway |
| `routes/auth.ts` | Signup creates agent + assistant row |
| `routes/agent.ts` | Message/voice endpoints look up agent by userId |
| `services/usage.ts` | Redis-based daily usage tracking per user |
| `middleware/rateLimiter.ts` | Enforces plan limits before requests hit the gateway |
| `infrastructure/gateway-entrypoint.sh` | Generates initial openclaw.json on first boot |

## The openclaw.json Config

This is the single source of truth for all agents. Managed by `agentManager.ts`.

```json
{
  "gateway": {
    "bind": "0.0.0.0",
    "port": 18789,
    "auth": { "mode": "token", "token": "..." }
  },
  "models": {
    "providers": {
      "openai-custom": {
        "baseUrl": "https://api.openai.com/v1",
        "apiKey": "sk-...",
        "models": [{ "id": "gpt-5-nano", "name": "GPT-5 Nano" }]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": "openai-custom/gpt-5-nano",
      "tools": { "deny": ["exec", "process", "browser", "canvas"] }
    },
    "list": [
      {
        "id": "agent-abc123",
        "name": "agent-abc123",
        "workspace": "/root/.openclaw/workspaces/agent-abc123",
        "model": "openai-custom/gpt-5-nano"
      },
      {
        "id": "agent-def456",
        "name": "agent-def456",
        "workspace": "/root/.openclaw/workspaces/agent-def456",
        "model": "openai-custom/gpt-5-nano"
      }
    ]
  },
  "bindings": [
    { "agentId": "agent-abc123", "match": { "channel": "webchat", "peer": { "kind": "dm", "id": "agent-abc123" } } },
    { "agentId": "agent-def456", "match": { "channel": "webchat", "peer": { "kind": "dm", "id": "agent-def456" } } }
  ]
}
```

When a new user signs up, `agentManager.createAgent()`:
1. Adds a new entry to `agents.list`
2. Adds a matching `bindings` entry
3. Writes the config atomically (tmp file + rename)
4. Restarts the gateway container (`docker restart heyclaw-gateway`)

## Database Tables

```
users (1) ──< subscriptions (1)     Each user has one subscription (free/pro/premium)
users (1) ──< assistants (1-N)      Each user has 1+ assistants (agents)
users (1) ──< daily_usage (1/day)   Rate limiting counters, reset daily
users (1) ──< chat_sessions (N)     Conversation history
```

The `assistants` table is the bridge between a user and their OpenClaw agent:

```sql
assistants
├── user_id       → users.id
├── agent_id      → "agent-<userId>" (matches openclaw.json)
├── display_name  → "My Assistant" (user-customizable)
├── voice         → "nova" (ElevenLabs TTS voice)
├── status        → active | paused | deleted
└── message_count → total messages sent
```

## Agent Isolation

Each agent is isolated through:

1. **Separate workspace**: Each agent reads/writes its own SOUL.md, MEMORY.md, etc.
2. **Conversation context**: OpenClaw maintains per-agent conversation history
3. **API routing**: The `agent` field in requests ensures messages go to the right agent
4. **Tool restrictions**: `tools.deny` prevents agents from executing code or accessing the filesystem outside their workspace

Agents **share**:
- The same LLM model and API keys
- The same gateway process (memory-efficient)
- The same Docker container

## Rate Limiting

Each user's plan determines their daily limits:

| Plan | Messages/day | Voice/day | Price |
|------|-------------|-----------|-------|
| Free | 50 | 2 min | $0 |
| Pro | 500 | 30 min | $9.99/mo |
| Premium | 2,000 | 120 min | $29.99/mo |

Limits are checked before every request via Redis:
```
ratelimit:{userId}:{date}:text_messages = 42  (TTL: 24h)
```

The plan limits are cached in Redis for 5 minutes:
```
plan:{userId} = {"plan": "pro", "limits": {...}}
```

## Agent Lifecycle

| Event | What happens |
|-------|-------------|
| **Signup** | `createAgent()` + INSERT into assistants |
| **Send message** | Look up agent_id, forward to gateway |
| **Plan upgrade** | Limits increase (Redis cache cleared) |
| **30 days inactive (free)** | `pauseAgent()` removes from config, keeps workspace |
| **User returns** | `resumeAgent()` adds back to config |
| **Account deletion** | `removeAgent()` deletes config entry + workspace |

## Scaling Considerations

**Current capacity** (single server, 32GB RAM):
- OpenClaw gateway: ~12GB heap
- Each active agent in config: ~10-50MB (depends on conversation context)
- Estimated: 200-500 concurrent agents comfortably

**When to scale**:
- Monitor gateway memory via `docker stats heyclaw-gateway`
- If approaching 12GB, pause inactive free-tier agents more aggressively
- For 1000+ users: split into multiple gateway containers, use `user_gateway_map` table to route users to their assigned gateway
