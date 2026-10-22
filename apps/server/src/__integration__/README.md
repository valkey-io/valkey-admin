# Integration tests

End-to-end tests that drive the server's WebSocket API against a live Valkey stack containing both a 6-node cluster (the cluster suites) and a single standalone instance (the db-aware connection suite). Both come up from a single docker-compose file.

## Quick run

With Podman, use `podman compose` in place of `docker compose`. On Apple silicon, set `DOCKER_PLATFORM=linux/arm64`.

```bash
docker compose -f docker/docker-compose.test.yml up -d --build --wait
npm run test:integration
docker compose -f docker/docker-compose.test.yml down -v
```

## Stack

- **Cluster:** `valkey-7001..7006` on ports `7001..7006`. Initialized by the `cluster-init` service and seeded by `populate`. Used by `cluster-topology`, `connection`, `key-browser`, `monitoring`, and `send-command` integration tests via `defaultConnectionDetails()`.
- **Standalone:** `valkey-standalone` on port `6379`. No cluster mode. Used by the "two databases" test in `connection.integration.test.ts` via `defaultStandaloneConnectionDetails(db)` to verify that `(host, port, db)` triples produce isolated clients.
- **ACL users:** Every node has the users `appuser`/`admin` (all commands) and `restricted`/`restricted` (all commands except `ACL` and `COMMANDLOG`). The standalone node also keeps the passwordless `default` user. `cluster_init.sh` sets the cluster users on every run, and the standalone node gets them from its `--user` arguments. `identity-isolation.integration.test.ts` uses the two users to check that users who connect as different Valkey users share no client and no metrics collector.

## Note

Integration tests are run serially to prevent race conditions. Each `connectionId` is now `buildConnectionId(host, port, db)`, so tests targeting the same `host:port` with the default `db: 0` share an id. The two-database test intentionally uses two distinct `connectionId`s to exercise per-`db` keying.
