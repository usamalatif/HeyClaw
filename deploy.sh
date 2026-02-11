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

echo "1/3 Building OpenClaw agent image..."
docker build -t heyclaw-agent:latest -f infrastructure/fly/agent.Dockerfile infrastructure/fly/

echo ""
echo "2/3 Building HeyClaw API image..."
docker compose build api

echo ""
echo "3/3 Starting HeyClaw API..."
docker compose up -d api

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "API running at: http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'YOUR_SERVER_IP'):3000"
echo ""
echo "Check status:  docker compose ps"
echo "View logs:     docker compose logs -f api"
echo "Stop:          docker compose down"
