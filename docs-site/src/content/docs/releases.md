---
title: What's New
description: Release notes and changelog for Valkey Admin
sidebar:
  order: 0
---

## v1.1.1

Release Date: August 2026

### Performance

- Pipeline per-key commands (MEMORY USAGE, TYPE, TTL) in Big Keys scan for 20x throughput improvement on large clusters ([#451](https://github.com/valkey-io/valkey-admin/pull/451))

### Security

- Bind server to localhost in Electron mode to prevent LAN access ([#466](https://github.com/valkey-io/valkey-admin/pull/466))
- Update vulnerable dependencies (ip-address, nanoid, js-yaml, postcss) and run containers as non-root ([#467](https://github.com/valkey-io/valkey-admin/pull/467))

**Full Changelog**: [v1.1.0...v1.1.1](https://github.com/valkey-io/valkey-admin/compare/v1.1.0...v1.1.1)

---

## v1.1.0

Release Date: July 2026

### Key Features

**Big Keys Analysis**: Scan your keyspace to identify the largest keys by memory usage. Configurable scan limit and top N, with per-key access frequency via `OBJECT FREQ` when an LFU eviction policy is configured. Results show key name, size, type, TTL, owning node (cluster mode), and access frequency. ([#376](https://github.com/valkey-io/valkey-admin/pull/376), [#378](https://github.com/valkey-io/valkey-admin/pull/378), [#383](https://github.com/valkey-io/valkey-admin/pull/383), [#390](https://github.com/valkey-io/valkey-admin/pull/390))

**Command Autocomplete**: The Send Command interface now provides autocomplete suggestions from a built-in list of Valkey commands with full subcommand support (396 total entries including subcommands like `CLUSTER SHARDS`, `COMMANDLOG GET`, `CLIENT TRACKING`, etc.). ([#361](https://github.com/valkey-io/valkey-admin/pull/361), [#362](https://github.com/valkey-io/valkey-admin/pull/362), [#415](https://github.com/valkey-io/valkey-admin/pull/415))

**Numbered Database Support**: Connect to specific logical databases (db 0–15) via a database dropdown in the connection modal. Each `(host, port, db)` combination opens an independent client. Cluster mode supports multiple databases on Valkey 9.0+. ([#366](https://github.com/valkey-io/valkey-admin/pull/366), [#368](https://github.com/valkey-io/valkey-admin/pull/368))

**Persist State Across Refresh**: Page refreshes no longer kick users back to the connection page. The application auto-reconnects and navigates back to the previous view. Command history also persists across refreshes. ([#389](https://github.com/valkey-io/valkey-admin/pull/389), [#393](https://github.com/valkey-io/valkey-admin/pull/393))

**Cluster Config Retry**: Configuration updates fan out to all cluster nodes with automatic per-node retry and Fibonacci backoff. Live per-node status is streamed to the UI so operators can see which nodes are updating, retrying, or failed. ([#391](https://github.com/valkey-io/valkey-admin/pull/391))

**Large Cluster Reliability**: Fixed intermittent "No primary node found" errors when connecting to clusters with 50+ nodes by upgrading to Valkey GLIDE 2.4 with `NodeDiscoveryMode.STATIC`. ([#371](https://github.com/valkey-io/valkey-admin/pull/371), [#359](https://github.com/valkey-io/valkey-admin/pull/359))

### Improvements

- Preconfigured standalone connections — `VALKEY_HOST`/`VALKEY_PORT` now auto-detect standalone vs cluster ([#379](https://github.com/valkey-io/valkey-admin/pull/379))
- Key Browser uses pagination for all collection types (hash, list, set, sorted set) ([#364](https://github.com/valkey-io/valkey-admin/pull/364))
- Dangerous commands are blocked or require confirmation before execution ([#358](https://github.com/valkey-io/valkey-admin/pull/358))
- Command parsing correctly handles quoted keys and escaped characters ([#381](https://github.com/valkey-io/valkey-admin/pull/381))
- Binary values display as hex (`\x80\x00\x88`) with printable ASCII shown as-is ([#381](https://github.com/valkey-io/valkey-admin/pull/381))
- Monitor and Command Log errors now surface in the Activity view instead of failing silently ([#373](https://github.com/valkey-io/valkey-admin/pull/373))
- Homebrew cask install available for macOS: `brew install --cask valkey-admin` ([#380](https://github.com/valkey-io/valkey-admin/pull/380))
- `KEY_VALUE_SIZE_LIMIT_BYTES` configurable via environment variable ([#370](https://github.com/valkey-io/valkey-admin/pull/370))
- Upgraded Valkey GLIDE client to 2.4.0 ([#359](https://github.com/valkey-io/valkey-admin/pull/359))

### Security

- Enforce session-based connection authorization in WebSocket dispatch loop ([#411](https://github.com/valkey-io/valkey-admin/pull/411))
- Fix Electron CSP blocking WebSocket connections ([#410](https://github.com/valkey-io/valkey-admin/pull/410))
- Update vulnerable dependencies ([#412](https://github.com/valkey-io/valkey-admin/pull/412))
- Upgrade react-router to 8.3.0 ([#420](https://github.com/valkey-io/valkey-admin/pull/420))
- Add explicit permissions to CI workflows

### Bug Fixes

- Fix metrics server not starting for cluster connections in Electron mode ([#388](https://github.com/valkey-io/valkey-admin/pull/388))
- Fix NodeErrorsBanner showing incorrect label across Activity tabs ([#388](https://github.com/valkey-io/valkey-admin/pull/388))
- Fix `upgrade-insecure-requests` breaking non-localhost HTTP deployments ([#385](https://github.com/valkey-io/valkey-admin/pull/385))
- Fix number input spinners snapping to unexpected values ([#421](https://github.com/valkey-io/valkey-admin/pull/421))
- Fix session authorization rejecting db-stripped node IDs ([#419](https://github.com/valkey-io/valkey-admin/pull/419))
- Fix hot keys returning empty on first MONITOR cycle ([#434](https://github.com/valkey-io/valkey-admin/pull/434))
- Fix monitor stop failing when metrics server crashes ([#431](https://github.com/valkey-io/valkey-admin/pull/431))
- Fix closeMetricsServer sending wrong ID to metrics process ([#428](https://github.com/valkey-io/valkey-admin/pull/428))
- Make search case-insensitive in Send Command view ([#426](https://github.com/valkey-io/valkey-admin/pull/426))

### Contributors

@ravjotbrar, @ArgusLi, @nassery318, @dbaker-arch, @michaelstingl, @antonin-suzor

**Full Changelog**: [v1.0.1...v1.1.0](https://github.com/valkey-io/valkey-admin/compare/v1.0.1...release/1.1.0)

**Release**: [GitHub Releases](https://github.com/valkey-io/valkey-admin/releases/tag/v1.1.0)

**Container Images**:
- Docker Hub: `docker pull valkey/valkey-admin:1.1.0`
- GHCR: `docker pull ghcr.io/valkey-io/valkey-admin:1.1.0`
- ECR Public: `docker pull public.ecr.aws/valkey/valkey-admin:1.1.0`

---

## v1.0.1

Release Date: June 2026

Initial stable release with dashboard, key browser, send command, cluster topology, hot keys monitoring, and command logs.
