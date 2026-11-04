### Run Sample Instances of Valkey Cluster or Standalone

Docker **or Podman** is a prerequisite. The scripts prefer Docker when its daemon is running and fall back to Podman otherwise; force a choice with `CONTAINER_ENGINE=docker` or `CONTAINER_ENGINE=podman`.

From root run:

`./tools/build_run_all.sh` to start every deployment below in the background, each populated with seed data. Stop and remove them all with `./tools/build_run_all.sh down`.

| Deployment | Ports | Started individually with | Config |
|---|---|---|---|
| Cluster (LFU) | `7001`–`7006` | `./tools/valkey-cluster/scripts/build_run_cluster.sh` (or `... lfu`) | `maxmemory 100mb`, `maxmemory-policy allkeys-lfu`, `cluster-slot-stats-enabled yes` |
| Cluster (default) | `7101`–`7106` | `./tools/valkey-cluster/scripts/build_run_cluster.sh default` | Valkey defaults (`noeviction`, slot stats off) |
| Standalone | `6379` | `./tools/valkey-standalone/build_run_standalone.sh` | Valkey defaults |

Every deployment loads the RedisJSON module (`tools/valkey-cluster/rejson.so`), baked into a local `valkey-skyscope-json:local` image at build time.

Both clusters share `tools/valkey-cluster/docker-compose.yml` and run as separate Compose projects, `valkey-cluster` (LFU) and `valkey-cluster-default`. Each cluster is a 3 primary / 3 replica cluster with cluster bus ports at client port + 10000 (`17001`–`17006`, `17101`–`17106`). The variant is selected through two variables, which the build script sets for you:

| Variable | Default | Effect |
|---|---|---|
| `CLUSTER_PORT_PREFIX` | `700` | Node `n` listens on `${CLUSTER_PORT_PREFIX}n` (for example `7001`) |
| `CLUSTER_LFU_SLOT_STATS` | `yes` | `yes` passes the LFU and slot stats flags to `valkey-server`; anything else leaves Valkey defaults |
| `CLUSTER_HOST_PREFIX` | `valkey-` | Read by `scripts/cluster_init.sh` only. Node `n` is reached as `${CLUSTER_HOST_PREFIX}n`. The integration stack in `docker/docker-compose.test.yml` reuses the script with `valkey-700`, because its containers are `valkey-7001`..`valkey-7006` |

The LFU and slot stats settings are server start-up flags, so they survive node restarts. To manage one cluster directly, pass its project name, for example:

```bash
docker compose -f tools/valkey-cluster/docker-compose.yml -p valkey-cluster-default logs -f
docker compose -f tools/valkey-cluster/docker-compose.yml -p valkey-cluster-default down -v
```

Run commands for the default cluster through `build_run_cluster.sh default` or with `CLUSTER_PORT_PREFIX=710 CLUSTER_LFU_SLOT_STATS=no` set. Without them, Compose falls back to the LFU cluster settings.

Seeding all three deployments with the default bulk load takes a while. For a faster start, run `POPULATE_BULK_KEYS=1000 ./tools/build_run_all.sh`.

#### Podman notes

Podman 4.x or newer is recommended, and the `podman compose` Compose v2 provider is required (the `podman-compose` v1 tool is not supported). On macOS, run `podman machine start` first. Machines with the `podman-docker` shim are detected as Docker, which works fine.

### Logical databases

Every stack exposes **16 logical databases** by default. Both cluster stacks pass `--cluster-databases 16` to every node, and the standalone stack passes `--databases 16`. The `populate.mjs` scripts iterate every configured database and seed each one with the typed sample dataset (string, list, set, hash, sorted set, geo, bitmap, stream) plus a bulk string load.

Per-database content is distinguishable by construction: every key written into database `d` carries the literal token `db<d>` in its name, and every string value carries the same token. For example, the third sample string in database `3` is `string:db3:1` with value `value_db3_1`, and the 42nd bulk key is `bulk:db3:42` with value `value_db3_42`. Two distinct databases never share a key.

#### Overrides

Two environment variables tune what populate writes:

| Variable | Default | Accepted values | Behaviour on overrun |
|---|---|---|---|
| `POPULATE_DB_COUNT` | `16` | Positive integer; unset or empty falls back to the default | Populate exits non-zero if the requested count exceeds the deployment's configured database count, naming both numbers in the error |
| `POPULATE_BULK_KEYS` | `100000` | Non-negative integer (`0` is allowed and skips the bulk load); unset or empty falls back to the default | n/a (no upper bound enforced beyond available memory) |

Non-integer or out-of-range values cause populate to exit non-zero with an error that names the offending environment variable and its rejected value.

Pass overrides through the populate Compose service, for example:

```bash
POPULATE_DB_COUNT=4 POPULATE_BULK_KEYS=1000 \
  docker compose -f tools/valkey-standalone/docker-compose.yml \
  --profile populate run --rm populate
```

With Podman, substitute `podman compose` for `docker compose`.

#### Cluster Valkey 9+ baseline

Multiple logical databases on a Valkey **cluster** require Valkey 9.0.0 or newer. The bundled Compose files use `valkey/valkey:latest`, which satisfies the baseline. If you pin an older tag, pin `valkey/valkey:9.0` or newer — otherwise the cluster populate script exits non-zero before issuing any write to a database greater than `0`, naming the detected version and the required baseline.

For the full platform-support matrix, see [the platform-support page](../docs-site/src/content/docs/development/platform-support.md).
