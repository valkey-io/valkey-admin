### Run Sample Instances of Valkey Cluster or Standalone

Docker is a prerequisite as these are Docker containers.

From root run:

`./tools/valkey-standalone/build_run_standalone.sh` for a standalone instance populated with seed data.

`./tools/valkey-cluster/scripts/build_run_cluster.sh` for a cluster instance populated with seed data.

### Logical databases

Both stacks expose **16 logical databases** by default. The cluster stack passes `--cluster-databases 16` to every node, and the standalone stack passes `--databases 16`. The `populate.mjs` scripts iterate every configured database and seed each one with the typed sample dataset (string, list, set, hash, sorted set, geo, bitmap, stream) plus a bulk string load.

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

#### Cluster Valkey 9+ baseline

Multiple logical databases on a Valkey **cluster** require Valkey 9.0.0 or newer. The bundled Compose files use `valkey/valkey:latest`, which satisfies the baseline. If you pin an older tag, pin `valkey/valkey:9.0` or newer — otherwise the cluster populate script exits non-zero before issuing any write to a database greater than `0`, naming the detected version and the required baseline.

For the full platform-support matrix, see [the platform-support page](../docs-site/src/content/docs/development/platform-support.md).
