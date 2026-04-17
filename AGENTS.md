# AGENTS.md

Guidance for coding agents working in this repository.

## Workflow

- Read the relevant code before changing behavior. Follow existing patterns unless there is a clear reason to improve them.
- Keep changes scoped to the requested behavior. Do not mix unrelated refactors into feature or bug-fix work.
- Preserve user changes. Never revert or overwrite unrelated dirty files unless explicitly asked.
- Add focused tests for behavior changes, especially reducers, selectors, middleware, parsers, Valkey response normalization, and shared utilities.
- Leave concise comments only when they explain why code exists or why a non-obvious choice was made. No emojis.

## Architecture

- `apps/frontend` is the React/Electron UI. It talks to the local app backend primarily through websocket actions and consumes RTK state through selectors.
- `apps/server` is the local Node backend. It serves the frontend with Express REST/static routes and handles websocket actions for Valkey connection, command, dashboard, config, and monitoring workflows.
- `apps/metrics` is the metrics sidecar/service. It exposes REST endpoints for collected time-series data and writes/streams metric snapshots.
- `common/` is shared code for constants, types, formatting, parsing, and pure utilities used across apps.
- Use `common/` for shared pure utilities, types, constants, formatting, and domain code used by frontend, backend, or metrics.
- Do not import frontend code into server or metrics code.
- Normalize API and Valkey responses at ingestion boundaries: server handlers, middleware, reducers, or shared parsers.
- Prefer reusing existing types over copying shapes. Reuse API/schema/domain types for component props when the component truly consumes that shape.

## Types

- Keep `undefined` and `null` distinct:
  - `undefined` means a field or value is absent, not requested, not loaded, or not applicable to that shape.
  - `null` means the source explicitly returned no value.
  - Do not use `R.isNil` where this distinction matters. Avoid optional fields that can also be `null` unless both states are real.
- Keep type definitions aligned with source semantics. Do not widen types to make call sites easier unless the wider state really exists.

## Errors

- Prefer return-style error objects for expected domain failures, validation failures, unsupported Valkey capabilities, and recoverable API outcomes.
- Use discriminated unions such as `{ ok: true, data } | { ok: false, error }` where practical.
- Pattern-match errors at the boundary that decides UX, logging, retries, or fallback behavior.
- Throw for programmer errors, impossible states, startup/config failures, or framework-required exception flows.
- Never log passwords, IAM tokens, credentials, connection strings with secrets, or raw secure-storage payloads. Redact sensitive connection details in logs and errors.

## Testing

- Add focused tests where behavior changes.
- Prefer regression tests for bug fixes when practical.
- State clearly when tests cannot run because dependencies, services, or environment are unavailable.
