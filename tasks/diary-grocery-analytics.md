# Diary, Nutrition Report, Pantry and Grocery — Focused Tasks

Spec: [`SPEC-diary-grocery-analytics.md`](../spec/SPEC-diary-grocery-analytics.md). Keep legacy demo contracts unchanged and keep mobile private workflows on authenticated `/api/v1/me/*` routes.

## Ordered delivery

- [x] Specify routes, ownership, source snapshots, timezone semantics, empty/unknown totals and export/deletion behavior before implementation.
- [x] 1. Add account-owned meal-entry and idempotency schema with RLS, indexes/checks, migration policy assertions and export integration.
- [x] 2. Add sourced create/list/detail/update/soft-delete repositories/routes; calculate snapshots on server and replay before FDC access.
- [x] 3. Add account-owned daily nutrition report/history aggregation with supplied IANA timezone and explicit empty/missing nutrient semantics.
- [x] 4. Add owner-scoped current shopping list/items and pantry schema/repository/routes; derive plan ingredients only from owned plan snapshots.
- [x] 5. Add private API client methods; connect diary, history/report, grocery and plan-to-grocery UI with robust loading/error/retry states.
- [x] 6. Verify export/deletion includes all newly owned records, required suites, catalog contracts and Android export; update docs and commit.

## Verification notes

- Synthetic owner A/B only; never use live health records or log tokens/provider keys.
- Supabase CLI and Docker are not installed in this workspace; static RLS policy tests are not live two-account integration.
- No USDA key is present in this environment; provider behavior uses injected synthetic fixtures and no live request is made.
- Required checks from `CONSTRAINTS.md`: `npm run test:unit`, `npm run test:ui`, `npm run test:api`.
