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
| `platform-security` | Production configuration, database, migrations, auth middleware, rate limits, secure headers, audit-safe logs, backups and environment separation | Express API and JSON demo store exist; no production database or auth boundary | None |
| `identity-profile` | Sign up, sign in/out, session lifecycle, verified email/SMS recovery, consent records, owned health profile, export and deletion | Form validation, consent and profile are local previews/SecureStore | `platform-security`, selected identity and email/SMS services |
| `nutrition-catalog-planning` | Licensed food catalog, provenance, deterministic nutrition calculation, plans constrained by allergies/hard limits | Deterministic demo API/catalog exists; Vietnam sources are not cleared for redistribution and no clinical validation exists | `platform-security`, `identity-profile`, data rights and qualified nutrition review |
| `diary-grocery-analytics` | Account-owned diary CRUD, pantry inventory, shopping list, local-timezone history, nutrition report and export | Diary/list API uses caller-controlled demo namespace; pantry is local screen state; history chart is now API-backed | `platform-security`, `identity-profile`, `nutrition-catalog-planning` |
| `care-bookings` | Verified provider directory, availability, appointment creation/rescheduling/cancellation and appointment history; authenticated provider onboarding, schedule and appointment operations | Provider records and booking flow are synthetic in-memory previews | `platform-security`, `identity-profile`, provider verification |
| `payments` | Real checkout, payment verification/webhooks, receipts, refund/reconciliation flow | Payment methods/results are UI previews; no transactions | `platform-security`, `identity-profile`, `care-bookings`, selected licensed payment provider |
| `chat-assistant-messaging` | AI nutrition assistant with approved service, authenticated doctor messaging and delivery state; provider inbox for booked-patient conversations | FAQ assistant and provider chat are non-delivering UI previews | `platform-security`, `identity-profile`, `care-bookings`, selected model/messaging services and staffing |
| `records-labs` | Account-owned health records, secure capture/storage/export, OCR candidate extraction with user confirmation | Local profile PDF and editable synthetic lab sample; no real record storage or OCR | `platform-security`, `identity-profile`, secure object storage, OCR choice and qualified review |
| `notifications-settings` | Event-backed in-app/push notices, read state, preferences, privacy controls and account-data operations | Synthetic notices and locally persisted read flags; settings are mostly device-local | `platform-security`, `identity-profile`, push provider and event sources |
| `release-operations` | Production deployment, secrets, observability, security tests, recovery, support ownership and release controls | CI/unit/UI/API checks exist; no production host/operator/security sign-off | All production modules plus named operator |

## Build order

`platform-security` → `identity-profile` → (`nutrition-catalog-planning` → `diary-grocery-analytics`) → `care-bookings` → (`payments`, `chat-assistant-messaging`, `records-labs`, `notifications-settings`) → `release-operations`.

## Boundary review checklist

- The requested launch, registration/recovery and health assessment belong to `identity-profile`.
- All eight Home modules map to `diary-grocery-analytics`, `care-bookings`, `records-labs`, `nutrition-catalog-planning`, or `chat-assistant-messaging`.
- The nutritional report maps to `nutrition-catalog-planning` and `diary-grocery-analytics`; notifications and settings map to `notifications-settings`.
- Payment is separated from booking because it has an independent provider, webhook, refund, and reconciliation lifecycle.
- Medical-record storage/OCR is separate from generic personalization because it requires a distinct sensitive-data lifecycle and human confirmation path.
- `release-operations` depends on every module and has no cycle back into product modules.
- Real booking and doctor chat need role-protected provider workflows in the app so a verified provider can manage availability and respond; patient-only previews cannot deliver these capabilities.
- Open blockers are explicit: identity/service credentials, payment merchant account, verified provider roster, messaging/AI credentials and staffing, OCR native-build verification, food-data rights, clinical review, privacy/legal review, and deployment/support ownership.
