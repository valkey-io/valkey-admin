#!/bin/sh
set -eu

# Find the absolute directory where this script is located.
SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)

# Go up three levels to find the project root.
PROJECT_ROOT=$(dirname -- "$(dirname -- "$(dirname -- "$SCRIPT_DIR")")")

# Define all paths as absolute paths from the project root.
TOOLS_DIR="$PROJECT_ROOT/tools/valkey-cluster"
ENV_FILE="$TOOLS_DIR/.env"
ENV_EXAMPLE_FILE="$TOOLS_DIR/.env.example"

if [ ! -f "$ENV_FILE" ]; then
  cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
fi

# Get IP address - works on both macOS and Linux/WSL
if command -v ipconfig >/dev/null 2>&1; then
  # macOS
  ANNOUNCE_IP=$(ipconfig getifaddr en0)
else
  # Linux/WSL - get the default route interface IP
  ANNOUNCE_IP=$(ip route get 1.1.1.1 | grep -oP 'src \K\S+' 2>/dev/null || echo "127.0.0.1")
fi

if [ -z "$ANNOUNCE_IP" ]; then
  echo "Error: Could not get IP address. Using localhost as fallback." >&2
  ANNOUNCE_IP="127.0.0.1"
fi

# Detect architecture and set platform
ARCH=$(uname -m)
# Force ARM64 platform since rejson.so is ARM64 and works with emulation
DOCKER_PLATFORM="linux/arm64"

echo "Detected architecture: $ARCH, using Docker platform: $DOCKER_PLATFORM (forced for rejson.so compatibility)"

# Use sed without the '' flag for Linux compatibility
if [ "$(uname)" = "Darwin" ]; then
  sed -i '' "s/^ANNOUNCE_HOST = .*/ANNOUNCE_HOST = $ANNOUNCE_IP/" "$ENV_FILE"
  sed -i '' "s|^DOCKER_PLATFORM = .*|DOCKER_PLATFORM = $DOCKER_PLATFORM|" "$ENV_FILE"
else
  sed -i "s/^ANNOUNCE_HOST = .*/ANNOUNCE_HOST = $ANNOUNCE_IP/" "$ENV_FILE"
  sed -i "s|^DOCKER_PLATFORM = .*|DOCKER_PLATFORM = $DOCKER_PLATFORM|" "$ENV_FILE"
fi
echo "Set ANNOUNCE_HOST to $ANNOUNCE_IP in $ENV_FILE"
echo "Set DOCKER_PLATFORM to $DOCKER_PLATFORM in $ENV_FILE"

cd "$TOOLS_DIR"
echo "Starting Valkey cluster..."
echo "Keep this terminal open to monitor cluster logs"
echo ""
DOCKER_PLATFORM="$DOCKER_PLATFORM" docker compose --profile populate up --build
