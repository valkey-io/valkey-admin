---
title: Known Limitations
description: Capabilities and behaviors Valkey Admin doesn't currently support.
---

This page lists the capabilities and operational caveats you should know about **before deploying** Valkey Admin. Items are grouped by category so you can scan to the area that matters for your environment.

For runtime issues and fixes, see the [Troubleshooting guide](/reference/troubleshooting/).

## Authentication & access control

- **No built-in authentication.** Valkey Admin does not provide its own login layer. Web deployments rely on an external auth proxy — for example, AWS Cognito in front of an Application Load Balancer, or a reverse proxy such as nginx or oauth2-proxy.
- **No RBAC within the app.** Any user who can reach the UI can run any command the connected Valkey ACL allows. Scope what the connecting Valkey user is permitted to do, not who can use the app.
- **Isolation is per Valkey user and deployment.** Users who connect as the same Valkey user to the same Valkey deployment share one client per connection and one set of metrics collectors. Users who connect as different Valkey users, or to different deployments, share nothing. Two spellings of one host (a hostname and its IP) count as two deployments and get two sets of collectors. The cost is one collector per node per owner; see [Resource Sizing](/deployment/resource-sizing/).
- **Password after a page reload.** The web app asks for the password again after a page reload or in a new tab.
- **Failed authentication limit.** After 10 failed authentication attempts in 60 seconds for one node and one Valkey user, Valkey Admin rejects new attempts for 60 seconds. Anyone who knows a username and endpoint can trigger this lockout for that user.

## TLS

- **mTLS is not currently supported.** Standard TLS with password authentication, AWS ElastiCache IAM authentication, or GCP Memorystore for Valkey IAM authentication is available.

## Managed services

- **ElastiCache Serverless has limited support.** Key Browser and Send Command work. Dashboard metrics, Activity features (Hot Keys, Big Keys, Command Logs), and Monitor are unavailable because Serverless restricts the `INFO` (Memory, CPU, Stats, Clients, Keyspace sections), `MONITOR`, `COMMANDLOG`, `MEMORY USAGE`, and `CLUSTER SLOT-STATS` commands.

## Architecture

- **No bare-metal web server.** Run the web server in Docker or Kubernetes, or use the desktop app. Running `apps/server` directly on a host is not supported.
- **Kubernetes metrics.** The collector-backed features (dashboard history, hot keys, big keys, command logs, Monitor) are not available in Kubernetes in this release.

- **Metrics servers are per-primary only.** Each primary node gets its own metrics collector; replica nodes are not independently monitored.
- **Key browser sample size.** The key browser scans up to approximately 1,000 keys across the cluster. Keys beyond this limit are not listed but can still be found using the search function, which uses SCAN with a MATCH pattern (the same mechanism, just filtered).
