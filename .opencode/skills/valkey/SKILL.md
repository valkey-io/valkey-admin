# Valkey Skill

Use this skill when changing Valkey connection, command, dashboard, metrics, key-browser, monitoring, or cluster behavior.

## Client Behavior

- Distinguish standalone and cluster clients. Cluster calls may return fanout records or routed single-node responses.
- Route explicitly when querying a specific cluster node.
- Normalize Valkey command responses at backend, middleware, or parser boundaries before frontend components consume them.
- Treat unsupported commands and unavailable server capabilities as expected errors when they can happen in real deployments.
- Keep raw Valkey transport details out of React components.

## Data Domains

- Dashboard info, memory metrics, CPU metrics, key browser data, command output, hot keys, slow logs, large replies, large requests, and monitor output are separate domains.
- Do not reuse a response shape across domains just because the transport is the same.
- Shared parsing/formatting logic that is useful across apps belongs in `common/`.
- Preserve useful command semantics, but expose typed domain-shaped data to UI and selectors.

## Cluster Handling

- Be careful with node IDs, cluster IDs, connection IDs, and sanitized host keys. Do not treat them as interchangeable.
- Prefer explicit route/address handling for per-node dashboard and metrics queries.
- Account for cluster endpoint discovery versus direct node connections.
- Avoid fanout surprises: check whether a Glide command returns a string, record keyed by address, or key/value rows.

## Errors And Logging

- Return expected Valkey/domain errors as values where practical, then pattern-match at the UX/retry/logging boundary.
- Throw only for programmer errors, impossible states, startup/config failures, or framework-required exception flows.
- Never log passwords, IAM tokens, credentials, connection strings with secrets, or raw secure-storage payloads.
- Redact connection details in errors and debug logs.

## Testing

- Add focused regression tests for parser changes, response normalization, cluster routing, and unsupported-command fallbacks.
- Mock both standalone and cluster response shapes when behavior depends on the client type.
- Test `undefined` and `null` states separately when Valkey data can be absent or explicitly null.

