#!/bin/sh
set -eu

# Talk to nodes via Docker DNS names on the internal network. Node n is
# "${HOST_PREFIX}n" on port "${PORT_PREFIX}n". The dev stack in
# tools/valkey-cluster names nodes valkey-1..6; the integration stack in
# docker/docker-compose.test.yml names them valkey-7001..7006 and sets
# CLUSTER_HOST_PREFIX=valkey-700.
PORT_PREFIX=${CLUSTER_PORT_PREFIX:-700}
HOST_PREFIX=${CLUSTER_HOST_PREFIX:-valkey-}
FIRST_HOST=${HOST_PREFIX}1
FIRST_PORT=${PORT_PREFIX}1
VALKEY_USER=${VALKEY_USER:-appuser}
VALKEY_PASS=${VALKEY_PASS:-admin}
# Second ACL user for identity-isolation tests: everything except ACL and COMMANDLOG.
RESTRICTED_USER=${RESTRICTED_USER:-restricted}
RESTRICTED_PASS=${RESTRICTED_PASS:-restricted}

NODES=""
for n in 1 2 3 4 5 6; do
  NODES="$NODES ${HOST_PREFIX}$n:${PORT_PREFIX}$n"
done

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

# ACL users are per node and are lost when a node restarts, so set them on
# every run, before the "already healthy" early exit.
setup_acl_users() {
  for hp in $NODES; do
    host="${hp%%:*}"
    port="${hp##*:}"
    valkey-cli -h "$host" -p "$port" ACL SETUSER "$VALKEY_USER" on ">$VALKEY_PASS" '~*' '&*' +@all
    valkey-cli -h "$host" -p "$port" ACL SETUSER "$RESTRICTED_USER" on ">$RESTRICTED_PASS" '~*' '&*' +@all -acl -commandlog
  done
}

report_config() {
  echo "Eviction and slot stats config on $FIRST_HOST:$FIRST_PORT:"
  valkey-cli -h "$FIRST_HOST" -p "$FIRST_PORT" CONFIG GET maxmemory-policy | tr -d '\r' | paste - -
  valkey-cli -h "$FIRST_HOST" -p "$FIRST_PORT" CONFIG GET cluster-slot-stats-enabled | tr -d '\r' | paste - -
}

for hp in $NODES; do
  wait_port "$hp"
done
setup_acl_users

echo "Checking cluster..."
info="$( (valkey-cli -h "$FIRST_HOST" -p "$FIRST_PORT" CLUSTER INFO 2>/dev/null || true) | tr -d '\r')"
state="$(printf '%s\n' "$info" | awk -F: '/^cluster_state/ {print $2}')"

if [ "${state:-}" = "ok" ]; then
  echo "🫡 Cluster already healthy."
  report_config
  exit 0
fi

echo "Creating 3M/3R cluster..."
if ! out=$(
  valkey-cli --cluster create $NODES \
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
  info="$( (valkey-cli -h "$FIRST_HOST" -p "$FIRST_PORT" CLUSTER INFO 2>/dev/null || true) | tr -d '\r')"
  state="$(printf '%s\n' "$info" | awk -F: '/^cluster_state/ {print $2}')"
  known="$(printf '%s\n' "$info" | awk -F: '/^cluster_known_nodes/ {print $2}')"
  size="$(printf  '%s\n' "$info" | awk -F: '/^cluster_size/  {print $2}')"
  slots="$(printf '%s\n' "$info" | awk -F: '/^cluster_slots_assigned/ {print $2}')"
  masters="$(valkey-cli -h "$FIRST_HOST" -p "$FIRST_PORT" CLUSTER NODES 2>/dev/null | tr -d '\r' | awk '$3 ~ /master/ {c++} END {print (c+0)}' || echo 0)"

  if [ "$state" = "ok" ] && [ "$known" = "6" ] && [ "$size" = "3" ] && [ "$slots" = "16384" ] && [ "$masters" = "3" ]; then
    echo ""
    echo "🫡 SUCCESS: Valkey cluster is ready."
    report_config
    exit 0
  fi
  i=$((i+1))
  printf "."
  sleep 1
done

echo ""
echo "💩 ERROR: Cluster did not stabilize in time." >&2
exit 1
