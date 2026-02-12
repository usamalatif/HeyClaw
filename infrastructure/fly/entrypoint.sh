#!/bin/bash
set -e

# Increase Node.js heap for OpenClaw
export NODE_OPTIONS="--max-old-space-size=768"

# Create config directory
mkdir -p /root/.openclaw/workspace

# Generate OpenClaw config from environment variables
cat > /root/.openclaw/openclaw.json << EOF
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
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "${OPENCLAW_MODEL:-openai-custom/gpt-5-nano}"
      }
    }
  },
  "gateway": {
    "auth": {
      "mode": "token",
      "token": "${OPENCLAW_GATEWAY_TOKEN}"
    },
    "http": {
      "endpoints": {
        "chatCompletions": {
          "enabled": true
        }
      }
    }
  }
}
EOF

echo "Starting OpenClaw Gateway for user: ${USER_ID}"
echo "Model: ${OPENCLAW_MODEL}"
echo "Port: ${OPENCLAW_PORT}"
echo "Token set: $([ -n "$OPENCLAW_GATEWAY_TOKEN" ] && echo 'yes' || echo 'no')"

# Start OpenClaw gateway
# --bind lan = listen on all interfaces (0.0.0.0) so other containers can reach it
# --allow-unconfigured = skip onboarding requirement
exec openclaw gateway \
  --bind lan \
  --port "${OPENCLAW_PORT:-18789}" \
  --allow-unconfigured
