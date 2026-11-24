# Spec: Release Operations V1

Status: implementation in repository complete; production operations remain blocked on named external owners and credentials.

## Goal

Make a deployment operator able to configure, release, observe, recover, and support the authenticated app without relying on undocumented local knowledge. The repository must provide safe defaults, repeatable release steps, privacy-safe telemetry, and explicit gates. Code or documentation alone must never be represented as live vendor verification, legal approval, clinical approval, or a successful restore.

## Scope

- Document separate development, staging, and production environments, required secrets, migration ordering, and deploy/rollback steps.
- Keep database schema migrations forward-only in normal releases; document when an additive rollback is safe and when a corrective forward migration is required.
- Document account export/deletion, private object lifecycle, retention, backup and restore responsibilities, and incident response without promising unconfigured guarantees.
- Emit bounded, structured HTTP request telemetry with a generated correlation ID and no raw URLs, request bodies, auth headers, health values, or account identifiers.
- Document push-worker, PayOS webhook, OpenAI, FDC, Supabase Storage, Expo and native-device operational checks and their external prerequisites.
- Define a staged release checklist, monitoring questions, rollback triggers, smoke checks, support contact ownership, and unresolved release gates.

## Non-goals

- Provision cloud resources, apply migrations to an external project, create vendor accounts, rotate credentials, publish mobile binaries, deploy services, or claim regulatory/clinical compliance.
- Add a vendor-specific telemetry/alerting SDK or promise SLOs before an operator selects a host and monitoring service.
- Accept real patient data before qualified privacy, security, data-rights and clinical review plus operational recovery checks.

## Decisions

1. The deployment operator supplies secrets through the hosting platform's secret store; `.env.example` files contain names and safe local defaults only. `EXPO_PUBLIC_*` values are public client configuration.
2. Production API and the push worker are separate processes with separate health and restart checks. The API `/health` response is liveness only; it does not verify Supabase or provider availability.
3. Logs use JSON events, a generated request ID, bounded route templates, HTTP method/status and elapsed milliseconds. Do not accept caller-selected request IDs or log raw paths, user IDs, email, request/response bodies, tokens, or provider payloads.
4. Migration changes are applied before application rollout. Prefer additive schema changes; use a forward repair when data has been written under a new schema. Roll back application code only when it remains compatible with the applied schema.
5. External backup, restore, monitoring, support, incident notification, provider sandbox and native-device checks remain explicit release gates until an operator records evidence and ownership.

## Acceptance criteria

- [x] Required configuration and secret ownership are documented by environment.
- [x] Release, migration, rollback, health-check and restore runbooks identify ordered actions and stop conditions.
- [x] Account export/deletion and private-record object cleanup are represented accurately, with live RLS and retention gaps called out.
- [x] API telemetry can correlate a request without logging raw identifiers or payloads; tests inspect emitted JSON.
- [x] Worker and vendor outages have actionable checks and do not produce false payment, push, AI, or OCR success.
- [x] Production checklist requires evidence, owner and date for each external gate; code implementation is not accepted as proof of provider or legal readiness.
- [x] Required repository checks pass; local Supabase/RLS and provider/device checks unavailable in this environment are documented with their blockers.

## Verification

- `npm run test:unit`
- `npm run test:ui`
- `npm run test:api`
- `npx expo export --platform android`
- `npm run catalog:validate`
- `npm run catalog:fixture`
- `git diff --check`
- CI Supabase migration/pgTAP job; local execution also uses `supabase start`, `supabase db reset`, and `supabase test db` when Docker and the Supabase CLI are available.
- Physical-device/provider sandbox checks when the required tools, credentials and accounts are available.

## Related documents

- [Full-app scope](SPEC-full-app-v1.md)
- [Capability map](capability-map-full-app.md)
- [Implementation plan](../tasks/plan-full-app.md)
- [Security and operations baseline](../docs/security-and-operations.md)
