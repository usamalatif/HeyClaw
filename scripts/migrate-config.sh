#!/bin/bash
# Migrate existing OpenClaw config to include session isolation + context pruning
# Run this AFTER docker compose up if you have existing config

set -e

echo "=== HeyClaw Config Migration ==="

# Check if running inside container or on host
if [ -f "/.dockerenv" ]; then
  CONFIG_PATH="/root/.openclaw/openclaw.json"
else
  # Running on host - exec into container
  echo "Running migration inside gateway container..."
  docker exec heyclaw-gateway sh -c '
    CONFIG_PATH="/root/.openclaw/openclaw.json"
    
    if [ ! -f "$CONFIG_PATH" ]; then
      echo "No config found - will be created on next gateway start"
      exit 0
    fi

    echo "Backing up existing config..."
    cp "$CONFIG_PATH" "${CONFIG_PATH}.backup.$(date +%Y%m%d%H%M%S)"

    echo "Patching config with session isolation + context pruning..."
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

      // Update agent defaults
      if (!config.agents) {
        config.agents = { defaults: {}, list: [] };
      }
      if (!config.agents.defaults) {
        config.agents.defaults = {};
      }

      config.agents.defaults.contextTokens = 64000;
      config.agents.defaults.timeoutSeconds = 120;

      if (!config.agents.defaults.sandbox) {
        config.agents.defaults.sandbox = {};
      }
      config.agents.defaults.sandbox.mode = \"all\";
      config.agents.defaults.sandbox.scope = \"agent\";
      config.agents.defaults.sandbox.workspaceAccess = \"rw\";

      if (!config.agents.defaults.tools) {
        config.agents.defaults.tools = {};
      }
      config.agents.defaults.tools.deny = [\"exec\", \"process\", \"browser\", \"canvas\", \"cron\", \"nodes\", \"gateway\"];

      config.agents.defaults.contextPruning = {
        mode: \"adaptive\",
        keepLastAssistants: 3,
        softTrimRatio: 0.7,
        hardClearRatio: 0.85
      };

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
  echo "  ✓ Sandbox isolation (scope: agent)"
  echo "  ✓ Context limits (64k tokens)"
  echo "  ✓ Context pruning (adaptive)"
  echo "  ✓ Tool restrictions"
  exit 0
fi
