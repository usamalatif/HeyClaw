// API environment: 'local' | 'production'
// - local: your Mac's LAN IP (for dev with Metro bundler)
// - production: your server's public IP
const API_ENV: 'local' | 'production' = 'production';

const API_URLS = {
  local: 'http://192.168.1.100:3000',
  production: 'http://93.115.26.164:3000',
};

export const API_URL = API_URLS[API_ENV];
