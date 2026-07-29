#!/bin/bash
set -eu

# Resolve script directory so docker-compose can find ./docker-compose.yml regardless of cwd.
SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)

# Select Docker or fall back to Podman; defines compose() and CONTAINER_ENGINE.
. "$SCRIPT_DIR/../common/container-engine.sh"

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
"$CONTAINER_ENGINE" rm -f valkey-standalone >/dev/null 2>&1 || true

echo "Starting Valkey instance on port 6379..."
# Poll for health instead of `compose up --wait` (a docker-compose-v2-only flag).
compose up -d --build valkey-standalone
for i in $(seq 1 30); do
  status=$("$CONTAINER_ENGINE" inspect --format '{{.State.Health.Status}}' valkey-standalone 2>/dev/null || true)
  [ "$status" = "healthy" ] && break
  [ "$i" -eq 30 ] && { echo "Error: valkey-standalone did not become healthy." >&2; exit 1; }
  sleep 2
done

echo "Populating Valkey with test data..."
compose --profile populate run --rm populate

echo ""
echo "Done! Valkey instance running on $ANNOUNCE_IP:6379 (also reachable on localhost:6379)"
echo "To stop and clean up: $COMPOSE_CMD -f tools/valkey-standalone/docker-compose.yml down -v"
