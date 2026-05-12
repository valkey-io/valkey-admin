---
title: Troubleshooting
description: Common issues and solutions for Valkey Admin
---

## Valkey Admin is crashing or unresponsive with a large cluster

In Web/Docker mode, Valkey Admin spawns a metrics server process for each primary node in the cluster. Each process uses approximately 150 MB of RAM. If your instance doesn't have enough memory, the app will OOM and become unresponsive.

**Fix:** Refer to the [Resource Sizing](/deployment/resource-sizing/) page and ensure your instance meets the recommended spec for your cluster size. Alternatively, deploy with [Kubernetes](/deployment/kubernetes/) where metrics servers run as sidecars on each Valkey pod, eliminating the memory burden on the main Valkey Admin instance.

---

## I enabled cluster slot stats and an LFU eviction policy but Valkey Admin still prompts me to start monitoring

Valkey Admin checks your cluster's eviction policy and slot stats configuration at connection time, not continuously. If you enabled `allkeys-lfu` or `cluster-slot-stats-enabled` after connecting, Valkey Admin won't detect the change. This also applies in the reverse direction.

**Fix:** Delete your cluster connection(s) in Valkey Admin and reconnect. The new connection will pick up the updated configuration.

---

## I am unable to enable cluster slot stats on Valkey

This option requires Valkey 8.0 or later, which introduced `cluster-slot-stats-enabled`. On older versions, Valkey Admin will offer monitor-based detection instead.

---

## I just connected to my cluster and see multiple unresponsive nodes

**Fix:** Metrics servers need a moment to start up after a connection is established.

---

## Intermittent "No primary node found" when connecting to large clusters via discovery endpoint

When connecting to an ElastiCache cluster configuration endpoint (`clustercfg.*`) with a large number of nodes (50+), the connection may intermittently fail with "No primary node found." This is caused by a [known issue in Valkey GLIDE](https://github.com/valkey-io/valkey-glide/issues/5809) where the standalone client struggles with DNS endpoints that resolve to many IP addresses.

**Workaround:** Connect using a specific node hostname (e.g., `<replication-group>-0001-001.<replication-group>.<suffix>`) instead of the `clustercfg.*` endpoint. Valkey Admin will discover the full cluster topology from any single node.

**Fix:** This is resolved in GLIDE 2.4 with the new `NodeDiscoveryMode.STATIC` option ([PR #5724](https://github.com/valkey-io/valkey-glide/pull/5724)).

---

## Key sampling numbers differ between views

The key browser and the distribution chart use separate sampling passes, so their counts won't always match exactly. This is expected behavior with sampled data — each view samples independently and may pick up a slightly different cross-section of the keyspace.

---

For a list of capabilities and operational caveats that aren't bugs (no built-in auth, no RBAC, mTLS, ElastiCache Serverless, etc.), see [Known Limitations](/reference/limitations/).
