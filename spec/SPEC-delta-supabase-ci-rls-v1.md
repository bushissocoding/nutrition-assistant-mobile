# Spec Delta: Supabase CI and RLS Verification V1

Status: approved by the agent under the user's explicit delegation to approve implementation decisions (2026-11-24).

## Objective

Run the repository's real Supabase migrations and pgTAP owner-isolation checks automatically in CI so database syntax, private-table RLS configuration, private Storage policies, and the existing two-account profile isolation test are exercised against a local Supabase stack on every pull request.

## Current Behavior

- `.github/workflows/ci.yml` runs Node unit/UI/API checks and exports the Android app bundle, but never starts Postgres or applies the Supabase migrations.
- `supabase/tests/account_owner_isolation.test.sql` tests cross-account profile isolation, but it has only been checked statically because the local environment does not have Supabase CLI or Docker.
- Local instructions already describe `supabase start`, `supabase db reset`, and `supabase test db` for synthetic development.

## New Behavior

- A separate CI job uses the official Supabase CLI setup action, starts the repository's configured local stack, resets the database from checked-in migrations, and runs the pgTAP suite without provider credentials or production secrets.
- The pgTAP contract asserts that every private application table has RLS enabled, anonymous users have no read access to private account tables, the health-record Storage bucket remains private with owner-path policies, and two synthetic accounts cannot access each other's profiles.
- CI uses synthetic records only. Hosted execution is the proof of runtime migration/RLS behavior; a local static check does not count as that proof.

## Success Criteria

- The workflow starts a local Supabase stack and fails when migration application or `supabase test db` fails.
- Database tests cover the full private-table RLS-enabled inventory, anonymous read restrictions, the private health-record bucket/policy set, and two-account profile isolation.
- The job requires no Supabase project, credentials, paid provider, or real user data.
- Unit/UI/API and Android bundle jobs remain unchanged and continue to run.
- Local verification reports the specific CLI/Docker blocker; no hosted CI result is claimed before the workflow is run.

## Boundaries

- Always use Supabase's local synthetic stack and checked-in migrations for CI database tests.
- Never add production credentials, real user records, or a remote Supabase project to CI.
- Do not claim a hosted CI run passed until GitHub Actions has actually executed it.
- Keep current API/mobile behavior unchanged in this delta.

## Plan and Verification

See [`tasks/supabase-ci-integration.md`](../tasks/supabase-ci-integration.md) and the Phase 7 entry in [`plan-full-app.md`](../tasks/plan-full-app.md). Verify the workflow contract with `npm run test:unit`, validate the workflow syntax where tooling is available, and run `supabase start`, `supabase db reset`, and `supabase test db` when Docker and the Supabase CLI are available.
