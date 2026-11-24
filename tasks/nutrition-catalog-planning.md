# Nutrition Catalog and Planning — Focused Task Checklist

Spec: `spec/SPEC-nutrition-catalog-planning.md`. Preserve the current public `/api/v1` contract and keep prototype catalog values visibly separate from live FDC records.

## Ordering and acceptance

- [x] Specify data source, ownership, result boundaries, external gates and success criteria before implementation.
- [ ] 1. Add `FDC_API_KEY` startup parsing and an FDC service adapter with timeout, response cap, safe error mapping and unit tests.
- [ ] 2. Add sourced search/detail/calculate routes and UI source/version/missingness display; preserve current route outputs.
- [ ] 3. Specify/implement account-owned `meal_plans` migration/RLS/repository with idempotency and two-account tests.
- [ ] 4. Add authenticated plan API deriving profile/allergy/hard limits from DB and current consent; client may only submit preference inputs.
- [ ] 5. Connect MealPlanScreen to sourced food search, saved-plan API and retry/error states.
- [ ] 6. Add user-scoped nutrition report after account-owned diary is ready; this task depends on `diary-grocery-analytics`.
- [ ] 7. Run focused plus required suites, Android bundle, migration tests where possible; update docs and commit.

## Verification notes

- FDC provider tests use synthetic payloads, not live user data. Do not use DEMO_KEY in code or commits.
- Static migration checks are not RLS integration tests. Current environment has no Supabase CLI or Docker.
- Real FDC smoke requests require an operator key and should not be attempted unless provided in the ignored environment.
- Local prototype records are never used as fallback when the provider is unavailable.
