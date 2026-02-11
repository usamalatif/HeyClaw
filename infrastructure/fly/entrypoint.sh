#!/bin/bash
set -e

# Increase Node.js heap for OpenClaw
export NODE_OPTIONS="--max-old-space-size=1024"

# Generate OpenClaw config from environment variables
cat > /root/.openclaw/openclaw.json << EOF
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "${OPENCLAW_MODEL:-anthropic/claude-sonnet-4-5-20250929}"
      }
    }
  },
  "gateway": {
    "port": ${OPENCLAW_PORT:-18789}
  }
}
EOF

echo "Starting OpenClaw Gateway for user: ${USER_ID}"
echo "Model: ${OPENCLAW_MODEL}"
echo "Port: ${OPENCLAW_PORT}"

# Start OpenClaw gateway — bind to all interfaces so other containers can reach it
exec openclaw gateway --port "${OPENCLAW_PORT:-18789}" --host 0.0.0.0 --verbose
