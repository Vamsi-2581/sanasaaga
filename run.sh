#!/usr/bin/env bash
set -e

PORT="${PORT:-8000}"

echo "🌿 Sanakuutio - Finnish Wordle (Podman)"
echo "========================================"

if command -v podman-compose >/dev/null 2>&1; then
  COMPOSE_CMD="podman-compose"
elif podman compose version >/dev/null 2>&1; then
  COMPOSE_CMD="podman compose"
else
  echo "Error: Neither podman-compose nor podman compose is installed."
  exit 1
fi

echo "Starting services with Podman ($COMPOSE_CMD)..."
$COMPOSE_CMD up -d --build

echo ""
echo "✅ Sanakuutio is running with Podman!"
echo "👉 Game:        http://localhost:${PORT}"
echo "👉 PocketBase:  http://localhost:${PORT}/_/"
echo ""
echo "Helpful commands:"
echo "  Logs:   $COMPOSE_CMD logs -f"
echo "  Stop:   $COMPOSE_CMD down"
