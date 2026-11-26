# Spec: `platform-security` — Full App Foundation

Status: implementation complete in repository; live database/RLS execution remains blocked by missing local Supabase CLI/Docker and project credentials. Parent objective and shared checks are in [SPEC-full-app-v1.md](SPEC-full-app-v1.md); module boundaries are in [the capability map](capability-map-full-app.md).

## Objective

Provide the shared, testable identity and data-security seam required by all private features: validated production configuration, Supabase client composition, verified user identity, user-scoped database access, Postgres migrations/RLS conventions, safe HTTP defaults, and deterministic error handling. Use current Supabase publishable/secret API keys (not deprecated `anon`/`service_role` names). No private route may depend on `X-Demo-Namespace` or a client-selected owner.

## Commands

- Focused API/unit: `npm run test:unit` and `npm run test:api`.
- Full required suite: `npm run test:unit`, `npm run test:ui`, `npm run test:api`.
- Database when available: `npx supabase start` then `npx supabase db reset`.
- Bundle/hygiene: `npx expo export --platform android` and `git diff --check`.

## Project Structure

- `server/src/config/`: strict required/optional setting parsing and production validation.
- `server/src/middleware/`: bearer authentication, principal attachment, rate-limit and security controls.
- `server/src/services/supabase/`: user-scoped and privileged clients kept distinct; production variables are `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY`.
- `supabase/migrations/`: schema/RLS for this module and follow-on feature modules.
- `supabase/config.toml`: reproducible local project configuration for Supabase CLI migration commands.
- `supabase/tests/`: pgTAP owner-isolation tests runnable against the local stack.
- `server/tests/`: config, auth middleware, error handling and cross-owner contract tests.
- `.env.example`, `server/.env.example`, `docs/security-and-operations.md`: safe names/configuration and truthful operational guide only; never copy local values.

## Code Style

Config parsing returns a validated config or a safe startup error. Route handlers receive a verified principal and a user-scoped data adapter:

```js
const principal = requireUser(request);
const records = createOwnedRecordRepository({ db: request.userDatabase });
return records.list({ ownerId: principal.id });
```

The repository must reject any owner ID that differs from the verified principal. Privileged clients have a separate constructor and are unavailable to ordinary request routes.

## Testing Strategy

- Unit-test missing/invalid production variables, wildcard CORS rejection outside development, token parsing/expiry/provider verification errors, and safe log shape.
- API-test `401` for absent/invalid/expired tokens, no trust in owner IDs or demo headers, CORS/preflight behavior, rate-limit responses, request-size/content-type limits, and no secret/payload leakage in captured logs.
- Test repositories against a disposable Supabase database where available; exercise RLS directly for owner isolation and role checks with `supabase test db`. Without Docker/Supabase CLI or a configured project, retain deterministic adapter tests but report live RLS verification as unavailable.
- Test existing public `/api/v1/foods`, nutrition calculation, planner and `GET /health` behavior for compatibility.

## Boundaries

- **Always:** read and validate environment once at startup; use an explicit CORS allowlist; add standard security headers and bounded request/rate limits; verify bearer identity; pass user JWT into user-scoped Postgres requests; make RLS the second enforcement layer; isolate privileged operations; use HTTPS in deployed configuration; return safe errors; log metadata only.
- **Ask first / external owner required:** create a Supabase project, enable production accounts, configure custom email/SMS, expose a public host, accept real health data, or change retention/backup/security policy.
- **Never:** log tokens/health/message/payment/request bodies; use a service-role client for ordinary user routes; accept client-selected owner identity; enable legacy demo collections as production storage; claim backups, encryption, recovery or compliance without a configured/verified implementation.

## Success Criteria

- Production startup fails closed if Supabase issuer/URL/public key/server key or required origin/security settings are missing or invalid.
- Auth middleware obtains a provider-verified user and installs a request-scoped client that carries the user's token to Postgres/RLS.
- RLS policies prevent cross-account access even if an API query omits an owner filter; API repositories still scope queries to the principal.
- Demo diary/grocery APIs remain disabled outside explicit local development and cannot be used as account identity.
- Supabase CLI has checked-in project configuration and can discover the ordered migrations for local reset/deployment; no remote project reference or credentials are committed.
- A two-account pgTAP RLS test is checked in and documented; its local execution result remains external until a Supabase CLI/container runtime is available.
- HTTP defaults reject invalid/oversized input and unsafe production CORS; errors/logs expose neither credentials nor personal content.
- New security behaviors have focused tests, and all existing required suites pass.

## Out of Scope (Deferred)

- Feature tables/policies beyond shared ownership primitives are specified with their module; this module establishes migration conventions and verified request context.
- Deployment-specific infrastructure-as-code, secrets rotation service, WAF, SOC monitoring and formal compliance evidence require a selected operator and separate release-operations work.

## Open Questions

- The local development setup has no Supabase CLI or Docker runtime, so database/RLS behavior must be validated against a configured CI/local stack when one is provided. Code and static SQL can be built now; no production database is available in this repository session.
