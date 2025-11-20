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

ANNOUNCE_IP=$(ipconfig getifaddr en0)
if [ -z "$ANNOUNCE_IP" ]; then
  echo "Error: Could not get IP address for en0. Please ensure 'en0' is a valid network interface." >&2
  exit 1
fi

sed -i '' "s/^ANNOUNCE_HOST = .*/ANNOUNCE_HOST = $ANNOUNCE_IP/" "$ENV_FILE"
echo "Set ANNOUNCE_HOST to $ANNOUNCE_IP in $ENV_FILE"

cd "$TOOLS_DIR"
docker compose --profile populate up --build
