#!/bin/bash
set -eu

# Resolve script directory so docker-compose can find ./docker-compose.yml regardless of cwd.
SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)

# Get IP address - works on both macOS and Linux/WSL
if command -v ipconfig >/dev/null 2>&1; then
  # macOS
  ANNOUNCE_IP=$(ipconfig getifaddr en0)
else
  # Linux/WSL - get the default route interface IP
  ANNOUNCE_IP=$(ip route get 1.1.1.1 | grep -oP 'src \K\S+' 2>/dev/null || echo "127.0.0.1")
fi

if [ -z "${ANNOUNCE_IP:-}" ]; then
  echo "Could not detect LAN IP. Using localhost as fallback." >&2
  ANNOUNCE_IP="127.0.0.1"
fi

cd "$SCRIPT_DIR"

# Defensive cleanup: the previous version of this script created a container with
# `docker run --name valkey-standalone`. If that stale container still exists on a
# user's machine, it would collide with `container_name: valkey-standalone` below.
docker rm -f valkey-standalone >/dev/null 2>&1 || true

echo "Starting Valkey instance on port 6379..."
docker compose up -d --build --wait valkey-standalone

echo "Populating Valkey with test data..."
docker compose --profile populate run --rm populate

echo ""
echo "Done! Valkey instance running on $ANNOUNCE_IP:6379 (also reachable on localhost:6379)"
echo "To stop and clean up: docker compose -f tools/valkey-standalone/docker-compose.yml down -v"
