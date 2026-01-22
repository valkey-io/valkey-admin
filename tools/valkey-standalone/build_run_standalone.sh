#!/bin/bash
set -e

# Start Valkey in Docker
echo "Starting Valkey instance on port 6379..."
docker run -d --name valkey-standalone -p 6379:6379 valkey/valkey:latest

# Wait for Valkey to be ready
echo "Waiting for Valkey to start..."
sleep 3

# Check if Valkey is running
if ! valkey-cli -p 6379 ping > /dev/null 2>&1; then
  echo "Error: Valkey failed to start"
  docker logs valkey-standalone
  exit 1
fi

echo "Valkey is running!"

# Populate with data
echo "Populating Valkey with test data..."
node tools/valkey-standalone/populate.mjs

echo "Done! Valkey instance running on localhost:6379"
echo "To stop: docker stop valkey-standalone"
echo "To remove: docker rm valkey-standalone"
