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
- No server, API contract, dependency, authentication, navigation, or design-reference changes.
- Reuse existing theme tokens and current sourced API data. Add a source image only if it can be reused from the provided reference assets without adding unrelated generated output.

## Risks and handling

- Long screens must keep fixed app navigation usable; reserve bottom content padding and respect safe areas already supplied by the shell.
- Long Vietnamese labels and real recipe names must wrap without clipping; use layout constraints rather than screenshot-specific fixed text widths.
- For multiple items, create each API entry separately with its own stable retry key and show partial progress if a later item fails.
- Keep the image examples subordinate to source-backed content; omit or neutralize any unavailable data instead of filling it with mock values.
- Existing tests query visible copy; update assertions only when labels are intentionally changed, and preserve accessibility labels and assertions for API behavior.
