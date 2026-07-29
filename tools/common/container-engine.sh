#!/bin/sh
# Container engine selection: prefers Docker, falls back to Podman.
# Source this file (`. .../container-engine.sh`); it defines compose() and
# exports CONTAINER_ENGINE (docker|podman) and COMPOSE_CMD (display string).
# Force a specific engine with CONTAINER_ENGINE=docker|podman.

_engine_alive() {
  command -v "$1" >/dev/null 2>&1 && "$1" info >/dev/null 2>&1
}

case "${CONTAINER_ENGINE:-}" in
  docker|podman)
    if ! _engine_alive "$CONTAINER_ENGINE"; then
      echo "Error: CONTAINER_ENGINE=$CONTAINER_ENGINE requested, but '$CONTAINER_ENGINE info' failed. Is it installed and running?" >&2
      exit 1
    fi
    ;;
  "")
    if _engine_alive docker; then
      CONTAINER_ENGINE=docker
    elif _engine_alive podman; then
      CONTAINER_ENGINE=podman
    else
      echo "Error: no working container engine found." >&2
      echo "  - Docker: install Docker Desktop / docker-ce and start the daemon." >&2
      echo "  - Podman: install podman (on macOS also run 'podman machine start')." >&2
      exit 1
    fi
    ;;
  *)
    echo "Error: unsupported CONTAINER_ENGINE '$CONTAINER_ENGINE' (expected 'docker' or 'podman')." >&2
    exit 1
    ;;
esac

if [ "$CONTAINER_ENGINE" = "docker" ]; then
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
  else
    echo "Error: 'docker compose' (Compose v2 plugin) is not available." >&2
    exit 1
  fi
else
  if podman compose version >/dev/null 2>&1; then
    COMPOSE_CMD="podman compose"
  else
    echo "Error: podman found, but 'podman compose' is not available. Install the docker-compose v2 provider that 'podman compose' delegates to." >&2
    exit 1
  fi
fi

export CONTAINER_ENGINE COMPOSE_CMD

compose() {
  # shellcheck disable=SC2086  # intentional word-split of a fixed known string
  $COMPOSE_CMD "$@"
}

echo "Using container engine: $CONTAINER_ENGINE (compose: $COMPOSE_CMD)"
