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

# Detect OS and get IP address accordingly
if [ "$(uname)" = "Darwin" ]; then
  # macOS
  ANNOUNCE_IP=$(ipconfig getifaddr en0)
else
  # Linux - get the primary IP address using ip command
  ANNOUNCE_IP=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+')
fi

if [ -z "$ANNOUNCE_IP" ]; then
  echo "Error: Could not get IP address. Please check your network configuration." >&2
  exit 1
fi

# Detect OS for sed syntax
if [ "$(uname)" = "Darwin" ]; then
  sed -i '' "s/^ANNOUNCE_HOST = .*/ANNOUNCE_HOST = $ANNOUNCE_IP/" "$ENV_FILE"
else
  sed -i "s/^ANNOUNCE_HOST = .*/ANNOUNCE_HOST = $ANNOUNCE_IP/" "$ENV_FILE"
fi
echo "Set ANNOUNCE_HOST to $ANNOUNCE_IP in $ENV_FILE"

cd "$TOOLS_DIR"
docker compose --profile populate up --build
