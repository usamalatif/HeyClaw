// API environment: 'local' | 'production'
// - local: your Mac's LAN IP (for dev with Metro bundler)
// - production: your server's public IP
const API_ENV: 'local' | 'production' = 'production';

const API_URLS = {
  local: 'http://192.168.1.25:3000',
  production: 'http://YOUR_SERVER_IP:3000', // Replace with your server's public IP
};

export const API_URL = API_URLS[API_ENV];
