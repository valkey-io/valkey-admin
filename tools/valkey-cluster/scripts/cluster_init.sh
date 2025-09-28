#!/bin/sh
set -eu

HOST=host.docker.internal

echo "Checking cluster..."
info="$(valkey-cli -h "$HOST" -p 7001 CLUSTER INFO 2>/dev/null || true | tr -d '\r')"
state="$(printf '%s\n' "$info" | awk -F: '/^cluster_state/ {print $2}')"

if [ "${state:-}" = "ok" ]; then
  echo "🫡 Cluster already healthy."
  exit 0
fi

echo "Creating 3M/3R cluster..."
if ! out=$(
  valkey-cli --cluster create \
    "$HOST:7001" "$HOST:7002" "$HOST:7003" "$HOST:7004" "$HOST:7005" "$HOST:7006" \
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
  info="$(valkey-cli -h "$HOST" -p 7001 CLUSTER INFO 2>/dev/null | tr -d '\r' || true)"
  state="$(printf '%s\n' "$info" | awk -F: '/^cluster_state/ {print $2}')"
  known="$(printf '%s\n' "$info" | awk -F: '/^cluster_known_nodes/ {print $2}')"
  size="$(printf  '%s\n' "$info" | awk -F: '/^cluster_size/  {print $2}')"
  slots="$(printf '%s\n' "$info" | awk -F: '/^cluster_slots_assigned/ {print $2}')"
  masters="$(valkey-cli -h "$HOST" -p 7001 CLUSTER NODES 2>/dev/null | tr -d '\r' | awk '$3 ~ /master/ {c++} END {print (c+0)}' || echo 0)"

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
