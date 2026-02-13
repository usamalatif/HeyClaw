#!/bin/sh
set -e

CONFIG_PATH="/root/.openclaw/openclaw.json"

# Only generate initial config if none exists (preserves agent list across restarts)
if [ ! -f "$CONFIG_PATH" ]; then
  # Auto-generate a gateway auth token
  GW_TOKEN=$(node -e "process.stdout.write(require('crypto').randomBytes(24).toString('hex'))")
  echo "No config found — generating initial openclaw.json"

  node -e "
    const config = {
      env: {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || ''
      },
      models: {
        providers: {
          'openai-custom': {
            baseUrl: 'https://api.openai.com/v1',
            apiKey: process.env.OPENAI_API_KEY || '',
            api: 'openai-completions',
            models: [
              { id: 'gpt-5-nano', name: 'GPT-5 Nano' },
              { id: 'gpt-5-nano-2025-08-07', name: 'GPT-5 Nano (dated)' }
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
      agents: {
        defaults: {
          model: { primary: 'openai-custom/gpt-5-nano', fallbacks: [] },
          sandbox: { mode: 'all', workspaceAccess: 'rw' }
        },
        list: []
      },
      bindings: [],
      cron: { enabled: true, maxConcurrentRuns: 1 },
      hooks: { enabled: false }
    };
    require('fs').writeFileSync('$CONFIG_PATH', JSON.stringify(config, null, 2));
  "
  echo "Config generated with auto-generated token"
fi

echo "Starting OpenClaw shared gateway..."
echo "Config: $CONFIG_PATH"

exec openclaw gateway \
  --bind lan \
  --port 18789 \
  --allow-unconfigured
