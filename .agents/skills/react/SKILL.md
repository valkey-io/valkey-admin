---
name: react
description: Guidance for React frontend work. Use when changing React components, hooks, JSX structure, semantic markup, component composition, selector consumption, or frontend render data flow.
---

# React Skill

Use this skill when changing React components, hooks, JSX structure, or frontend render data flow.

## State Flow

- Treat RTK slices and selectors as the source of truth for app/domain state.
- Components should dispatch intent actions and consume selectors. Avoid anonymous `useSelector((state) => ...)` in components.
- Put single-slice selectors near the slice. Put selectors that join multiple state areas in a domain selector file; create a shared/global selector file only when the cross-slice selector does not belong to one domain.
- Derived Redux fields are valid when intentional. Use the compute pattern when prepared view data improves render simplicity, consistency, or performance.
- Avoid recomputing shared derived values ad hoc inside components. Move shared transforms into reducers, selectors, or `common/`.
- Keep Valkey client and transport details out of React components.

## Hooks

- Custom hooks are appropriate for reusable component-local behavior, browser/DOM integration, and small UI interaction state.
- Do not use hooks as hidden service layers for API orchestration, Redux-derived state, websocket flows, retries, polling, or action chaining.
- For external stores or subscription-based browser/runtime state, prefer `useSyncExternalStore` so React owns snapshot consistency.
- Avoid `useEffect + setState` subscription patterns unless the API cannot fit the external-store model.
- Use `useEffect` only for imperative side effects that are not render-state subscriptions, such as focus/scroll commands, title updates, event reporting, imperative library setup/cleanup, or component-local resource cleanup.
- Avoid `useEffect` for application data flow. Components should not use effects to fetch data, sync Redux state, chain actions, or coordinate websocket/API workflows.
- Do not add `useMemo` or `useCallback` by default. Prefer straightforward code, selectors, compute steps, and stable component boundaries.
- Treat manual memoization as an exception that needs a short reason: measured issue, external API referential-stability requirement, or a case React Compiler cannot optimize safely.

## Components And Markup

- Use semantic HTML where the element has meaning or interaction: `main`, `section`, `header`, `nav`, `ul`, `li`, `button`, `form`, `label`, and related elements.
- Use `div` for layout, containment, flex/grid, spacing, overflow, or styling only when no semantic element fits.
- Avoid unnecessary nested `div`s and anonymous wrapper trees.
- Prefer named components for repeated or meaningful UI concepts in `apps/frontend/src/components`.
- Prefer composition over large components and prop-heavy abstractions.
- Keep components focused on rendering and local interaction. Move data orchestration to middleware and shared transforms to selectors, reducers, or `common/`.
