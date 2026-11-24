# Authenticated API End-to-End Tasks

Spec: [`SPEC-delta-authenticated-api-e2e-v1.md`](../spec/SPEC-delta-authenticated-api-e2e-v1.md)

## Tasks

- [x] 1. Add a local-only harness that reads the running Supabase CLI status without printing credentials, rejects non-loopback URLs, starts/stops the real API on loopback, and cleans up synthetic users.
  - Verify: `node --check server/integration/account-flow.js`; focused tests cover loopback refusal and IP-only API binding.
- [x] 2. Drive the same mobile API client through real sign-in tokens, consent/profile, account-owned reads/writes, persistence after API restart, exports, cross-account isolation, unavailable provider behavior, and account deletion.
  - Verify: runtime command is wired for CI; local runtime execution is unavailable because Docker and the Supabase CLI are absent.
- [x] 3. Wire the integration command into the Supabase CI job after pgTAP; document the local command and its external prerequisites.
  - Verify: CI contract tests, YAML parse, repository checks, and sanitized runner output pass.

## Checkpoint

- [ ] The exact-code hosted job must pass before claiming runtime API/database integration verified.
- [x] Local execution is reported as unavailable when Docker or Supabase CLI is absent.
