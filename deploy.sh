#!/usr/bin/env bash
set -euo pipefail

COMPOSE_SERVICE="gold-rush"

echo "==> Pulling latest changes..."
git pull

echo "==> Building image..."
docker compose build --no-cache

echo "==> Restarting container..."
docker compose up -d --force-recreate "$COMPOSE_SERVICE"

echo "==> Tailing logs (Ctrl+C to exit)..."
docker compose logs -f "$COMPOSE_SERVICE"
