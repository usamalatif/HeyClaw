// API environment: 'local' | 'production'
// - local: your Mac's LAN IP (for dev with Metro bundler)
// - production: https://api.heyclaw.xyz
const API_ENV: 'local' | 'production' = 'production';

const API_URLS = {
  local: 'http://192.168.1.100:3000',
  production: 'https://api.heyclaw.xyz',
};

export const API_URL = API_URLS[API_ENV];
