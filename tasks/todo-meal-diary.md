# Tasks: Persistent Meal Diary — V1

Source spec: [SPEC-meal-diary.md](../SPEC-meal-diary.md)
Implementation plan: [plan-meal-diary.md](plan-meal-diary.md)

Status: implementation complete; Android device/emulator verification pending

## 1. Test harness and domain/date model

- [x] Inspect existing scripts, CI workflow, Expo SDK and test conventions; choose compatible Jest, `jest-expo` and React Native Testing Library versions without adding runtime dependencies.
- [x] Add Jest Expo configuration, `test:ui` script, native module mocks, and a minimal component smoke test.
- [x] Add the UI suite to CI and document the required test commands in `CONSTRAINTS.md`.
- [x] Add failing unit tests for create/patch normalization, required and unknown fields, limits, and invalid food references.
- [x] Add failing date tests for IANA validation, local-midnight UTC boundaries, midnight edges, and 23/25-hour DST days.
- [x] Add failing unit tests for stable sorting, pagination, and backend nutrient mapping/rounding.
- [x] Implement the pure meal-entry domain/date service and make the focused tests pass.
- [x] Run `npm run test:unit`, `npm run test:ui`, and an Expo bundle checkpoint; confirm no runtime dependency was added.

## 2. Persistent repository and idempotency

- [x] Add repository tests using an isolated temporary demo store for create/read/update/delete/purge and persistence after reopening.
- [x] Add idempotency tests for same-key/same-payload replay, same-key/different-payload conflict, concurrent duplicate requests, and retry after deletion.
- [x] Assert rows are isolated by demo namespace and the ledger stores no request body or notes.
- [x] Implement `meal-entry-repository.js` using one atomic `updateCollection` for entry and ledger writes.
- [x] Run focused repository tests and `npm run test:unit`; confirm tests leave no default runtime JSON store behind.

## 3. API contract and routes

- [x] Add HTTP tests for create, list by date/timezone, get by id, patch, delete by id, and namespace purge.
- [x] Cover missing/invalid fields, unknown fields, invalid date/timezone/pagination, missing idempotency key, 404 namespace isolation, 409 conflict, 410 retry-after-delete, disabled demo mode, and store failure.
- [x] Assert create and update nutrients come from the server catalog and list totals cover all matching entries before pagination.
- [x] Test CORS preflight permits `Idempotency-Key` and `X-Demo-Namespace`.
- [x] Implement the meal-entry feature router, validate requests at the boundary, and mount it under `/api/v1` without changing existing route responses.
- [x] Run focused API tests, `npm run test:unit`, and `npm run test:api`; verify diary endpoints stay unavailable in production/demo-disabled mode.

## 4. Mobile API methods and diary UI

- [x] Add API client method tests for create/list/get/update/delete/purge, encoded date/timezone queries, and idempotency header forwarding.
- [x] Extend the shared API methods using the existing request/config/namespace path; add no screen-level `fetch()` calls.
- [x] Refactor `DiaryScreen` to load the selected local date and support previous/next date navigation, food search, portion, meal type, time, and notes.
- [x] Add create/edit/delete UI flows; only update visible records after server success, confirm before delete, and reuse the same idempotency key for retrying the same create intent.
- [x] Render backend nutrients/totals and the demo catalog estimate disclaimer; keep nutrition out of client request payloads.
- [x] Add component tests for loading, empty, error/retry, create/edit/delete success, mutation failure preserving form/list, and idempotency retry behavior.
- [x] Ignore stale list responses after the selected date changes; verify API timeout errors become retryable UI errors.
- [x] Run `npm run test:ui`, `npm run test:unit`, `npm run test:api`, and the Expo Android bundle; confirm no direct `fetch()` remains in feature screens.

## 5. App hydration, consent purge, and documentation

- [x] Hydrate the current day's diary for Home/Dashboard from the API on app start and after returning to the app; prevent a late response for an old date replacing the current cache.
- [x] Add app-flow tests proving saved server entries reappear after hydration and successful current-day mutations refresh the summary.
- [x] Route profile deletion and consent withdrawal through server purge before local profile/consent deletion.
- [x] Add tests proving purge failure retains local profile/consent and offers retry, while purge success completes deletion only after the server confirms it.
- [x] Update API documentation, architecture notes, setup README, and `CONSTRAINTS.md` with the endpoint/schema, timezone/DST rule, idempotency behavior, demo-only namespace boundary, purge flow, and estimate disclaimer.
- [x] Review the diff for health-data boundaries, accidental secrets or real user data, generated artifacts, and out-of-scope grocery/barcode changes.
- [x] Run required final checks: `npm run test:unit`, `npm run test:api`, `npm run test:ui`, Expo Android bundle, and `git diff --check`.
- [x] Record any device/emulator verification that cannot run in this environment and keep it explicitly pending; bundle success is not device verification.

## Completion criteria

- [x] Meal diary CRUD and date/timezone filtering persist through the API, with server-calculated nutrients and retry-safe create semantics.
- [x] App startup hydrates saved data; UI exposes finite loading, empty, error, retry, and mutation states.
- [x] Consent/profile deletion purges the server namespace before reporting success or removing local consent/profile state.
- [x] Demo data remains synthetic, demo-only, disabled in production, and clearly distinct from authenticated account ownership.
- [x] Required automated checks pass, documentation matches the implementation, and any unavailable device verification is reported.

## Verification note

`adb`, `emulator`, `ANDROID_HOME`, and `ANDROID_SDK_ROOT` are unavailable in this environment. The Android bundle and host API smoke test pass, but Android emulator/physical-device URL verification remains pending.
