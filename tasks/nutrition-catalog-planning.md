# Nutrition Catalog and Planning — Focused Task Checklist

Spec: `spec/SPEC-nutrition-catalog-planning.md`. Preserve the current public `/api/v1` contract and keep prototype catalog values visibly separate from live FDC records.

## Ordering and acceptance

- [x] Specify data source, ownership, result boundaries, external gates and success criteria before implementation.
- [x] 1. Add `FDC_API_KEY` startup parsing and an FDC service adapter with timeout, response cap, safe error mapping and unit tests.
- [x] 2. Add sourced search/detail/calculate routes and UI source/version/missingness display; preserve current route outputs.
- [x] 3. Specify/implement account-owned `meal_plans` migration/RLS/repository with idempotency. Static ownership contracts are tested; live two-account RLS execution remains blocked by the missing local DB toolchain.
- [x] 4. Add authenticated plan API deriving profile/allergy/hard limits from DB and current consent; client may only submit preference inputs.
- [x] 5. Connect MealPlanScreen to sourced food search, saved-plan API and retry/error states.
- [ ] 6. Add user-scoped nutrition report after account-owned diary is ready; this task depends on `diary-grocery-analytics`.
- [x] 7. Run focused plus required suites and Android bundle; record unavailable local migration/RLS execution and external provider credentials.

## Verification notes

- Focused: `node --test server/tests/fdc-food-source.test.js server/tests/sourced-food-routes.test.js server/tests/sourced-meal-plans.test.js server/tests/meal-plan-routes.test.js server/tests/meal-plan-repository.test.js server/tests/core.test.js`.
- FDC provider tests use synthetic payloads, not live user data. Do not use DEMO_KEY in code or commits.
- Static migration checks are not RLS integration tests. Current environment has no Supabase CLI or Docker.
- Local RLS execution requires the Supabase CLI and Docker; static policy assertions are not represented as a live database integration pass.
- Real FDC smoke requests require an operator key and should not be attempted unless provided in the ignored environment.
- Local prototype records are never used as fallback when the provider is unavailable.
- Existing project meal templates remain clearly marked as unreviewed samples; the API requires an exact single FDC ingredient match and returns no saved result when a match, nutrient, allergy guarantee, or hard limit is unavailable.
