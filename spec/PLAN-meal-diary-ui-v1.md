# Plan: Meal and Diary UI Refresh — V1

Self-reviewed and approved under the user's explicit authorization.

## Build order

1. Confirm current screen/API behavior, reference assets, and repository constraints. Done before implementation.
2. Refresh the meal result and recipe detail presentation, preserving its existing state and actions.
3. Refresh diary history and sourced-food/portion presentation, preserving its existing date, CRUD, source, and idempotency behavior; confirm multiple selected foods sequentially through existing create intents.
4. Update focused UI tests for new visual structure and preserved actions.
5. Run all required suites; inspect a local preview if supported; review the diff and ensure no secrets/artifacts are included.
6. Commit the feature branch and merge it into `codex/fix-bug`; verify the final branch and status.

## Scope boundaries

- UI feature files and their focused tests, plus the spec/map/plan/todo artifacts in `spec/`.
- No server, API contract, dependency, authentication, or design-reference changes. Planner entry/exit wiring may be adjusted to present the two reference screens as a focused flow.
- Reuse existing theme tokens and current sourced API data. Use the supplied screenshot's food-photo regions through a shared clipping component; do not add edited image files or unrelated generated output.

## Risks and handling

- Long screens must keep fixed app navigation usable; reserve bottom content padding and respect safe areas already supplied by the shell.
- Long Vietnamese labels and real recipe names must wrap without clipping; use layout constraints rather than screenshot-specific fixed text widths.
- For multiple items, create each API entry separately with its own stable retry key and show partial progress if a later item fails.
- Restore the latest saved plan on entry. If none exists, show the values from the design reference only as a clearly disclosed UI sample; never send or save it as a personal/API plan. Continue to omit unavailable values from real plans.
- Existing tests query visible copy; update assertions only when labels are intentionally changed, and preserve accessibility labels and assertions for API behavior.
