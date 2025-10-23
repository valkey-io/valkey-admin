#!/bin/sh
set -eu

# Talk to nodes via Docker DNS names on the internal network.
FIRST_HOST=valkey-7001
FIRST_PORT=7001

NODES="
valkey-7001:7001
valkey-7002:7002
valkey-7003:7003
valkey-7004:7004
valkey-7005:7005
valkey-7006:7006
"

wait_port() {
  hostport="$1"
  host="${hostport%%:*}"
  port="${hostport##*:}"
  for i in $(seq 1 60); do
    if valkey-cli -h "$host" -p "$port" PING >/dev/null 2>&1; then
      return 0
    fi
    echo "waiting for ${host}:${port}..."
    sleep 1
  done
  echo "timeout waiting for ${host}:${port}" >&2
  exit 1
}

echo "Checking cluster..."
info="$(valkey-cli -h "$FIRST_HOST" -p "$FIRST_PORT" CLUSTER INFO 2>/dev/null || true | tr -d '\r')"
state="$(printf '%s\n' "$info" | awk -F: '/^cluster_state/ {print $2}')"

if [ "${state:-}" = "ok" ]; then
  echo "🫡 Cluster already healthy."
  exit 0
fi

# Ensure all nodes are reachable first
for hp in $NODES; do
  wait_port "$hp"
done

echo "Creating 3M/3R cluster..."
if ! out=$(
  valkey-cli --cluster create \
    valkey-7001:7001 \
    valkey-7002:7002 \
    valkey-7003:7003 \
    valkey-7004:7004 \
    valkey-7005:7005 \
    valkey-7006:7006 \
    --cluster-replicas 1 --cluster-yes 2>&1
); then
  msg="$(printf '%s' "$out" | tr -d '\r')"
  if printf '%s' "$msg" | grep -qi "Node .* is not empty"; then
    echo "Cluster create skipped: nodes already initialized (\"Node is not empty\")."
  elif printf '%s' "$msg" | grep -qi "already.*cluster"; then
    echo "Cluster create skipped: cluster already exists."
  else
    echo "💩 Cluster create failed:"
    printf '%s\n' "$msg"
  fi
  echo "Proceeding to verify cluster state..."
fi

printf "Waiting for cluster to stabilize"
i=0
while [ "$i" -lt 120 ]; do
  info="$(valkey-cli -h "$FIRST_HOST" -p "$FIRST_PORT" CLUSTER INFO 2>/dev/null | tr -d '\r' || true)"
  state="$(printf '%s\n' "$info" | awk -F: '/^cluster_state/ {print $2}')"
  known="$(printf '%s\n' "$info" | awk -F: '/^cluster_known_nodes/ {print $2}')"
  size="$(printf  '%s\n' "$info" | awk -F: '/^cluster_size/  {print $2}')"
  slots="$(printf '%s\n' "$info" | awk -F: '/^cluster_slots_assigned/ {print $2}')"
  masters="$(valkey-cli -h "$FIRST_HOST" -p "$FIRST_PORT" CLUSTER NODES 2>/dev/null | tr -d '\r' | awk '$3 ~ /master/ {c++} END {print (c+0)}' || echo 0)"

  if [ "$state" = "ok" ] && [ "$known" = "6" ] && [ "$size" = "3" ] && [ "$slots" = "16384" ] && [ "$masters" = "3" ]; then
    echo ""
    echo "🫡 SUCCESS: Valkey cluster is ready."
    exit 0
  fi
  i=$((i+1))
  printf "."
  sleep 1
done

echo ""
echo "💩 ERROR: Cluster did not stabilize in time." >&2
exit 1