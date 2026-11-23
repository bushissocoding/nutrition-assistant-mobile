# Spec: Nutrition Assistant — Full App V1

Status: approved by the agent under the user's explicit delegation to approve all decisions (2026-11-24). This spec supersedes the demo-only completion objective for this initiative. Capability boundaries are indexed by [the full-app capability map](capability-map-full-app.md).

## Objective

Build the requested nutrition and care application as connected, account-backed workflows for patients and authenticated care providers. Patients can register, recover accounts, complete a health assessment, manage nutrition and medical records, find providers, book and pay for appointments, chat with their provider, use an assistant, and manage notifications and privacy settings. Providers can maintain their approved profile and availability, work their appointments, and answer conversations created by an eligible booking. A deployment with its own configured provider accounts must run these workflows without caller-controlled demo identity or fake successful outcomes.

The current Expo/React Native client and Express `/api/v1` API remain the product surfaces. Keep the existing versioned API behavior compatible while moving private features to authenticated, owner-scoped contracts. Use synthetic data in development, tests, and screenshots. Code can be completed without enabling real health data or claiming clinical/legal approval; those gates must remain enforced and clearly documented until qualified owners approve them.

### Assumptions and decisions

- Keep Expo SDK 58, React Native, Express, the feature-first client layout, and layered server structure.
- Use Supabase Auth and Postgres with RLS for managed identity and persistence. The Express API remains the only client path for private application records; it validates provider JWTs and creates user-scoped database operations. Keep service-role credentials on the server for tightly limited operations only. Store auth sessions with a SecureStore adapter that handles provider token size and partial writes safely.
- Use Supabase private Storage for uploaded health records, PayOS hosted checkout/webhooks for Vietnamese payments, Expo Push for notifications, and OpenAI Responses for the optional non-clinical assistant. Provider credentials and accounts are external deployment configuration, never source code.
- Use a server-side FoodData Central adapter with source/edition attribution for licensed catalog records. Vietnamese national food tables remain disabled until reuse rights and qualified review are verified.
- Keep OCR on-device. Extract editable candidates from a captured lab image; never interpret a result as a diagnosis or write candidates into a health profile until the user confirms them.
- The missing wireframe figures are not available in this request; use the current screens and design tokens as the reference while implementing the named states and flows.
- A provider-facing role mode is part of care bookings and chat so real availability and clinician responses have an operational user interface.

## Functional requirements

1. **Launch and identity:** splash/onboarding and welcome; email/password registration with username and confirmation; login/logout/session restore; verified email recovery and verified SMS recovery with a reset confirmation; validation, loading, retry, expired-session, and accessible error states.
2. **Health assessment and consent:** select gender, weight, height, age, one condition, and multiple allergies; record versioned server-side consent before consent-dependent processing; edit the owned profile; strict allergy and hard-limit handling.
3. **Nutrition report and home:** show the user's API-derived nutrient status and estimate disclaimers; provide eight explicit home entry points—book an appointment, view appointments, diet/meal plan, personalization, grocery/pantry, diary/food log, health examination records/PDF, and chat—with truthful loading/empty/error states.
4. **Food, plan, diary and groceries:** search attributed foods; calculate nutrients server-side; generate deterministic plans with allergy exclusions and hard limits; view recipes; add/quantify/confirm meals; browse local-date/timezone diary history and statistics; manage pantry quantities and shopping-list check-offs.
5. **Care and payment:** browse/filter real configured providers; inspect verified provider details; read availability; submit patient details and preliminary symptoms; confirm, cancel, and review appointments; start checkout, choose a supported method on the provider page, verify webhooks, and show success only after server-confirmed payment. Provider role can maintain the provider profile/schedule and update appointment lifecycle.
6. **Chat:** offer a non-clinical nutrition assistant only after clear first-use disclosure and explicit data-sharing consent; send only the message the user submits, never implicit profile/history; provide a delivery-backed, appointment-scoped patient/provider conversation and provider inbox. Disallow messages to providers without an eligible booked appointment.
7. **Health records and personalization:** capture or import a lab-record image with explicit permission; OCR produces editable candidate names/values/units/reference ranges with confidence when available; user confirms or discards each candidate. Store confirmed records privately under the account, display history, and export account data or a PDF. Personalization changes remain estimates and do not provide diagnosis/treatment.
8. **Notifications and settings:** event-backed in-app notices with server-persisted unread/read state, minimal-content push delivery and preferences; account/profile, consent, privacy/data export/deletion, password, notification, help, and sign-out settings.
9. **Operational truth:** provider, payment, AI, storage, push and SMS adapters report unavailable/configuration errors explicitly; no adapter may silently return fake successful production results. A protected provider/admin operation can seed or maintain verified provider inventory without exposing other users' health data.

