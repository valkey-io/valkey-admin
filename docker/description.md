# Quick reference

-	**Maintained by**:
	[the Valkey Community](https://github.com/valkey-io/valkey-admin)

-	**Where to get help**:
	Please open an Issue stating your question on [the Valkey Community](https://github.com/valkey-io/valkey-admin/issues).


## Official releases
[1.0](https://github.com/valkey-io/valkey-admin/blob/v1.0.0/docker/Dockerfile.app)

What is [Valkey Admin](https://github.com/valkey-io/valkey-admin)?
--------------
Valkey Admin is a web-based administration tool for Valkey clusters and standalone instances. It provides an intuitive interface to monitor, manage, and interact with your Valkey deployments.

### Features
- **Dashboard:** real-time metrics including memory usage, CPU, connected clients, hit ratio, and command throughput
- **Cluster Topology:** visual map of shards, primaries, and replicas with per-node metrics
- **Key Browser:** browse, search, inspect, and edit keys across all data types 
- **Send Command:** execute Valkey commands with response diffing and command history
- **Hot Keys Monitoring:** identify frequently accessed keys across all cluster nodes
- **Command Logs:** view slow commands, large requests, and large replies aggregated across the cluster

### Compatibility
Valkey Admin works with all versions of Valkey. Some features require newer versions:
- **Command Logs** (slow commands, large requests/replies): Valkey 8.1+
- **Hot Slots Detection** (via `CLUSTER SLOT-STATS`): Valkey 8.0+ with `cluster-slot-stats-enabled` set to `yes`

## How to use this image

### Start Valkey Admin

```console
$ docker run -d --name valkey-admin -p 8080:8080 valkey/valkey-admin
```

Then open `http://localhost:8080` in your browser and connect to your Valkey instance.

### Pre-configured connection

Start with a pre-configured Valkey connection so metrics collection begins immediately:

```console
$ docker run -d --name valkey-admin -p 8080:8080 \
  -e VALKEY_HOST=your-valkey-host \
  -e VALKEY_PORT=6379 \
  -e VALKEY_USERNAME=default \
  -e VALKEY_PASSWORD=your-password \
  -e VALKEY_TLS=true \
  valkey/valkey-admin
```

### AWS ElastiCache with IAM authentication

```console
$ docker run -d --name valkey-admin -p 8080:8080 \
  -e VALKEY_HOST=your-cluster-endpoint \
  -e VALKEY_PORT=6379 \
  -e VALKEY_USERNAME=your-iam-user \
  -e VALKEY_AUTH_TYPE=iam \
  -e VALKEY_TLS=true \
  -e VALKEY_AWS_REGION=us-west-1 \
  -e VALKEY_REPLICATION_GROUP_ID=your-replication-group-id \
  valkey/valkey-admin
```

### Environment variables

Here are all the relevant environment variables for configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `DEPLOYMENT_MODE` | Deployment mode (`Web`, `K8`) | `Web` |
| `PORT` | Server port | `8080` |
| `VALKEY_HOST` | Pre-configured Valkey host | — |
| `VALKEY_PORT` | Pre-configured Valkey port | `6379` |
| `VALKEY_USERNAME` | Valkey username | — |
| `VALKEY_PASSWORD` | Valkey password | — |
| `VALKEY_TLS` | Enable TLS | `false` |
| `VALKEY_AUTH_TYPE` | Authentication type (`password`, `iam`) | `password` |
| `HOT_KEYS_COUNT` | Maximum hot keys returned per query | `50` |
| `COMMAND_LOGS_COUNT` | Maximum command log entries returned per query | `100` |
| `CONFIG_PATH` | Path to custom metrics config.yml | — |

### Custom metrics configuration

Mount a custom `config.yml` to adjust collection intervals and data retention:

```console
$ docker run -d --name valkey-admin -p 8080:8080 \
  -e CONFIG_PATH=/config/config.yml \
  -v /path/to/your/config.yml:/config/config.yml:ro \
  valkey/valkey-admin
```

For more information on configuration, deployment options, and Kubernetes setup, see the [Valkey Admin README](https://github.com/valkey-io/valkey-admin#readme).

## Resource sizing

Each primary node in your cluster gets a dedicated metrics server process. Plan resources accordingly:

| Cluster Size | Recommended Spec |
|---|---|
| 1–5 primaries | 2 vCPU, 2 GB RAM |
| 5–50 primaries | 4 vCPU, 8 GB RAM |
| 50–100 primaries | 4 vCPU, 16 GB RAM |
| 100–200 primaries | 16 vCPU, 32 GB RAM |
| 200–400+ primaries | 32 vCPU, 64 GB RAM |

# License

View [license information](https://github.com/valkey-io/valkey-admin/blob/main/NOTICES) for the software contained in this image.

As with all Docker images, these likely also contain other software which may be under other licenses (such as Bash, etc from the base distribution, along with any direct or indirect dependencies of the primary software being contained).

As for any pre-built image usage, it is the image user's responsibility to ensure that any use of this image complies with any relevant licenses for all software contained within.
