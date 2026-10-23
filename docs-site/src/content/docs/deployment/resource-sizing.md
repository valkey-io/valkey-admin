---
title: Resource Sizing
description: How to size Valkey Admin deployments across Web, Kubernetes, and Desktop modes.
---

Valkey Admin's resource footprint depends on **how** metrics collectors are spawned, which differs by deployment mode. This page walks through each mode so you can size the right host (or pod, or laptop).

## Overview

| Mode | Where metrics collectors run | Where sizing matters |
|------|------------------------------|----------------------|
| Web / Docker | Child processes of the main app | The Valkey Admin instance |
| Kubernetes | Sidecar inside each Valkey pod | The Valkey pods (main app stays small) |
| Desktop (Electron) | Child processes on the user's machine | The user's machine |

The common factor: each metrics collector adds roughly **150 MB RAM** and **50 MB disk**. Valkey Admin runs one collector per monitored primary node **per Valkey identity** connected to it. Users who connect as the same Valkey user share collectors. Users who connect as different Valkey users each get their own, so their metrics are collected with their own credentials.

## Web / Docker mode

In Docker (Web) mode, Valkey Admin spawns a metrics server process for each primary node in the cluster, for each Valkey identity connected to it. All collectors run on the same host as the main app, so plan resources for the entire cluster and the number of distinct Valkey users up front.

**Formulas:**

- **Collectors:** `primary nodes × distinct Valkey identities`
- **RAM:** `(collectors × 150 MB) + 1 GB`
- **Disk:** `(collectors × 50 MB) + 1 GB`
- **Valkey connections:** each user's cluster connection holds two connections per node, and each collector holds its own connection to its node.

For example, 10 distinct Valkey users on a cluster with 30 primaries can mean 300 collectors. The table below is for one identity; multiply the primary count by the number of identities before you read it. All collectors share one rate limit on the server's collector API, so also check [`ORCHESTRATOR_RATE_LIMIT_MAX`](/configuration/server/#orchestrator_rate_limit_max).

### Approximate recommendations

| Cluster Size | Recommended Spec |
|---|---|
| 1–5 primaries | 2 vCPU, 2 GB RAM |
| 5–50 primaries | 4 vCPU, 8 GB RAM |
| 50–100 primaries | 8 vCPU, 16 GB RAM |
| 100–200 primaries | 16 vCPU, 32 GB RAM |
| 200–400+ primaries | 32 vCPU, 64 GB RAM |

:::note
These recommendations are based on default retention settings. If you increase `data_retention_mb` or `data_retention_days` for any epic, adjust your resource allocation accordingly. See [Per-Epic Settings](/configuration/metrics/#per-epic-settings) for tuning options.
:::

For large clusters, consider [Kubernetes deployment](/deployment/kubernetes/) where metrics collectors move out of the main process tree and onto the Valkey pods themselves.

## Kubernetes

Kubernetes flips the sizing story: instead of the main app spawning children, each Valkey pod runs its own metrics **sidecar**. In this release the collector-backed features are not available in Kubernetes (see [Kubernetes deployment](/deployment/kubernetes/)), so the sidecars are optional there. The main `valkey-admin-app` deployment only orchestrates registrations and serves the UI, so it stays small regardless of cluster size.

**Main `valkey-admin-app` deployment:**

- ~1 GB RAM is enough for most clusters.
- No per-node scaling — the deployment never spawns metrics children in K8s mode.

**Per Valkey pod (with sidecar):**

- Add ~150 MB RAM and ~50 MB disk to the pod's existing requests/limits for the metrics sidecar.
- Sidecar shares the pod's lifecycle, so sizing folds into the StatefulSet's pod spec.

See the [Kubernetes deployment guide](/deployment/kubernetes/) for the manifest layout and sidecar patch.

## Desktop (Electron)

The desktop app spawns a metrics child for each node you explicitly connect to. For large clusters, connecting to many nodes individually can blow up local RAM and disk usage on your laptop.

**Rule of thumb:** apply the Web/Docker formulas to your local machine, but count only the nodes you have actively connected — not the full cluster size. If you connect to the same node as two Valkey users, count it twice.

For example, if you open desktop connections to 20 nodes in a 50-shard cluster:

- **RAM:** `(20 × 150 MB) + 1 GB` ≈ 4 GB
- **Disk:** `(20 × 50 MB) + 1 GB` ≈ 2 GB

If your laptop can't host that comfortably, use the [Docker](/deployment/docker/) or [Kubernetes](/deployment/kubernetes/) deployment instead — both move the metrics workload off your machine.

## Retention tuning

Disk usage scales linearly with how long each epic keeps NDJSON files. The two relevant fields are `data_retention_mb` (per-epic disk budget) and `data_retention_days` (age-based cleanup). Both are documented under [Per-Epic Settings](/configuration/metrics/#per-epic-settings).

The shipped `apps/metrics/config.yml` uses conservative defaults (3–15 MB per epic, 5 days). Raising either field on busy clusters shifts the disk recommendations above proportionally.
