#!/bin/bash
set -e

echo "=== HeyClaw Production Deployment ==="
echo ""

# Check prerequisites
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed"
    exit 1
fi

if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo "Error: Docker Compose is not installed"
    exit 1
fi

# Check for .env.production
if [ ! -f .env.production ]; then
    echo "Error: .env.production not found!"
    echo "Copy .env.production.example to .env.production and fill in your keys:"
    echo "  cp .env.production.example .env.production"
    exit 1
fi

# Load env for docker-compose variable substitution
set -a
source .env.production
set +a

# Initialize database schema if needed (runs against existing Postgres)
echo "1/4 Checking database schema..."
if command -v psql &> /dev/null; then
    psql "$DATABASE_URL" -c "SELECT 1 FROM users LIMIT 1" &>/dev/null || {
        echo "    Tables not found — running schema.sql..."
        psql "$DATABASE_URL" -f infrastructure/server/db/schema.sql
        echo "    Schema created."
    }
else
    echo "    psql not found — skip schema check. Run schema.sql manually if first deploy."
fi

echo ""
echo "2/4 Building OpenClaw gateway..."
docker compose build gateway

echo ""
echo "3/4 Building HeyClaw API..."
docker compose build api

echo ""
echo "4/4 Starting gateway + API..."
docker compose up -d

echo ""
echo "=== Deployment Complete ==="
echo ""
docker compose ps
echo ""
echo "API running at: http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'YOUR_SERVER_IP'):3000"
echo ""
echo "Commands:"
echo "  Status:      docker compose ps"
echo "  API logs:    docker compose logs -f api"
echo "  GW logs:     docker compose logs -f gateway"
echo "  Stop all:    docker compose down"
echo "  Redeploy:    docker compose build api && docker compose up -d api"
