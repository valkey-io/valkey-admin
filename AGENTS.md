# AGENTS.md

Keep this file minimal because it is always loaded into agent context.

- Preserve user changes. Do not revert or overwrite unrelated dirty files unless explicitly asked.
- Keep changes scoped to the requested behavior.
- Read `CONTRIBUTING.md` only when repository architecture, contribution rules, or coding conventions are relevant to the task.
- Read the relevant `.agents/skills/*/SKILL.md` file only when working in that area.
- When a change affects APIs, environment variables, CLI flags, websocket actions, configuration, or any other DX/UX surface, check the docs and update them in the same change. Cover both top-level docs (e.g., `README.md`, `TROUBLESHOOTING.md`, `CONTRIBUTING.md`) and `docs-site/src/content/docs/**` (especially `configuration/`, `deployment/`, `features/`, `reference/`).
