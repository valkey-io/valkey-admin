# Valkey Admin

Valkey Admin is a web-based administration tool for [Valkey](https://valkey.io) clusters and standalone instances. It provides an intuitive interface to monitor, manage, and interact with your Valkey deployments.

Full documentation lives at **[valkey-admin.valkey.io](https://valkey-admin.valkey.io)**.

## Key Features

- **[Dashboard](https://valkey-admin.valkey.io/features/dashboard/)** — Real-time metrics for memory, CPU, connected clients, hit ratio, and command throughput.
- **[Key Browser](https://valkey-admin.valkey.io/features/key-browser/)** — Browse, search, inspect, and edit keys across all data types (String, Hash, List, Set, Sorted Set, Stream, JSON).
- **[Send Command](https://valkey-admin.valkey.io/features/send-command/)** — Execute Valkey commands with response formatting and command history.
- **[Cluster Topology](https://valkey-admin.valkey.io/features/cluster-topology/)** — Visual map of shards, primaries, and replicas with per-node metrics.
- **[Activity](https://valkey-admin.valkey.io/features/activity/)** — Hot Keys monitoring plus Command Logs (slow commands, large requests, large replies) aggregated across the cluster.

## Compatibility

Valkey Admin works with all supported Valkey versions. Some features are version-gated:

- **Command Logs** (slow commands, large requests/replies) require Valkey 8.1+.
- **Hot Slots detection** requires Valkey 8.0+ with `cluster-slot-stats-enabled` set to `yes`.

## Getting Started

**Documentation:** [valkey-admin.valkey.io](https://valkey-admin.valkey.io/introduction/)

**Install:**

- **Desktop (macOS / Linux)** — Download from [GitHub Releases](https://github.com/valkey-io/valkey-admin/releases). See the [Desktop deployment guide](https://valkey-admin.valkey.io/deployment/desktop/).
- **Docker** — Images published to GHCR, Docker Hub, and ECR Public. See the [Docker deployment guide](https://valkey-admin.valkey.io/deployment/docker/).
- **Kubernetes** — Sidecar-based deployment for cluster-scale collection. See the [Kubernetes deployment guide](https://valkey-admin.valkey.io/deployment/kubernetes/).
- **AWS ElastiCache** — See the [AWS ElastiCache guide](https://valkey-admin.valkey.io/deployment/aws-elasticache/).

## Releases

Latest: **v1.0.1**. See [GitHub Releases](https://github.com/valkey-io/valkey-admin/releases) for the full changelog.

## Getting Help

If you run into issues or have questions, open a [GitHub issue](https://github.com/valkey-io/valkey-admin/issues). Before filing a new issue, please check the existing ones to see if your question has already been addressed. When reporting a bug, please include:

1. A clear and concise title
2. Detailed description of the problem or question
3. Reproducible test case or step-by-step instructions
4. Valkey Admin version in use
5. Operating system details
6. Valkey server version
7. Cluster or standalone setup details (topology, shard/replica counts, data types in use)
8. Any relevant modifications you've made
9. Unusual aspects of your environment or deployment
10. Log files

## Troubleshooting & Known Limitations

Before deploying, review the project's known limitations and operational caveats — including authentication, ACL/RBAC, replica monitoring, key-browser sampling, mTLS, and ElastiCache Serverless support.

See [Troubleshooting & Known Limitations](https://valkey-admin.valkey.io/reference/troubleshooting/) for the full list and recommended workarounds.

## Contributing

Interested in improving Valkey Admin? See [CONTRIBUTING.md](./CONTRIBUTING.md) for the RFC process, development setup, architectural guidelines, and the contribution workflow.

## Community

Join the conversation on the Valkey OSS Developer Slack: [Join Valkey Slack](https://join.slack.com/t/valkey-oss-developer/shared_invite/zt-2nxs51chx-EB9hu9Qdch3GMfRcztTSkQ).

## License

Valkey Admin is released under the [Apache License 2.0](./LICENSE).
