# Supabase CI and RLS Verification Tasks

Spec: [`SPEC-delta-supabase-ci-rls-v1.md`](../spec/SPEC-delta-supabase-ci-rls-v1.md)

## Tasks

- [x] 1. Extend pgTAP checks to assert RLS is enabled for every private application table, anonymous roles cannot read private account tables, the lab-image bucket remains private with owner-path policies, and the two-account profile checks still pass.
  - Verify: `supabase test db`; local execution requires Supabase CLI and Docker.
- [x] 2. Add an isolated pull-request CI job that starts Supabase, resets the database from migrations, and runs `supabase test db`; keep the existing app jobs intact.
  - Verify: focused CI workflow contract test and `npm run test:unit`; hosted runtime proof requires a GitHub Actions run.
- [x] 3. Update the full-app plan, CI/release docs, and capability status to state exactly what the new CI gate covers and what remains external.
  - Verify: `git diff --check`; no production readiness claim is added.

## Checkpoint

- [x] All repository checks pass; commit is the next save point for this slice.
- [x] Hosted Supabase CI execution is recorded as pending until it runs; no external project credentials are required for the job.
