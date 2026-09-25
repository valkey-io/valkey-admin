---
title: Known Limitations
description: Capabilities and behaviors Valkey Admin doesn't currently support.
---

This page lists the capabilities and operational caveats you should know about **before deploying** Valkey Admin. Items are grouped by category so you can scan to the area that matters for your environment.

For runtime issues and fixes, see the [Troubleshooting guide](/reference/troubleshooting/).

## Authentication & access control

- **No built-in authentication.** Valkey Admin does not provide its own login layer. Web deployments rely on an external auth proxy — for example, AWS Cognito in front of an Application Load Balancer, or a reverse proxy such as nginx or oauth2-proxy.
- **No RBAC within the app.** Any user who can reach the UI can run any command the connected Valkey ACL allows. Scope what the connecting Valkey user is permitted to do, not who can use the app.

## TLS

- **mTLS is not currently supported.** Standard TLS with password authentication, AWS ElastiCache IAM authentication, or GCP Memorystore for Valkey IAM authentication is available.

## Managed services

- **ElastiCache Serverless has limited support.** Key Browser and Send Command work. Dashboard metrics, Activity features (Hot Keys, Big Keys, Command Logs), and Monitor are unavailable because Serverless restricts the `INFO` (Memory, CPU, Stats, Clients, Keyspace sections), `MONITOR`, `COMMANDLOG`, `MEMORY USAGE`, and `CLUSTER SLOT-STATS` commands.

## Architecture

- **Metrics servers are per-primary only.** Each primary node gets its own metrics collector; replica nodes are not independently monitored.
- **Key browser scanning.** Keys load incrementally in batches of up to 200, with bounded scan work per request. Search and type filters apply before metadata enrichment. Sorting covers loaded results only, not undiscovered keys. SCAN is not a snapshot, so concurrent changes may require a refresh. Sparse searches may require additional **Load more** requests even when a batch is empty. Continuations expire after 30 minutes or a browser reconnection; refresh to restart. Loaded keys accumulate in browser memory, so very large result sets can still affect browser performance.
