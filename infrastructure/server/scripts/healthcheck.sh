#!/bin/bash
API=$(curl -sf -o /dev/null -w "%{http_code}" https://yourdomain.com/health)
if [ "$API" != "200" ]; then
  echo "[$(date)] API DOWN ($API) — restarting"
  pm2 restart api-server
fi

GW=$(pm2 jlist 2>/dev/null | jq -r '.[0].pm2_env.status // "unknown"')
if [ "$GW" != "online" ]; then
  echo "[$(date)] Gateway DOWN ($GW) — restarting"
  pm2 restart openclaw-gateway
fi
