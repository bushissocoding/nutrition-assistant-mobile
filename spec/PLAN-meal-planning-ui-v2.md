# Plan: Meal Planning UI Refresh — V2

Self-reviewed and approved under the user's explicit authorization.

## Build order

1. Compare Home, Diary, theme tokens, and the current meal screen to establish the app's typography, color, spacing, and card patterns. Done before implementation.
2. Remove screenshot and crop rendering from meal schedule and recipe detail. Rebuild their hierarchy with native React Native components and existing tokens.
3. Localize visible planner/recipe labels and sample disclosure while preserving API-backed labels, provenance, disclaimers, and controls.
4. Update focused UI assertions for native schedule and recipe presentation; keep behavior coverage for generation, saved plans, source lookup, errors, and grocery handoff.
5. Run repository-required unit, UI, and API suites; review diff and app preview capability.
6. Commit feature changes on `codex/meal-plan-native-design`, merge into `codex/fix-bug`, and verify the final branch/status without including unrelated pre-existing edits.

## Scope boundaries

- `app/src/features/meal-planning/MealPlanScreen.js`, its focused test, and V2 spec/plan/task artifacts only.
- Use `colors`, `spacing`, and `radius` from the existing theme. No new packages, image assets, API changes, or planner behavior changes.
- The old V1 combined meal/diary UI work remains recorded in its own artifacts; this V2 follow-up applies only to meal planning.

## Risks and handling

- Replacing food photos with native glyph treatments may change image fidelity; prioritize the app's existing native card/icon patterns, readable content, and visual consistency.
- Long localized names and API warnings must wrap naturally and remain accessible on narrow screens.
- Keep the first-entry sample visibly illustrative and ensure generated or restored plans continue to use only API data.
