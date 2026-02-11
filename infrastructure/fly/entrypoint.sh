#!/bin/bash
set -e

# Generate OpenClaw config from environment variables
cat > /root/.openclaw/openclaw.json << EOF
{
  "agent": {
    "model": "${OPENCLAW_MODEL:-anthropic/claude-sonnet-4-5-20250929}",
    "name": "HeyClaw Assistant"
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
