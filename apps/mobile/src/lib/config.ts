// Toggle this to switch between local dev and production
const __DEV_API__ = true;

export const API_URL = __DEV_API__
  ? 'http://192.168.1.25:3000'
  : 'https://api.heyclaw.com';
