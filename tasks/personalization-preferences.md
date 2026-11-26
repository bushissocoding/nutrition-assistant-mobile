# Tasks: `personalization-preferences`

Spec: `spec/SPEC-personalization-preferences-v1.md`.

- [x] 1. Add owner-RLS preference row and strict authenticated save RPC.
  - Acceptance: only finite allowlisted choices persist; owner comes from Auth; hard limits are not included.
  - Verify: migration contract and repository tests.
- [x] 2. Add `/me/personalization` GET/PUT routes and client methods.
  - Acceptance: exact request shape, user-scoped data and clear retryable errors.
  - Verify: route, client and cross-owner checks.
- [x] 3. Load and save preferences in the personalization screen.
  - Acceptance: reload reflects saved state; failed saves preserve edits and offer retry.
  - Verify: focused UI tests.
- [x] 4. Apply saved hints to plan ranking and expose optional confirmed-target progress.
  - Acceptance: preferences remain soft hints; allergies/hard limits stay unconditional; target display requires confirmed patient values.
  - Verify: planner, dashboard and UI tests.
- [x] 5. Include preferences in export; update docs/capability map and review.
  - Acceptance: account export contains settings and account deletion cascades them.
  - Verify: required checks, Android export, catalog validation and diff hygiene.
