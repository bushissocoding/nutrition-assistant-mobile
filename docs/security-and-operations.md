# Security and Operations Baseline

Last reviewed: 2026-11-24

## Release status

The repository contains authenticated client/server workflows for identity, consent/profile, nutrition, diary/grocery, care/payment, chat, records, notifications and personalization. This is implementation evidence, not evidence of a deployed production service. Use synthetic data only until all external gates in [`SPEC-release-operations-v1.md`](../spec/SPEC-release-operations-v1.md) are closed and qualified reviewers approve the relevant use.

## Dependency review

`npm audit --json` on 2026-11-24 reports 22 moderate findings, with no high or critical findings. The current direct versions are Expo `58.0.25`, Jest `30.5.2`, and jest-expo `58.0.14`. The findings are in the Expo fingerprint/build and Jest tooling dependency paths, including `glob` and `minimatch`. npm's available remediation downgrades Expo 58 to 52 or Jest 30 to 29, so it crosses supported major lines. Do not apply those forced downgrades; re-check advisories and compatibility when the supported dependency ranges provide a safe fix. No dependency was changed just to silence the audit.

Before changing dependencies, run `npm audit --json`, inspect installed paths, classify severity and reachability, and check whether a fix stays within the supported Expo/Jest major lines. Run required checks after a targeted update. Never use `npm audit fix --force` as a blanket remediation. The dependency-risk owner remains unassigned and must be named before release.

## Data and trust boundaries

- Supabase Auth verifies identity when configured. The app stores its Auth SDK session in SecureStore. Private APIs use a request-scoped client and explicit owner/role filters; SQL migrations add RLS and narrow privileged RPCs. Static migration contract tests do not prove behavior against a running Postgres/Supabase project.
- Account APIs cover profile/consent, meal plans, diary/report, pantry/shopping, care/payment, chats, health records, notifications and personalization. The old caller-selected `X-Demo-Namespace` routes exist only for synthetic local compatibility and are disabled by default and in production.
- Account export is versioned and includes registered user-owned records. Account deletion runs registered cleanup steps and removes private health-record objects before deleting the Auth identity. This is not a tested legal retention/deletion guarantee; external replicas, provider records and backups need separately approved policies.
- Health-record images stay on device during OCR candidate review. Upload is explicit and consent-gated; OCR candidates are not confirmed results until the person saves them. The app does not interpret lab values or diagnose.
- OpenAI assistant history is account-owned, uses `store: false`, and sends only the user message after explicit consent; appointment messaging is participant-only. Push payloads are generic and contain no message or health detail. A push ticket is not proof that a device displayed a notification.
- PayOS webhooks, not client redirects, confirm payment. The app does not collect card credentials. FDC values carry source metadata. The current prototype catalog is not an official Vietnamese nutrition dataset and the planner is not a clinical recommendation engine.
- API and worker logs must not contain request bodies, headers, auth tokens, profile fields, diary/record contents, email or account identifiers. Request telemetry uses generated correlation IDs and route templates only.

## Configuration and service lifecycle

The root `.env` contains only client-visible `EXPO_PUBLIC_*` configuration; those values are embedded in the mobile bundle and must never hold credentials. API secrets belong in ignored `server/.env` locally or a deployment secret store. `.env.example` files contain safe names/defaults. Production config requires HTTPS origins and current Supabase URL/publishable/secret keys; provider adapters fail closed when their required configuration is absent.

The API's `/health` route reports process liveness only; it does not probe Supabase, storage or vendors. The API and `npm run push:worker` are separate supervised processes. Worker backlog, provider errors, process restart and receipt outcomes need monitoring from the selected host. Request JSON logs provide method, bounded route template, status, duration and generated request ID; this repository does not choose a log vendor, metrics backend, alert destination or on-call schedule.

`SIGINT` and `SIGTERM` stop accepting new API connections and allow active requests to finish until the shutdown deadline. This is not process supervision or high availability. API request rate limits are in-process; use a shared limiter or edge control before scaling across instances. Provider timeouts and retry/idempotency behavior are described in module specs and tests.

## Storage, deletion, retention and recovery

Private data is stored in Supabase tables with RLS; source images use a private Storage bucket. The local demo JSON store is not account storage and has no production durability, encryption, backup, retention or multi-instance guarantees. No Supabase project is configured in this checkout, so migrations, two-account RLS behavior, object policies and live account deletion have not been executed here.

The deployment operator must configure database/object backups, retention, encryption and access; run a restore drill; choose deletion/retention rules for backups and external providers; and record evidence, date and owner. The repository has no configured backup job or restore target and therefore makes no recoverability or deletion SLA claim. Apply schema migrations before compatible application code. Prefer additive changes; when new code has written data, use a corrective forward migration unless rollback compatibility has been demonstrated.

## Incident response and ownership

Before public deployment, assign named API/database, privacy/security, support and clinical/nutrition owners plus an incident contact. Follow the [release and recovery runbook](runbooks/release-operations.md) for deployment, rollback, restore-drill and incident steps. For suspected exposure, restrict or stop the affected service, preserve only privacy-safe logs, revoke/rotate exposed credentials with the issuer, assess affected data privately, and follow the approved notification process. Do not post credentials, exploit details or real health information in public issues. This checkout has no configured production incident channel or breach-notification service.

## External release gates

The operator must attach evidence and an owner/date for each item before production claims or real-data use:

| Gate | Evidence required |
|---|---|
| Supabase deployment | Project/environment split, applied migrations, two-account RLS tests, private Storage policy tests, secret review |
| Backup and recovery | Retention configuration, encrypted backup evidence and a successful restore drill |
| Payments | PayOS merchant onboarding, webhook/callback configuration, sandbox payment and reconciliation/refund procedure |
| Identity delivery | Verified SMTP/SMS sender, recovery-delivery and account-lockout checks |
| AI and push | OpenAI account/policy approval and consent review; EAS/APNs/FCM configuration, opt-in and physical-device delivery check |
| Food data | FDC key; documented redistribution rights for each source; qualified review of nutrition content and hard-limit behavior |
| Care operations | Real provider roster, credential verification process, provider staffing and escalation coverage |
| Native app | Android and iOS install/device checks, permission-denied paths, camera/image picker/OCR and notification checks |
| Governance and support | Qualified privacy/legal, security and clinical/nutrition reviews; support contact, retention policy and incident owner |
| Hosting and observability | TLS/domain, secret store, process supervision, log retention, symptom alerts, runbooks and on-call owner |

No credentials, vendor accounts, verified provider roster, data rights, reviewer sign-off or deployment operators were supplied by this repository. Do not infer that these gates are satisfied from adapter code or synthetic tests.
