#!/bin/bash
set -e
BACKUP_DIR="/home/appuser/backups/$(date +%Y-%m-%d)"
mkdir -p "$BACKUP_DIR"

# Database
docker exec heyclaw-postgres pg_dump -U appuser openclaw_app | gzip > "$BACKUP_DIR/database.sql.gz"

# OpenClaw workspaces + config
tar -czf "$BACKUP_DIR/openclaw.tar.gz" \
  /home/appuser/.openclaw/workspaces/ \
  /home/appuser/.openclaw/openclaw.json \
  /home/appuser/.openclaw/agents/

# API env
cp /home/appuser/api/.env "$BACKUP_DIR/.env.backup"

# Cleanup 30+ day old backups
find /home/appuser/backups/ -type d -mtime +30 -exec rm -rf {} + 2>/dev/null || true

echo "[$(date)] Backup done: $BACKUP_DIR"
