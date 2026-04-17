# RxJS And RTK Skill

Use this skill when changing Redux slices, selectors, epics, websocket flows, or frontend data orchestration.

## Data Flow

- Use the repo data flow: component -> intent action -> middleware/API -> RTK -> selectors -> component.
- Components should not orchestrate API calls, websocket sends, retries, polling, timers, or chained actions.
- Use middleware/epics for async coordination, websocket transport, debouncing, retries, polling, timers, and action fan-out.
- Keep reducers focused on state updates and compute-pattern derived state.
- Normalize incoming API and Valkey responses before components consume them.

## Selectors

- Components should consume named selectors instead of anonymous `useSelector((state) => ...)` functions.
- Put single-slice selectors near their slice.
- Put cross-slice selectors in a domain selector file. Create a shared/global selector file only when the selector does not belong to one domain.
- Use selectors to expose prepared data for render. Avoid repeated component-local transforms.
- Derived values may live in Redux when intentionally computed for render speed, consistency, or shared use.

## Hooks

- Hooks are for reusable component-local behavior, browser/DOM integration, and small UI interaction state.
- Do not use hooks as hidden service layers for API orchestration, Redux-derived state, websocket flows, retries, polling, or action chaining.
- For external stores and subscription-based runtime state, prefer `useSyncExternalStore`.
- Avoid `useEffect + setState` subscriptions unless the source cannot fit a subscribe/getSnapshot model.
- Avoid `useEffect` for app data flow.
- Do not add `useMemo` or `useCallback` by default. Prefer selectors, compute steps, stable component boundaries, and React Compiler.

## RxJS Practices

- Keep epics small and named by workflow.
- Use typed action creators and `select(...)` helpers where available.
- Put error handling at the workflow boundary that decides retry, toast, logging, or fallback behavior.
- Prefer explicit cancellation semantics for long-running streams.
- Avoid nested subscriptions. Compose streams with RxJS operators.

## Error Handling

- Represent expected API/domain failures as error objects or rejected workflow actions.
- Pattern-match error shapes before deciding UI, retry, or logging behavior.
- Redact secrets from logs and websocket payload diagnostics.
