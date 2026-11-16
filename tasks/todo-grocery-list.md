# Tasks: Persistent Grocery List — V1

Source spec: [SPEC-grocery-list.md](../SPEC-grocery-list.md)
Implementation plan: [plan-grocery-list.md](plan-grocery-list.md)

Status: implementation complete; Android device/emulator verification pending

## Task 1: Define grocery list domain validation

**Description:** Add a pure service that normalizes list-create and item-patch payloads, resolves catalog names, and creates server-owned item/list fields.

**Acceptance criteria:**
- [x] Accept only 1–100 unique catalog food IDs on create; planner-to-wire `grams` mapping is covered in Task 5.
- [x] Validate amount and supported unit, reject missing/unknown fields and client-supplied name, ID, purchased state, or timestamps.
- [x] Create/patch helpers return deterministic validated data and never accept nutrient values.

**Verification:** Focused Node tests for valid normalization, missing/invalid/unknown fields, duplicate IDs, limits, unsupported food, and patch validation; `npm run test:unit`.

**Dependencies:** None.

**Files likely touched:**
- `server/src/services/shopping-lists.js`
- `server/tests/shopping-list-domain.test.js`

**Estimated scope:** Small.

## Task 2: Persist current list and idempotency safely

**Description:** Add a repository using `shopping_lists` with one current list plus lightweight idempotency ledger rows, atomic update operations, and namespace-scoped purge.

**Acceptance criteria:**
- [x] Create/replace and idempotency ledger are written in one `updateCollection`; same key/body replays without duplicates, changed body conflicts, stale replaced/deleted key returns 410.
- [x] Get, patch purchased/amount/unit, delete item, delete current list, and namespace purge persist after opening a new store instance.
- [x] Operations in a different namespace cannot read or mutate this namespace; injected storage failure does not return success.

**Verification:** Focused repository tests using a temporary demo store, including repeated/concurrent create and reopening; `npm run test:unit`.

**Dependencies:** Task 1.

**Files likely touched:**
- `server/src/repositories/shopping-list-repository.js`
- `server/tests/shopping-list-repository.test.js`

**Estimated scope:** Small.

## Checkpoint: Domain and repository

- [x] Tasks 1–2 focused tests and `npm run test:unit` pass.
- [x] Tests leave no runtime demo store in the repository.

## Task 3: Expose scoped shopping-list API

**Description:** Add the shopping-list router and mount it under `/api/v1`, mapping service/repository failures into the documented finite error contract.

**Acceptance criteria:**
- [x] GET current, POST create/replace, PATCH and DELETE item, DELETE current, and DELETE namespace collection match the approved `/api/v1/shopping-lists` contract.
- [x] All routes require demo scope; malformed requests return 400, cross-namespace/unknown IDs return 404, idempotency returns 200/201/409/410 as specified, and store errors are finite 503 responses.
- [x] CORS and existing planner/diary/catalog responses remain compatible.

**Verification:** HTTP tests for all routes, disabled/production mode, namespace separation, validation, retry/conflict/stale retry, and store failures; `npm run test:api` and `npm run test:unit`.

**Dependencies:** Tasks 1–2.

**Files likely touched:**
- `server/src/routes/shopping-lists.js`
- `server/src/routes/api.js`
- `server/server.test.js`
- `server/tests/shopping-list-route-scope.test.js`

**Estimated scope:** Medium.

## Task 4: Add shared mobile API methods

**Description:** Expose shopping list operations through the configured shared API request client and forward the create idempotency key.

**Acceptance criteria:**
- [x] Add get/create/patch/delete item/delete current/purge namespace methods using `/api/v1` and the shared request transport.
- [x] Encode item IDs and send stable JSON bodies and `Idempotency-Key` on create.
- [x] No screen-level fetch is introduced.

**Verification:** API client unit tests assert paths, methods, encoding, payloads, and header; `npm run test:unit`.

**Dependencies:** Task 3.

**Files likely touched:**
- `app/src/services/api-client.cjs`
- `app/src/services/api-client.test.cjs`

