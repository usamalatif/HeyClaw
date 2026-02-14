#!/bin/sh
set -e

CONFIG_PATH="/root/.openclaw/openclaw.json"

# Only generate initial config if none exists (preserves agent list across restarts)
if [ ! -f "$CONFIG_PATH" ]; then
  # Use OPENCLAW_GATEWAY_TOKEN from env (set in docker-compose.yml)
  GW_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-default-dev-token}"
  echo "No config found — generating initial openclaw.json"

  node -e "
    const config = {
      env: {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || ''
      },
      session: {
        dmScope: 'per-channel-peer',
        scope: 'per-sender'
      },
      models: {
        providers: {
          'openai-custom': {
            baseUrl: 'https://api.openai.com/v1',
            apiKey: process.env.OPENAI_API_KEY || '',
            api: 'openai-completions',
            models: [
              { id: 'gpt-5-nano', name: 'GPT-5 Nano', contextWindow: 128000, maxTokens: 8192 },
              { id: 'gpt-5-nano-2025-08-07', name: 'GPT-5 Nano (dated)', contextWindow: 128000, maxTokens: 8192 }
            ]
          }
        }
      },
      gateway: {
        mode: 'local',
        auth: {
          mode: 'token',
          token: '${GW_TOKEN}'
        },
        port: 18789,
        bind: 'loopback',
        tailscale: {
          mode: 'off',
          resetOnExit: false
        },
        http: {
          endpoints: {
            chatCompletions: { enabled: true }
          }
        }
      },
      tools: {
        deny: ['exec', 'process', 'browser', 'canvas', 'cron', 'nodes', 'gateway']
      },
      agents: {
        defaults: {
          model: { primary: 'openai-custom/gpt-5-nano', fallbacks: [] },
          sandbox: { mode: 'off', workspaceAccess: 'rw' }
        },
        list: []
      },
      bindings: [],
      cron: { enabled: true, maxConcurrentRuns: 1 },
      hooks: { enabled: false }
    };
    require('fs').writeFileSync('$CONFIG_PATH', JSON.stringify(config, null, 2));
  "
  echo "Config generated with session isolation"
fi

echo "Starting OpenClaw shared gateway..."
echo "Config: $CONFIG_PATH"

exec openclaw gateway \
  --bind lan \
  --port 18789 \
  --allow-unconfigured
