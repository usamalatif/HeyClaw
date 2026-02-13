#!/bin/sh
set -e

CONFIG_PATH="/root/.openclaw/openclaw.json"

# Only generate initial config if none exists (preserves agent list across restarts)
if [ ! -f "$CONFIG_PATH" ]; then
  echo "No config found — generating initial openclaw.json"
  cat > "$CONFIG_PATH" << EOF
{
  "env": {
    "OPENAI_API_KEY": "${OPENAI_API_KEY}"
  },
  "models": {
    "providers": {
      "openai-custom": {
        "baseUrl": "https://api.openai.com/v1",
        "apiKey": "${OPENAI_API_KEY}",
        "api": "openai-completions",
        "models": [
          { "id": "gpt-5-nano", "name": "GPT-5 Nano" },
          { "id": "gpt-5-nano-2025-08-07", "name": "GPT-5 Nano (dated)" }
        ]
      }
    },
    "default": "openai-custom/gpt-5-nano"
  },
  "gateway": {
    "bind": "0.0.0.0",
    "port": 18789,
    "auth": {
      "mode": "token",
      "token": "${OPENCLAW_GATEWAY_TOKEN}"
    },
    "http": {
      "endpoints": {
        "chatCompletions": { "enabled": true }
      }
    }
  },
  "agents": {
    "defaults": {
      "model": "openai-custom/gpt-5-nano",
      "sandbox": { "mode": "all", "workspaceAccess": "rw" },
      "tools": { "deny": ["exec", "process", "browser", "canvas"] }
    },
    "list": []
  },
  "bindings": [],
  "channels": { "webchat": {} },
  "cron": { "enabled": true, "maxConcurrentRuns": 1 },
  "hooks": { "enabled": true, "token": "${OPENCLAW_GATEWAY_TOKEN}" },
  "heartbeat": { "enabled": false }
}
EOF
fi

echo "Starting OpenClaw shared gateway..."
echo "Config: $CONFIG_PATH"
echo "Agents: $(cat $CONFIG_PATH | grep -c '"id"' || echo 0)"

exec openclaw gateway \
  --bind lan \
  --port 18789 \
  --allow-unconfigured
