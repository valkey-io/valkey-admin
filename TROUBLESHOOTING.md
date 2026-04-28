# Troubleshooting


### Valkey Admin is crashing or unresponsive with a large cluster

In Web/Docker mode, Valkey Admin spawns a metrics server process for each primary node in the cluster. Each process uses approximately 150 MB of RAM. If your instance doesn't have enough memory, the app will OOM and become unresponsive.

**Fix:** Refer to the [Resource Sizing](./README.md#resource-sizing) section in the README and ensure your instance meets the recommended spec for your cluster size. Alternatively, deploy with [Kubernetes](./examples/k8s/) where metrics servers run as sidecars on each Valkey pod, eliminating the memory burden on the main Valkey Admin instance.

---

### I enabled cluster slot stats and an LFU eviction policy but Valkey Admin still prompts me to start monitoring

Valkey Admin checks your cluster's eviction policy and slot stats configuration at connection time, not continuously. If you enabled `allkeys-lfu` or `cluster-slot-stats-enabled` after connecting, Valkey Admin won't detect the change. This also applies for the other way around.

**Fix:** Delete your cluster connection(s) in Valkey Admin and reconnect. The new connection will pick up the updated configuration.

### I am unable to enable cluster slot stats on Valkey

This option requires Valkey 8.0 or later, which introduced `cluster-slot-stats-enabled`. On older versions, Valkey Admin will give you the option to use monitor-based detection.

---

### Intermittent "No primary node found" when connecting to large clusters via discovery endpoint

When connecting to an ElastiCache cluster configuration endpoint (`clustercfg.*`) with a large number of nodes (50+), the connection may intermittently fail with "No primary node found." This is caused by a [known issue in Valkey GLIDE](https://github.com/valkey-io/valkey-glide/issues/5809) where the standalone client struggles with DNS endpoints that resolve to many IP addresses.

**Workaround:** Connect using a specific node hostname (e.g., `<replication-group>-0001-001.<replication-group>.<suffix>`) instead of the `clustercfg.*` endpoint. Valkey Admin will discover the full cluster topology from any single node.

**Fix:** This is resolved in GLIDE 2.4 with the new `NodeDiscoveryMode.STATIC` option ([PR #5724](https://github.com/valkey-io/valkey-glide/pull/5724)).

## Known Limitations

- **mTLS** is not currently supported. Standard TLS with password or IAM authentication is available.
- **ElastiCache Serverless** is not supported. Only ElastiCache node-based (non-serverless) clusters are supported.
- **Key sampling numbers** may differ between views. The key browser and distribution chart use separate sampling passes, so counts may not match exactly — this is expected behavior with sampled data.
- **No RBAC within the app** — any connected user can run any command the Valkey ACL allows
