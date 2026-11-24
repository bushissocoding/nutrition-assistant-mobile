# Capability Map: Nutrition Assistant — Full App

## Scope assumptions

- “Full app” means real account-bound workflows backed by deployable server services, not local previews or caller-controlled demo namespaces.
- Keep the current Expo/React Native client and layered Express API unless the audit identifies a concrete blocker. The API remains the only client path to private data.
- Use verified identity and server-derived ownership for every private record. Keep existing `/api/v1` clients compatible while adding authenticated contracts and a safe migration/deprecation path.
- Use synthetic data in development and tests. Real health data and clinical use remain disabled until the data lifecycle and qualified reviews are approved.
- Provider choices will follow official current documentation and will be recorded in per-module specs. Credentials are configured through ignored environment files or an operator secret store, never committed or embedded in `EXPO_PUBLIC_*` values.
- This map defines product capability boundaries. It does not claim that a provider account, credentials, licensed catalog, clinical reviewer, or deployment operator already exists.

## Capability map

| Module id | Responsibility | Existing state | Depends on |
|---|---|---|---|
| `platform-security` | Production configuration, database, migrations, auth middleware, rate limits, secure headers, audit-safe logs, backups and environment separation | Verified Supabase identity, strict configuration, owner/role RLS migrations, request-scoped clients, private Storage policies, local CLI config, schema-wide RLS pgTAP assertions, two-account profile test, and a CI-authenticated API journey through the mobile client are implemented; hosted CI runtime result is pending; remote project verification, shared rate limiting, backup/restore and deployment operator remain external | None |
| `identity-profile` | Sign up, sign in/out, session lifecycle, verified email/SMS recovery, consent records, owned health profile, export and deletion | Supabase Auth, consent/profile storage, assessment, export and deletion are implemented; live SMTP/SMS delivery, provider configuration and privacy/legal review remain external | `platform-security`, identity and email/SMS services |
| `nutrition-catalog-planning` | Licensed food catalog, provenance, deterministic nutrition calculation, plans constrained by allergies/hard limits | FDC adapter, source display, account-owned plans and soft preference ranking are implemented; live key, Vietnam data rights and qualified nutrition validation remain gates | `platform-security`, `identity-profile`, data rights and qualified nutrition review |
| `diary-grocery-analytics` | Account-owned diary CRUD, pantry inventory, shopping list, local-timezone history, nutrition report and export | Authenticated diary/report, source-backed pantry, saved-plan shopping lists, editing and export are implemented; live Supabase RLS remains unverified | `platform-security`, `identity-profile`, `nutrition-catalog-planning` |
| `care-bookings` | Verified provider directory, availability, appointment creation/rescheduling/cancellation and appointment history; authenticated provider onboarding, schedule and appointment operations | Account APIs provide applications, verified directory, schedule, holds, history and provider workspace; real roster, professional credential checks and live RLS remain external | `platform-security`, `identity-profile`, provider verification |
| `payments` | Real checkout, payment verification/webhooks, receipts, refund/reconciliation flow | PayOS hosted checkout, private payment intents, signed webhook confirmation, receipt export and unpaid-link cancellation are implemented; merchant activation, refunds/reconciliation and live RLS remain external | `platform-security`, `identity-profile`, `care-bookings`, selected licensed payment provider |
| `chat-assistant-messaging` | Non-clinical assistant with explicit consent; authenticated appointment-scoped provider messaging and provider inbox | Owner-scoped chat history, appointment inbox/messages, explicit assistant consent, stateless OpenAI adapter and rate limits are implemented; model credentials/policy and provider staffing remain external | `platform-security`, `identity-profile`, `care-bookings`, selected model and staffing |
| `records-labs` | Account-owned health records, secure capture/storage/export, OCR candidate extraction with user confirmation | Private object storage/API, reviewed-result lifecycle, on-device OCR, signed source view and PDF/account export are implemented; physical-device/native OCR and live RLS checks remain unverified | `platform-security`, `identity-profile`, private object storage and qualified review |
| `notifications-settings` | Event-backed in-app/push notices, read state, preferences, privacy controls and account-data operations | Durable events/read state, account preferences, token lifecycle and Expo Push outbox worker are implemented; EAS/APNs/FCM credentials and live delivery remain external | `platform-security`, `identity-profile`, Expo Push and event sources |
| `release-operations` | Production deployment, secrets, observability, security tests, recovery, support ownership and release controls | CI now includes a local Supabase migration/pgTAP/authenticated-API job alongside app checks, export/deletion paths, PII-minimal worker/API logs and runbooks; the first hosted result, production host, monitoring, backups, named operators and sign-off remain pending/external | All production modules plus named operator |

## Build order

`platform-security` → `identity-profile` → (`nutrition-catalog-planning` → `diary-grocery-analytics`) → `care-bookings` → (`payments`, `chat-assistant-messaging`, `records-labs`, `notifications-settings`) → `release-operations`.

## Boundary review checklist

- The requested launch, registration/recovery and health assessment belong to `identity-profile`.
- All eight Home modules map to `diary-grocery-analytics`, `care-bookings`, `records-labs`, `nutrition-catalog-planning`, or `chat-assistant-messaging`.
- The nutritional report maps to `nutrition-catalog-planning` and `diary-grocery-analytics`; notifications and settings map to `notifications-settings`.
- Payment is separated from booking because it has an independent provider, webhook, refund, and reconciliation lifecycle.
- Medical-record storage/OCR is separate from generic personalization because it requires a distinct sensitive-data lifecycle and human confirmation path.
- `release-operations` depends on every module and has no cycle back into product modules.
- Booking and doctor chat use role-protected provider workflows; live use still needs a roster of real, verified providers and staffing.
- Open blockers are explicit: identity/service credentials, payment merchant account, verified provider roster, messaging/AI credentials and staffing, physical-device OCR checks, food-data rights, clinical review, privacy/legal review, and deployment/support ownership.