**Estimated scope:** Small.

## Task 5: Load and edit the persisted list from the app

**Description:** Replace `GroceryScreen` demo fallback with API hydration and server-confirmed edits; let the planner open a saved list or create a new list from its current backend response.

**Acceptance criteria:**
- [x] Screen has finite loading, no-list/empty-list states, error/retry, purchased toggle, amount/unit edit, and confirmed item delete.
- [x] Each change appears only after API success; failure retains displayed data and offers retry.
- [x] Planner can open saved data after restart; creating from a plan confirms replacement when a list exists and retries with the same key/body.

**Verification:** RNTL tests for loading, no list, loaded rows, retry, toggle/edit/delete success and failure, plan create, and replace confirmation; run `npm run test:ui` and Expo Android export.

**Dependencies:** Task 4.

**Files likely touched:**
- `app/src/features/grocery/GroceryScreen.js`
- `app/src/features/grocery/GroceryScreen.test.js`
- `app/src/features/meal-planning/MealPlanScreen.js`
- `app/src/app/AppShell.js`

**Estimated scope:** Medium.

## Checkpoint: Mobile flow

- [x] Grocery screen reads saved state from API and never displays sample fallback rows.
- [x] `npm run test:ui` and Android export pass.
- [x] Retry and replacement flows do not claim an unconfirmed save.

## Task 6: Include grocery purge in profile/consent deletion

**Description:** Require successful remote diary and grocery namespace purges before clearing local profile/consent, keeping local state intact if either request fails.

**Acceptance criteria:**
- [x] Both remote purges finish successfully before the local clear callback runs.
- [x] Failure of either purge leaves local state intact and produces a retryable error.
- [x] Repeating the purge after a partial remote success is safe.

**Verification:** Extend app-flow helper tests for order, first/second purge failures, retry, and successful local clear after both responses; `npm run test:unit` and relevant UI suite.

**Dependencies:** Task 4.

**Files likely touched:**
- `app/src/app/AppShell.js`
- `app/src/app/purge-before-local-delete.cjs`
- `app/src/app/purge-before-local-delete.test.cjs`
- `app/src/app/AppShell.test.js`

**Estimated scope:** Medium.

## Task 7: Update product/API documentation

**Description:** Document list schema/endpoints, persistence and purge semantics, demo-only namespace limits, and the fact that edits do not recalculate the meal plan.

**Acceptance criteria:**
- [x] Server API docs match all route/input/idempotency/error semantics.
- [x] Architecture, root setup README, and `CONSTRAINTS.md` describe data boundary and MVP limitation without implying auth or production persistence.
- [x] No barcode behavior or real-user data use is documented as shipped.

**Verification:** Cross-check docs against routes/service and `git diff --check`.

**Dependencies:** Tasks 3–6.

**Files likely touched:**
- `server/README.md`
- `docs/architecture.md`
- `README.md`
- `CONSTRAINTS.md`

**Estimated scope:** Medium.

## Task 8: Run final checks and review scope

**Description:** Run the repository quality floor and build, inspect the diff and record environmental verification limits.

**Acceptance criteria:**
- [x] Unit, API, and UI suites pass; Android export and `git diff --check` pass.
- [x] No secrets, real user data, generated build files, or default local demo store are tracked.
- [x] Any unavailable real-device/emulator connectivity check is explicitly reported as pending.

**Verification:** `npm run test:unit`; `npm run test:api`; `npm run test:ui`; `npx expo export --platform android`; `git diff --check`; inspect `git status --short`.

**Dependencies:** Tasks 1–7.

**Files likely touched:** None expected beyond corrections required by verification.

**Estimated scope:** Small.

## Verification note

`npm run test:unit`, `npm run test:api`, `npm run test:ui`, `npx expo export --platform android`, and `git diff --check` passed. `adb`, `emulator`, `ANDROID_HOME`, and `ANDROID_SDK_ROOT` are unavailable, so Android device/emulator URL connectivity remains pending; bundle export is not device verification.
