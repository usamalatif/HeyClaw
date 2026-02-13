#!/bin/sh
set -e

CONFIG_PATH="/root/.openclaw/openclaw.json"
TOKEN_FILE="/root/.openclaw/gateway-token"

# Auto-generate a gateway token on first boot (persists on volume)
if [ ! -f "$TOKEN_FILE" ]; then
  node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" > "$TOKEN_FILE"
  echo "Generated gateway token"
fi
GW_TOKEN=$(cat "$TOKEN_FILE")

# Only generate initial config if none exists (preserves agent list across restarts)
if [ ! -f "$CONFIG_PATH" ]; then
  echo "No config found — generating initial openclaw.json"
  cat > "$CONFIG_PATH" << 'TEMPLATE'
{
  "env": {
    "OPENAI_API_KEY": "PLACEHOLDER_OPENAI_KEY"
  },
  "models": {
    "providers": {
      "openai-custom": {
        "baseUrl": "https://api.openai.com/v1",
        "apiKey": "PLACEHOLDER_OPENAI_KEY",
        "api": "openai-completions",
        "models": [
          { "id": "gpt-5-nano", "name": "GPT-5 Nano" },
          { "id": "gpt-5-nano-2025-08-07", "name": "GPT-5 Nano (dated)" }
        ]
      }
    }
  },
  "gateway": {
    "port": 18789,
    "http": {
      "endpoints": {
        "chatCompletions": { "enabled": true }
      }
    }
  },
  "agents": {
    "defaults": {
      "sandbox": { "mode": "all", "workspaceAccess": "rw" }
    },
    "list": []
  },
  "bindings": [],
  "cron": { "enabled": true, "maxConcurrentRuns": 1 },
  "hooks": { "enabled": true }
}
TEMPLATE
  # Replace placeholders with actual env values
  sed -i "s|PLACEHOLDER_OPENAI_KEY|${OPENAI_API_KEY}|g" "$CONFIG_PATH"
fi

echo "Starting OpenClaw shared gateway..."
echo "Config: $CONFIG_PATH"

exec openclaw gateway \
  --bind lan \
  --port 18789 \
  --token "$GW_TOKEN" \
  --allow-unconfigured