## Tech Stack

- Expo SDK 58, React Native 0.88, React 19; existing `expo-secure-store`, `expo-print`, `expo-sharing`.
- Express 4 on supported Node 24; Supabase Auth, Postgres, RLS and private Storage.
- PayOS hosted payment link with server-verified signed webhook; Expo Push delivery; OpenAI Responses API with `store: false`; on-device camera/OCR; server-side FoodData Central API adapter.
- Add dependencies only when the first module spec names the need and the version is verified against official documentation and the existing Expo/Node compatibility.

## Commands

- App development: `npm start`; API development: `npm run api:dev`.
- Required checks: `npm run test:unit`, `npm run test:ui`, `npm run test:api`.
- Bundle check: `npx expo export --platform android` and `npx expo export --platform ios` where the host supports iOS export.
- Catalog validation: `npm run catalog:validate` and `npm run catalog:fixture`.
- Database integration when Supabase CLI and Docker are installed: `npx supabase start`, `npx supabase db reset`, and the repository's documented integration command.
- Hygiene: `git diff --check`; use a dependency audit when dependencies change and report findings without forcing incompatible upgrades.

## Project Structure

- `app/src/features/<feature>/`: patient and role-gated provider screens and feature-owned state; `app/src/services/`: auth, API, storage and device adapters; `app/src/shared/components/`: reusable UI genuinely shared by features.
- `server/src/routes/`: versioned, boundary-validated HTTP contracts; `server/src/middleware/`: identity, authorization, rate and request controls; `server/src/services/`: deterministic domain workflows and provider adapters; `server/src/repositories/`: owner-scoped persistence.
- `supabase/migrations/`: reviewed Postgres schema, RLS policies, indexes and storage policies; `server/tests/`: deterministic service, API, authorization, webhook, migration-contract and adapter tests.
- `spec/`: capability map and module specs; `tasks/`: initiative plan/task list; `docs/`: architecture, data lifecycle, provider configuration, release/operations.

## Code Style

Keep HTTP input parsing at routes, ownership from verified identity, domain rules in services, and IO behind narrow adapters. Prefer deterministic functions with injected clock/provider/storage dependencies. Example:

```js
router.post('/appointments', requireUser, async (req, res, next) => {
  try {
    const input = parseCreateAppointment(req.body);
    const appointment = await bookingService.create({
      ownerId: req.auth.user.id,
      input,
    });
    return res.status(201).json({ appointment });
  } catch (error) {
    return next(error);
  }
});
```

Never accept an owner ID from a request body/path as authority. Do not log bodies, credentials, health fields, message content, payment data, signed URLs, or OCR images.

## Testing Strategy

- Preserve the repository's unit/UI/API checks. Add focused tests for every behavior change and run all three required commands before handoff.
- Unit tests cover schema validation, deterministic nutrition, timezone boundaries, consent, ownership-independent business rules, idempotency, payment state transitions and OCR candidate confirmation.
- API tests verify unauthenticated rejection, cross-account isolation under body/path/namespace tampering, expired credentials, rate limiting, safe errors, replayed/invalid payment webhooks, and compatibility of existing `/api/v1` public nutrition contracts.
- Provider adapters are tested with provider-owned sandbox fixtures or injected transports. Contract tests do not claim a live provider account/credential works.
- UI tests cover the full patient journey and provider role gates, request retry, empty/error/loading states, notification read state, data export/deletion, and candidate review.
- When the external Supabase stack is available, run migrations and RLS tests against local Supabase. Without its local prerequisites, report that integration verification explicitly.
- Never use real personal/health data in tests, fixtures, snapshots, logs, or screenshots.

