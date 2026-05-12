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

- **mTLS is not currently supported.** Standard TLS with password authentication or AWS ElastiCache IAM authentication is available.

## Managed services

- **ElastiCache Serverless is not supported.** Only ElastiCache node-based (non-serverless) clusters can be connected.

## Architecture

- **Metrics servers are per-primary only.** Each primary node gets its own metrics collector; replica nodes are not independently monitored.
- **Key browser sample size.** The key browser scans up to approximately 1,000 keys across the cluster. Keys beyond this limit are not listed but can still be found using the search function, which performs a targeted lookup.
