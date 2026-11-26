# Spec Delta: Authenticated Account API End-to-End V1

Status: approved by the agent under the user's explicit delegation to approve implementation decisions (2026-11-24).

## Objective

Exercise the mobile app's shared API client, Express routes, Supabase Auth, Postgres RLS, and account lifecycle together against the synthetic local Supabase stack. This closes the gap between isolated route/repository tests and a configured patient's persisted account workflow without requiring external credentials.

## Current Behavior

- The Supabase CI job starts the synthetic local stack, applies migrations, and runs pgTAP schema/RLS checks.
- App tests verify screens and app-shell decisions with mocked providers; API tests verify routes with injected repositories.
- No test currently obtains a real local Supabase Auth JWT, sends it through the same API client used by Expo, and persists data through the configured Express/Supabase stack.

## New Behavior

- A dedicated integration command reads local connection settings from `supabase status --output-format json` without printing keys.
- The test refuses any non-loopback Supabase URL, creates two temporary synthetic Auth users, obtains real password sign-in tokens, and starts the actual API server with isolated test settings.
- It uses `createApiClient` and `createApiMethods` from the mobile app to exercise consent, assessment/profile, local-timezone report, custom pantry, confirmed synthetic lab result, notification preferences, assistant-consent/unavailable-provider behavior, account export, cross-account isolation, and staged account deletion.
- It also confirms an unavailable external food source/assistant returns an error rather than fake success. All temporary users are deleted in a `finally` cleanup path; no image or real personal/health data is used.
- GitHub Actions runs this flow after local migrations and pgTAP pass. The flow needs no project secrets, external vendor credentials, or remote Supabase access.

## Success Criteria

- Only a running local Supabase API on `localhost`, `127.0.0.1`, or IPv6 loopback can be targeted.
- The real local auth JWT reaches Express verification and account-owned profile/data survive API process restart.
- A second account cannot read the first account's profile, pantry entry, or health record; export contains only the current account's data.
- Account deletion removes the first account while the second account remains functional.
- A pending food catalog and missing OpenAI configuration produce the expected unavailable responses and no fabricated success.
- The integration command runs in the Supabase CI job after `supabase start`, `supabase db reset`, and `supabase test db`; standard unit/UI/API jobs remain intact.

## Boundaries

- Always create short-lived `example.test` accounts and synthetic records in the local Supabase stack only.
- Always disable demo storage and external data providers, PayOS, OpenAI, and push integrations in the spawned API process.
- Never print access tokens, local secret keys, emails, record values, or child-process environments.
- Never run destructive account lifecycle calls against a non-loopback Supabase URL.
- This API integration complements UI component tests; it does not claim physical-device, camera/OCR, payment-sandbox, push-delivery, or hosted-production verification.

## Plan and Verification

See [`tasks/authenticated-api-e2e.md`](../tasks/authenticated-api-e2e.md) and Phase 8 in [`plan-full-app.md`](../tasks/plan-full-app.md). The runner binds its child API to `127.0.0.1`, suppresses child output, and prints only a stage name on failure. Verify script syntax and workflow contract locally; run the actual command only after `supabase start` and migrations are available. The first hosted result is pending until GitHub Actions runs the changed workflow.
