# Styling Skill

Use this skill when changing Tailwind classes, CSS tokens, themes, layout, or visual UI states.

## Class Composition

- Use `cn` for conditional class composition.
- Keep layout classes close to the element that owns the layout behavior.
- Avoid unnecessary nested wrappers created only to attach styling.

## Color Tokens

- Do not introduce raw Tailwind color utilities such as `text-gray-*`, `bg-blue-*`, or `border-red-*`.
- Use semantic color tokens from `apps/frontend/src/css/index.css`, such as `background`, `foreground`, `muted`, `muted-foreground`, `primary`, `secondary`, `accent`, `destructive`, `border`, `input`, `card`, and sidebar/chart tokens.
- If a needed semantic color is missing, propose the smallest new token first.
- Add light and dark theme values together when adding a token.
- Account for both light and dark themes in every new UI state.

## Accessibility

- Ensure foreground/background color pairs have sufficient WCAG contrast.
- Check muted text, badges, destructive states, focus states, disabled states, chart labels, and hover/selected states.
- Keep focus indicators visible in both light and dark themes.

## Layout

- Prefer semantic elements for meaningful structure and `div` for layout, containment, flex/grid, spacing, overflow, or styling when no semantic element fits.
- Avoid card-inside-card and wrapper-heavy layouts.
- Keep repeated styled concepts as named components in `apps/frontend/src/components`.

