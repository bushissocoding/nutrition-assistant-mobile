# Task List: App Completion V2

## Task 1: Build deterministic diary history helpers

- [x] Define local `YYYY-MM-DD` formatting and recent date generation without UTC drift.
- [x] Fetch date totals independently, preserving successful results and failed date keys.
- [x] Add focused unit tests for dates, timezone argument forwarding, partial failures, and malformed results.

## Task 2: Load the selected date on Home

- [x] Store selected date keys rather than day-of-month integers.
- [x] Reuse AppShell's current-day data; query another selected date through the API.
- [x] Distinguish empty success from load failure; add retry and stale-response protection.
- [x] Add focused UI tests.

## Task 3: Complete seven-day dashboard chart

- [x] Render each chart bar from the matching server-returned daily nutrient total.
- [x] Add loading, partial failure, retry, and empty-history states without changing today's metric cards.
- [x] Add focused UI tests.

## Task 4: Persist notification read flags

- [x] Add SecureStore helpers that only serialize known IDs and booleans.
- [x] Hydrate flags before first authenticated/demo shell render and persist subsequent updates.
- [x] Surface persistence errors while retaining in-memory interaction.
- [x] Add storage and UI tests.

## Task 5: Document integration readiness

- [x] Record missing providers, credentials, legal/data rights, clinical review, and security/release inputs.
- [x] Update architecture and README to describe seven-day API analytics and local notice state.
- [x] Verify the capability map and V2 spec reflect shipped behavior and remaining external blockers.

## Task 6: Acceptance and review

- [x] `npm run test:unit` — 116 passed.
- [x] `npm run test:ui` — 21 suites, 84 passed.
- [x] `npm run test:api` — passed.
- [x] `npm run catalog:validate` — passed.
- [x] `npx expo export --platform android` — passed.
- [x] Review `git diff --check`, branch ancestry, and changed files.
