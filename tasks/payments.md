# Tasks: `payments`

Spec: `spec/SPEC-payments.md`.

- [x] 1. Add PayOS environment validation, canonical signing/verification, and injected REST adapter.
- [x] 2. Add private payment intent/event persistence, service-only atomic webhook RPCs, RLS, and account export/deletion registration.
- [x] 3. Add owner-scoped checkout/status routes and bounded public signed webhook route.
- [x] 4. Add authenticated mobile methods and appointment checkout/receipt/return-refresh states using the hosted URL.
- [x] 5. Add domain, route, repository, migration-contract, and UI tests for replay, mismatch, failure, expiry, ownership and success truth.
- [x] 6. Update architecture, environment docs, capability map and full-app plan; review security and provider contract.
- [x] 7. Run required checks, Android export, catalog validation and diff hygiene; report missing live merchant config.

Local checks passed: 253 unit tests, 88 UI tests, API smoke, Android export, food-catalog validation and `git diff --check`. Android export recovered from a stale Metro cache and completed successfully. Live Supabase RLS/webhook and merchant checkout remain unverified because this workspace has no configured Supabase or PayOS credentials and no local Supabase runtime.
