#!/bin/sh
set -eu

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
CLUSTER_COMPOSE="$SCRIPT_DIR/valkey-cluster/docker-compose.yml"
STANDALONE_COMPOSE="$SCRIPT_DIR/valkey-standalone/docker-compose.yml"

case "${1:-up}" in
  up)
    "$SCRIPT_DIR/valkey-cluster/scripts/build_run_cluster.sh" lfu
    "$SCRIPT_DIR/valkey-cluster/scripts/build_run_cluster.sh" default
    "$SCRIPT_DIR/valkey-standalone/build_run_standalone.sh"

    ANNOUNCE_HOST=$(sed -n 's/^ANNOUNCE_HOST *= *\([^ #]*\).*/\1/p' "$SCRIPT_DIR/valkey-cluster/.env")
    echo ""
    echo "All Valkey deployments are running:"
    echo "  Cluster (LFU + slot stats): $ANNOUNCE_HOST:7001-7006"
    echo "  Cluster (default):          $ANNOUNCE_HOST:7101-7106"
    echo "  Standalone:                 $ANNOUNCE_HOST:6379 (also localhost:6379)"
    echo "To stop and clean up: $0 down"
    ;;
  down)
    . "$SCRIPT_DIR/common/container-engine.sh"
    compose -f "$CLUSTER_COMPOSE" -p valkey-cluster down -v
    compose -f "$CLUSTER_COMPOSE" -p valkey-cluster-default down -v
    compose -f "$STANDALONE_COMPOSE" down -v
    ;;
  *)
    echo "Usage: $0 [up|down]" >&2
    exit 1
    ;;
esac
