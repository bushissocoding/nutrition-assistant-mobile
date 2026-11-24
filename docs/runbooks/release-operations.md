# Runbook: Release and Recovery

## Ownership record

Before using this runbook in a live environment, record the release owner, database operator, security/privacy contact, support contact and after-hours escalation. Record the project/environment, release commit, migration version, approval evidence, and timestamp in the operator's change log. Do not put secret values or patient data in that record.

## Release sequence

1. Confirm every applicable external gate in [`../security-and-operations.md`](../security-and-operations.md) has an owner and evidence. Keep real-data access disabled if any privacy, security, clinical, source-rights, RLS, restore, support or provider gate is open.
2. Build and verify the exact commit locally or in CI: `npm ci`, all required unit/UI/API/catalog checks, Android bundle export, and the Supabase migration/pgTAP/authenticated-API CI job. Run native-device checks in the target release environment. A configured job is not evidence until the exact commit's hosted result passes.
3. Provision environment-specific secrets in the host's secret store. Never copy `.env` files into an image or mobile bundle. Review that `EXPO_PUBLIC_*` contains no secret and that production configuration uses HTTPS, exact CORS origin, Supabase current key formats and `DEMO_DATA_ENABLED=false`.
4. In staging, apply reviewed database migrations before deploying code: inspect `supabase migration list --linked`, then `supabase db push --linked` using the operator's linked staging project. The repository's `supabase/config.toml` is for local CLI settings and contains no remote project reference. Capture command output/version as change evidence. CI and local verification run `supabase start`, `supabase db reset`, then `supabase test db` against a synthetic local stack. Confirm the hosted job passed and run staging-specific role, Storage, and concurrency checks before release. Do not treat static contract tests as a substitute.
5. Deploy the API and push worker as separately supervised services using the same compatible release. Verify they start, emit JSON logs, and show no startup/config errors. API `/health` confirms liveness only; verify authenticated read/write paths in staging as well.
6. Run staging smoke checks with synthetic accounts: sign-up/email verification/recovery, consent and assessment, meal plan/diary/report, pantry/list, booking/cancellation, PayOS sandbox webhook, assistant consent/retry, appointment chat, record upload/OCR review/delete/export, notification read/preferences/token lifecycle, and account export/deletion.
7. Release the mobile build after API compatibility is confirmed. Stage store rollout and push enablement; watch the chosen monitoring system for request failures/latency, payment reconciliation backlog, push queue age/worker liveness and provider outages. Record the rollout window and rollback decision owner.

## Migration and rollback

- Apply schema before application code. Prefer additive columns/tables/functions and preserve existing `/api/v1` behavior.
- Stop rollout if migration, RLS, storage, API or synthetic-account smoke checks fail. Do not run an unreviewed destructive/down migration.
- Roll back the application only when the previous release is compatible with the already-applied schema and any writes made by the new release. Otherwise keep traffic constrained and ship a corrective forward migration/application release.
- If a payment can be externally settled while local state is uncertain, stop replays/new checkout for the affected intent and reconcile against PayOS events before telling the user it is paid or issuing a refund.
- Record the exact code/schema version and observed symptom; retain only privacy-safe logs and request IDs.

## First checks for operational alerts

Alert thresholds and destinations must come from the hosting/monitoring owner and an agreed service objective. This repository intentionally does not invent an SLO or configure an alert destination.

| User-visible symptom | First check | Action |
|---|---|---|
| API errors or latency rise | Filter JSON `http_request_completed` by route/method/status and request ID; correlate matching `api_request_failed` event | Check deployment/config and database/provider health. If new release aligns with symptom and schema is compatible, roll back code; otherwise constrain traffic and forward-fix. Escalate to API/database owner. |
| Payment status is pending or reconciliation-required | Compare local payment intent/order code and signed PayOS webhook outcome in the private operator console; never rely on client redirect | Prevent duplicate checkout, reconcile provider state, then use the documented support/refund process. Escalate to payments owner. |
| Push notifications are delayed | Check push-worker process, `push_worker_batch_failed` events, queued/leased backlog age and Expo receipt outcomes | Restore worker/provider config; queued events retry. Do not describe an Expo ticket as user delivery. Escalate to notification operator. |
| Supabase or Storage access fails | Check deployment secret reference, project status, migration version and sanitized API error event | Keep private-record access constrained; do not bypass RLS with an app-side privileged key. Escalate to database/security owner. |

The application emits request completion logs and bounded worker batch counts. A hosting operator must ship them to an access-controlled log store, provide aggregate rate/error/latency views, set action thresholds, test alert routing and retain the runbook link. Do not add account IDs, raw URLs, request IDs as metric labels, or health data to metrics.

## Backup and restore drill

The repository does not configure a Supabase backup policy or restore target. The database operator must use the provider's current documented backup/export and restore facilities for the selected plan, set retention/encryption/access controls, and record evidence before release. Restore into an isolated recovery project first; verify schema version, synthetic-account RLS, private Storage objects, export and deletion behavior, then document measured recovery time and data-loss window. Do not overwrite production during a drill. A failed or untested restore blocks real-data use.

## Incident response

1. Restrict the affected service, project key, account, worker or integration; preserve only access-controlled, privacy-safe logs and request IDs.
2. Revoke/rotate compromised credentials with the issuer. Update the host secret store and restart the affected process; never paste credentials into tickets.
3. Have the assigned security/privacy owner determine scope, affected records, provider exposure and notification obligations under the approved policy. Do not make legal/compliance claims from this runbook.
4. Restore service only after containment and validation. Record cause, affected versions, evidence, corrective actions and reviewer; update this runbook if the first-check path was incomplete.

If no named incident/security contact or approved notification policy is recorded, do not deploy publicly or enable real personal/health data.
