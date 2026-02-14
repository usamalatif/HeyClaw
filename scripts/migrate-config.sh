#!/bin/bash
# Migrate existing OpenClaw config to include session isolation
# Run this AFTER docker compose up if you have existing config

set -e

echo "=== HeyClaw Config Migration ==="

# Run migration inside gateway container
echo "Running migration inside gateway container..."
docker exec heyclaw-gateway sh -c '
  CONFIG_PATH="/root/.openclaw/openclaw.json"
  
  if [ ! -f "$CONFIG_PATH" ]; then
    echo "No config found - will be created on next gateway start"
    exit 0
  fi

  echo "Backing up existing config..."
  cp "$CONFIG_PATH" "${CONFIG_PATH}.backup.$(date +%Y%m%d%H%M%S)"

  echo "Patching config with session isolation..."
  node -e "
    const fs = require(\"fs\");
    const config = JSON.parse(fs.readFileSync(\"$CONFIG_PATH\", \"utf-8\"));

    // Add session isolation
    if (!config.session) {
      config.session = {};
    }
    config.session.dmScope = \"per-channel-peer\";
    config.session.scope = \"per-sender\";

    // Add channels.webchat if missing
    if (!config.channels) {
      config.channels = {};
    }
    if (!config.channels.webchat) {
      config.channels.webchat = { enabled: true };
    }

    // Add global tools deny list (NOT in agents.defaults)
    if (!config.tools) {
      config.tools = {};
    }
    config.tools.deny = [\"exec\", \"process\", \"browser\", \"canvas\", \"cron\", \"nodes\", \"gateway\"];

    // Remove invalid keys that might have been added
    if (config.agents && config.agents.defaults) {
      delete config.agents.defaults.tools;
      delete config.agents.defaults.contextPruning;
      delete config.agents.defaults.contextTokens;
      delete config.agents.defaults.timeoutSeconds;
    }

    fs.writeFileSync(\"$CONFIG_PATH\", JSON.stringify(config, null, 2));
    console.log(\"Config patched successfully!\");
  "
'

echo "Restarting gateway to apply changes..."
docker restart heyclaw-gateway

echo ""
echo "=== Migration Complete ==="
echo "Config has been updated with:"
echo "  ✓ Session isolation (dmScope: per-channel-peer)"
echo "  ✓ Tool restrictions (global tools.deny)"
echo "  ✓ Removed invalid keys"
