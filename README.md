# Valkey Admin

Valkey Admin is a web-based administration tool for [Valkey](https://valkey.io) clusters and standalone instances. It provides an intuitive interface to monitor, manage, and interact with your Valkey deployments.

## Features

- **Dashboard:** real-time metrics including memory usage, CPU, connected clients, hit ratio, and command throughput

![Dashboard](screenshots/dashboard.png)
![DashboardMetrics](screenshots/dashboard2.png)

- **Cluster Topology:** visual map of shards, primaries, and replicas with per-node metrics

![Cluster Topology](screenshots/cluster_topology.png)

- **Key Browser:** browse, search, inspect, and edit keys across all data types (String, Hash, List, Set, Sorted Set, Stream, JSON)

![Key Browser](screenshots/key_browser.png)

- **Send Command:** execute Valkey commands with response formatting and command history

![Send Command](screenshots/send_command.png)

- **Hot Keys Monitoring:** identify frequently accessed keys across all cluster nodes

![Monitoring Hot Keys](screenshots/monitoring_hotkeys.png)

- **Command Logs:** view slow commands, large requests, and large replies aggregated across the cluster

![Monitoring Slow Logs](screenshots/monitoring_slowlogs.png)

## Platform Support

- **macOS** (native desktop app)
- **Linux** (native desktop app — AppImage and deb)
- **Docker** (web deployment)
- **Kubernetes** (web deployment with metrics sidecars)

## Installation

### Desktop App

Download the latest release from [GitHub Releases](https://github.com/valkey-io/valkey-admin/releases):

- **macOS:** Download the `.dmg` file, open it, and drag Valkey Admin to Applications
- **Linux:** Download the `.AppImage` or `.deb` package

### Docker

Docker images are published to the following registries:

| Registry | Image |
|----------|-------|
| GitHub Container Registry | `ghcr.io/valkey-io/valkey-admin` |
| Docker Hub | `valkey/valkey-admin` |
| Amazon ECR Public Gallery | `public.ecr.aws/valkey/valkey-admin` |

**Example:** 
```bash
docker pull valkey/valkey-admin:latest
```

See [examples/](./examples/) for deployment guides including Docker, Kubernetes, and AWS ElastiCache.


## Resource Sizing

In Web and Docker deployment modes, Valkey Admin spawns a metrics server process for each primary node in the cluster. Plan resources accordingly.

**Formulas:**
- **RAM:** `(primary nodes × 150 MB) + 1 GB`
- **Disk:** `(primary nodes × 50 MB) + 1 GB`

### Approximate Resource Recommendations

| Cluster Size | Recommended Spec |
|---|---|
| 1–5 primaries | 2 vCPU, 2 GB RAM |
| 5–50 primaries | 2 vCPU, 8 GB RAM |
| 50–100 primaries | 4 vCPU, 16 GB RAM |
| 100–200 primaries | 4 vCPU, 32 GB RAM |
| 200–400+ primaries | 8 vCPU, 64 GB RAM |

> **Warning:** These recommendations are based on the default retention settings in [config.yml](./apps/metrics/config.yml). If you increase `data_retention_mb` or `data_retention_days`, adjust your resource allocation accordingly. Disk usage scales at approximately `(primary nodes × 50 MB) + 1 GB` with default retention settings.

For Kubernetes deployments, metrics servers run as sidecars on each Valkey pod, so the main Valkey Admin deployment only needs ~1 GB RAM.

> **Note:** The desktop app (Electron) spawns a metrics server for each node you connect to. For large clusters, connecting to many nodes individually will increase local RAM and disk usage. Refer to the [formulas above](#resource-sizing) to ensure your machine can handle the load.

## Configuration

Valkey Admin is configured through environment variables. All variables are optional. 

### Backend Server

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server listen port | `8080` |
| `DEPLOYMENT_MODE` | Controls metrics server orchestration. If `Web`, all metrics servers for cluster nodes start on any successful connection. If `Electron`, the metrics server only starts when you've successfully connected to a particular node. | `Electron` for Desktop and `Web` for Docker |
| `TTL` | Metrics server health check timeout (ms) | `60000` |
| `TOPOLOGY_REFRESH_INTERVAL` | Cluster topology refresh interval (ms) | `30000` |

### Pre-configured Metrics Collection

Set these to start all metrics servers for your cluster on startup, before manually connecting via UI (Web and K8 modes):

| Variable | Description | Default |
|----------|-------------|---------|
| `VALKEY_HOST` | Valkey host or cluster endpoint | — |
| `VALKEY_PORT` | Valkey port | `6379` |
| `VALKEY_TLS` | Enable TLS | `false` |
| `VALKEY_VERIFY_CERT` | Verify TLS certificate | `false` |
| `VALKEY_ENDPOINT_TYPE` | `node` or `cluster-endpoint` | `cluster-endpoint` |
| `VALKEY_AUTH_TYPE` | `password` or `iam` | `password` |
| `VALKEY_USERNAME` | Authentication username | — |
| `VALKEY_PASSWORD` | Authentication password | — |
| `VALKEY_AWS_REGION` | AWS region (IAM auth only) | — |
| `VALKEY_REPLICATION_GROUP_ID` | ElastiCache replication group ID (IAM auth only) | — |

### Metrics Server

These are set automatically when the server spawns metrics processes. Only relevant for Kubernetes sidecar deployments:

| Variable | Description | Default |
|----------|-------------|---------|
| `CONFIG_PATH` | Path to metrics config YAML. Mount a custom file to override collection and retention settings. | `config.yml` |
| `DATA_DIR` | Metrics data storage directory | `./data` |
| `SERVER_HOST` | Main server host for registration. Default is localhost, as metrics servers are forked from the main process. | `localhost` |
| `SERVER_PORT` | Main server port for registration | `8080` |

### Metrics Config (`config.yml`)

The metrics config file controls collection intervals and data retention. Override it by mounting a custom file and setting `CONFIG_PATH`.

See [apps/metrics/config.yml](./apps/metrics/config.yml) for the default epic configuration.

**Global settings:**

| Setting | Description | Default |
|---------|-------------|---------|
| `backend.ping_interval` | How often each metrics server pings the main server (ms) | `10000` |
| `collector.batch_ms` | Batch write interval for metric data (ms) | `60000` |
| `collector.batch_max` | Max records per batch write | `500` |

**Per-epic settings:**

Each metric collector (epic) supports the following options:

| Setting | Description | Default |
|---------|-------------|---------|
| `poll_ms` | Collection interval (ms) | varies by epic |
| `data_retention_mb` | Max disk space per epic (MB). Oldest files evicted when exceeded. | `10` |
| `data_retention_days` | Files older than this are deleted during daily cleanup. | `30` |

## Contributing

Interested in improving Valkey Admin? See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, architecture guidelines, and the contribution process.

## License

Valkey Admin is released under the [Apache License 2.0](./LICENSE).
