# Spec: `diary-grocery-analytics` — Full App V1

Status: self-approved under the user's explicit delegation (2026-11-24). Parent: [Full App V1](SPEC-full-app-v1.md). Depends on `platform-security`, `identity-profile`, and `nutrition-catalog-planning`.

## Objective

Replace caller-controlled demo namespaces for meal diary, nutrition statistics and grocery data with authenticated, account-owned API workflows. The server resolves source food records, validates every mutation, stores nutrient/source snapshots and calculates every total. The mobile app shows clear empty, loading, unavailable and saved states.

## Functional requirements

1. A signed-in user can search USDA FoodData Central, choose a food, enter a 1–5000 g portion, meal type, local date/time, IANA time zone and optional bounded note, then create a diary entry. The server loads the current FDC detail and ignores/rejects client food names, nutrient values, user IDs and source metadata.
2. Create requests require `Idempotency-Key`. Same key + same normalized intent returns the original entry; changed intent returns 409; retry uses the saved snapshot without requiring another provider request. Entry edits resolve source food and recalculate nutrient values on the server. Delete is a soft delete retaining the idempotency tombstone; account deletion cascades all owned data.
3. `GET /api/v1/me/meal-entries?date=&timeZone=&limit=&offset=` uses server-derived local-midnight boundaries and returns ordered owner rows, authoritative pagination, and daily totals. Response includes `hasEntries`; no entries have `totals: null`, while a missing nutrient on any included source record makes that nutrient total `null`. Stored per-entry nutrient values are snapshots from the source record at create/update time.
4. `GET /api/v1/me/nutrition-report?date=&timeZone=&days=` returns bounded local-day history and daily totals using only owned entries. It distinguishes days with no entries from unknown nutrient totals and includes source/catalog versions and the non-clinical disclaimer. It never fills unknown values with zero.
5. A user can create a current shopping list from an owned saved meal plan ID. The server loads that plan, combines duplicate source ingredient IDs and creates the list; it does not trust client-provided plan ingredients. The user can add a searched/source-resolved food, update amount/unit/purchased state, remove an item and replace the list. Only one current list per account exists; replacement and item mutation are owner-scoped.
6. Pantry inventory is account-owned and supports bounded create/list/update/delete. USDA items are resolved and stored with the current source record and display name. A user may also store a normalized, bounded free-text inventory label with source `USER-ENTERED`; it is clearly marked in the app and excluded from all nutrient, meal-plan and medical calculations. The server creates a stable private identity for that label and rejects caller-supplied source metadata or nutrient claims.
7. Every private route requires verified auth and current consent. All records use request-scoped user JWT/RLS plus explicit authenticated owner filters. Export includes owned diary, pantry, list and item data; deletion removes them by auth-user cascade. No real patient information is used in fixtures or development.
8. App screens show USDA record IDs, edition, units and missing nutrients; diary totals and reports come from the API. Grocery has no invented pricing, pantry data survives device/session reload and all mutations provide retry/error feedback.

## API and persistence

- Private routes: `POST /api/v1/me/meal-entries`, `GET /api/v1/me/meal-entries`, `GET/PATCH/DELETE /api/v1/me/meal-entries/:id`, `GET /api/v1/me/nutrition-report`, `GET/POST/DELETE /api/v1/me/grocery/shopping-list`, shopping-item create/update/delete under `/api/v1/me/grocery/shopping-list/items`, and pantry CRUD under `/api/v1/me/grocery/pantry`.
- `meal_entries`: UUID, auth user FK/cascade, FDC food ID/name, serving grams, meal/date/time-zone/note, nutrient JSON, food/source/catalog snapshot, idempotency key/hash, timestamps and soft-delete timestamp; owner RLS.
- `shopping_lists`: auth user FK/cascade, one current row per owner, optional saved plan FK, timestamps; owner RLS. `shopping_list_items` belongs to one list, has USDA source provenance, amount/unit/purchased and timestamps; RLS checks parent list owner. List generation is transactional from an owned feasible saved plan.
- `pantry_items`: auth user FK/cascade, source-backed food identity/name, quantity/unit and timestamps; owner RLS.
- All SQL uses bounded checks, indexes for owner/time/list access, least-privilege grants and database timestamps. There is no service-role use in request routes.
- The existing demo diary/grocery `/api/v1/meal-entries`, `/api/v1/shopping-lists` stays development-only for contract compatibility; no authenticated mobile screen calls those routes.

## Implementation structure

- Pure meal diary validation/date/report functions under `server/src/services` reuse existing IANA timezone range and deterministic nutrition helpers without demo storage.
- Supabase repositories under `server/src/repositories` do explicit owner-scoped CRUD and idempotency.
- Private routers under `server/src/routes`, mounted beneath the existing auth/current-consent middleware and `/api/v1/me` namespace.
- Shared API client gains authenticated methods; `DiaryScreen`, history dashboard and `GroceryScreen` use only those private methods.
- Account export includes records; user deletion relies on verified auth cascade after export/consent handling.

## Tests and success criteria

- Unit: amount/units/date/timezone/note/body validation, DST boundaries, unknown nutrient propagation, no-entry distinction, stable report rollups and deterministic ingredient combination.
- Repository/API: ownership filters, pagination, replay/conflict/concurrent create, soft-delete tombstones, current-list uniqueness/replacement, pantry validation, consent/auth failures, plan owner validation, exported data and migration policy contracts.
- UI: authenticated source search, account diary CRUD, empty/unknown/error/retry states, API-backed history/report and persistent pantry/shopping mutations. No demo namespace headers.
- Required repo gates: `npm run test:unit`, `npm run test:ui`, `npm run test:api`; Android export. Run local Supabase RLS integration only when Supabase CLI and Docker exist; static SQL assertions must be reported separately.
- This module is done when all new private routes are mounted and consumed by the app, migrations/repositories/tests/docs exist, old public API contract still passes, and required checks pass.

## Boundaries

- Use only synthetic data in development and automated tests. Keep non-clinical wording and source attribution.
- Do not store client-calculated nutrient totals; do not treat unknown as zero.
- No price estimates, clinical recommendations, custom food nutrition claims, caller-controlled namespace ownership, or demo-route use from signed-in screens. User-entered inventory labels are organizational only and never become foods in any nutrition calculation.
- The FDC key, Supabase project/keys and live database are operator configuration; provider smoke tests and true two-account RLS execution remain external verification gates.
