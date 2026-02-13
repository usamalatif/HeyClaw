module.exports = {
  apps: [
    // OpenClaw Gateway (2 CPU / 14GB zone)
    {
      name: 'openclaw-gateway',
      script: 'openclaw',
      args: 'gateway',
      cwd: '/home/appuser',
      env: {
        OPENCLAW_CONFIG_PATH: '/home/appuser/.openclaw/openclaw.json',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        NODE_OPTIONS: '--max-old-space-size=12288',
      },
      max_memory_restart: '12G',
      restart_delay: 3000,
      max_restarts: 10,
      kill_timeout: 10000,
      error_file: '/home/appuser/logs/gateway-error.log',
      out_file: '/home/appuser/logs/gateway-out.log',
      merge_logs: true,
    },

    // API Server (2 CPU / 6GB zone)
    {
      name: 'api-server',
      script: '/home/appuser/api/dist/index.js',
      cwd: '/home/appuser/api',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=2048',
      },
      max_memory_restart: '2G',
      restart_delay: 1000,
      max_restarts: 15,
      kill_timeout: 5000,
      listen_timeout: 8000,
      wait_ready: true,
      error_file: '/home/appuser/logs/api-error.log',
      out_file: '/home/appuser/logs/api-out.log',
      merge_logs: true,
    },
  ],
};
