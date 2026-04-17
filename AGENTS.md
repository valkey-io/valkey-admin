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
- Keep Valkey client and transport details out of React components.
- Normalize API and Valkey responses at ingestion boundaries: server handlers, middleware, reducers, or shared parsers.
- Prefer reusing existing types over copying shapes. Reuse API/schema/domain types for component props when the component truly consumes that shape.

## State Flow

- Treat RTK slices and selectors as the source of truth for app/domain state.
- Components should dispatch intent actions and consume selectors. Avoid anonymous `useSelector((state) => ...)` in components.
- Put single-slice selectors near the slice. Put selectors that join multiple state areas in a domain selector file; create a shared/global selector file only when the cross-slice selector does not belong to one domain.
- Derived Redux fields are valid when intentional. Use the compute pattern when prepared view data improves render simplicity, consistency, or performance.
- Avoid recomputing shared derived values ad hoc inside components. Move shared transforms into reducers, selectors, or `common/`.
- Keep `undefined` and `null` distinct:
  - `undefined` means a field or value is absent, not requested, not loaded, or not applicable to that shape.
  - `null` means the source explicitly returned no value.
  - Do not use `R.isNil` where this distinction matters. Avoid optional fields that can also be `null` unless both states are real.

## Middleware

- Use middleware/epics for websocket sends, API calls, action chaining, retries, timers, polling, debouncing, and async coordination.
- Avoid `useEffect` for application data flow. Components should not use effects to fetch data, sync Redux state, chain actions, or coordinate websocket/API workflows.
- Embrace middleware as the workflow layer: component -> intent action -> middleware/API -> RTK -> selectors -> component.

## React

- Custom hooks are appropriate for reusable component-local behavior, browser/DOM integration, and small UI interaction state.
- Do not use hooks as hidden service layers for API orchestration, Redux-derived state, websocket flows, retries, polling, or action chaining.
- For external stores or subscription-based browser/runtime state, prefer `useSyncExternalStore` so React owns snapshot consistency.
- Avoid `useEffect + setState` subscription patterns unless the API cannot fit the external-store model.
- Use `useEffect` only for imperative side effects that are not render-state subscriptions, such as focus/scroll commands, title updates, event reporting, imperative library setup/cleanup, or component-local resource cleanup.
- Do not add `useMemo` or `useCallback` by default. Prefer straightforward code, selectors, compute steps, and stable component boundaries.
- Treat manual memoization as an exception that needs a short reason: measured issue, external API referential-stability requirement, or a case React Compiler cannot optimize safely.

## Components And Markup

- Use semantic HTML where the element has meaning or interaction: `main`, `section`, `header`, `nav`, `ul`, `li`, `button`, `form`, `label`, and related elements.
- Use `div` for layout, containment, flex/grid, spacing, overflow, or styling only when no semantic element fits.
- Avoid unnecessary nested `div`s and anonymous wrapper trees.
- Prefer named components for repeated or meaningful UI concepts in `apps/frontend/src/components`.
- Prefer composition over large components and prop-heavy abstractions.

## Styling

- Use `cn` for conditional class composition.
- Do not introduce raw Tailwind color utilities such as `text-gray-*`, `bg-blue-*`, or `border-red-*`.
- Use semantic color tokens from `apps/frontend/src/css/index.css`, such as `background`, `foreground`, `muted`, `muted-foreground`, `primary`, `secondary`, `accent`, `destructive`, `border`, `input`, `card`, and sidebar/chart tokens.
- If a needed semantic color is missing, propose the smallest new token first. Add light and dark theme values together.
- Ensure foreground/background color pairs have sufficient WCAG contrast, including muted text, badges, destructive states, focus states, disabled states, and chart labels.
- Account for both light and dark themes in every new UI state.

## Errors

- Prefer return-style error objects for expected domain failures, validation failures, unsupported Valkey capabilities, and recoverable API outcomes.
- Use discriminated unions such as `{ ok: true, data } | { ok: false, error }` where practical.
- Pattern-match errors at the boundary that decides UX, logging, retries, or fallback behavior.
- Throw for programmer errors, impossible states, startup/config failures, or framework-required exception flows.
- Never log passwords, IAM tokens, credentials, connection strings with secrets, or raw secure-storage payloads. Redact sensitive connection details in logs and errors.
