#!/bin/bash
set -e

# Increase Node.js heap for OpenClaw
export NODE_OPTIONS="--max-old-space-size=1024"

# Generate OpenClaw config from environment variables (new schema)
cat > /root/.openclaw/openclaw.json << EOF
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "${OPENCLAW_MODEL:-anthropic/claude-sonnet-4-5-20250929}"
      },
      "name": "HeyClaw Assistant"
    }
  },
  "gateway": {
    "port": ${OPENCLAW_PORT:-18789},
    "bind": "0.0.0.0"
  }
}
EOF

echo "Starting OpenClaw Gateway for user: ${USER_ID}"
echo "Model: ${OPENCLAW_MODEL}"
echo "Port: ${OPENCLAW_PORT}"

# Start OpenClaw gateway
exec openclaw gateway --port "${OPENCLAW_PORT:-18789}" --verbose
