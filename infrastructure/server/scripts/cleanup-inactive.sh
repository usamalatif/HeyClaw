#!/bin/bash
# Pause free-tier agents inactive for 30+ days

docker exec heyclaw-postgres psql -U appuser -d openclaw_app -t -c "
  SELECT a.agent_id FROM assistants a
  JOIN subscriptions s ON s.user_id = a.user_id
  WHERE s.plan = 'free'
  AND a.last_active_at < NOW() - INTERVAL '30 days'
  AND a.status = 'active'
" | while read agent_id; do
  agent_id=$(echo "$agent_id" | xargs)
  if [ -n "$agent_id" ]; then
    echo "[$(date)] Pausing inactive free agent: $agent_id"
    docker exec heyclaw-postgres psql -U appuser -d openclaw_app -c "
      UPDATE assistants SET status = 'paused' WHERE agent_id = '$agent_id'
    "
  fi
done