## Boundaries

- **Always:** preserve `/api/v1`; validate every external input; derive identity on the server; use owner-scoped queries plus RLS; use idempotency for create/payment intents and signed webhooks; calculate nutrient totals on the server; attribute food sources; keep allergies/hard limits strict; provide clear estimate/non-clinical language; make all credentials server-only; use synthetic data for checks.
- **Ask first / external owner required:** production account/merchant setup, paid services or live payment, real user health-data collection, public deployment, consent/retention changes that require legal approval, promotion of a national food dataset, clinical interpretation, or enabling any AI/third-party processing of user health information. The user delegated implementation decisions but not creation of external legal authority, credentials, merchant accounts, or reviewer sign-off.
- **Never:** fake an account, booking, payment, provider reply, push delivery, OCR interpretation, or successful export; expose secrets in app bundles; trust caller-supplied ownership; relax allergies/hard limits; claim legal compliance, clinical safety, or verified food provenance without the corresponding evidence.

## Success Criteria

- Each requested patient workflow can be completed from the app against configured services with persistent account-owned state, explicit authorization, correct error handling, and tests.
- Provider-mode users can publish approved availability, receive/cancel/manage their bookings, and respond to eligible patient chats.
- Payment confirmation depends on a verified idempotent server webhook, not a client redirect; no card data is stored by the app/API.
- Every private table and record object has owner/role enforcement, and tests prove one account cannot read/write another account's data.
- Nutrient totals come from server calculations with provenance; local-day summaries respect an IANA timezone; allergy/hard-limit constraints cannot be overridden.
- Export/deletion, consent, retention, backup, and incident procedures have a documented, testable implementation.
- Required tests, Expo bundle checks, database/RLS checks when available, and diff hygiene pass; all unavailable checks and external blockers are reported accurately.
- Production readiness is not claimed until credentials, service accounts, verified provider roster, data rights, privacy/security/clinical review, backup/restore, support and deployment ownership are supplied and verified.

## Out of Scope (Deferred)

- Video consultations, automated diagnosis/treatment, prescriptions, voice interaction, multi-country localization, and insurance claims are not requested and require separate service, safety, and regulatory specifications.
- A public provider marketplace/payment launch is deferred until verified providers, operations ownership, and merchant activation exist; this spec includes the product and provider-operating workflows needed to prepare it.

## Open Questions

- No repository question blocks implementation. Local configuration currently has no Supabase, PayOS, OpenAI, SMTP/SMS, FoodData Central or Expo push credential; production accounts, Vietnamese food-data reuse permission, provider roster, review owners and deployment operator remain external release prerequisites.

## Source notes

- Supabase Expo Auth, RLS and SecureStore constraints: [Expo React Native quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Expo SecureStore SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/).
- Payment and push lifecycle: [PayOS API](https://payos.vn/docs/api/), [PayOS webhook signature](https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/), [Expo Push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/), [Expo Push sending](https://docs.expo.dev/push-notifications/sending-notifications/).
- AI and food provenance: [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data) (including endpoint-specific retention and ZDR eligibility), [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [USDA FoodData Central](https://fdc.nal.usda.gov/).
- Applicable privacy obligations and effective dates must be verified by a qualified Vietnam privacy/legal owner against [Law 91/2025/QH15](https://vanban.chinhphu.vn/?docid=214590&pageid=27160) and [Decree 356/2025/NĐ-CP](https://vanban.chinhphu.vn/?classid=1&docid=216387&pageid=27160); this project makes no compliance determination.
