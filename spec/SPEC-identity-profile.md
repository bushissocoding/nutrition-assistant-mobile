# Spec: `identity-profile` — Full App V1

Status: approved by the agent under the user's explicit delegation (2026-11-24). Parent scope is [SPEC-full-app-v1.md](SPEC-full-app-v1.md); module boundaries are in [the capability map](capability-map-full-app.md).

## Objective

Replace the local account/profile previews with Supabase-managed accounts and account-owned consent and health profile data. Patients can create and verify an account, sign in/out, restore/expire sessions, recover by verified email or verified phone, complete the requested assessment, review/update consent, and access/export/delete their own identity data. Invalid/unavailable identity operations must never look successful.

Email/password registration remains the primary account path. SMS recovery is available only after the user has linked and verified a phone number; do not add a required phone field to the specified registration form. An unverified/unlinked phone cannot recover an email account.

## Functional Requirements

1. **Launch and session routing:** show splash/onboarding, then Welcome for signed-out users. A restored session routes to consent review or health assessment if incomplete, otherwise Home. A sign-out/expired session clears private memory and returns to Welcome. Late responses from a prior session cannot populate the next account's state.
2. **Registration:** validate email, username, password, and confirmation; register through Supabase Auth with email confirmation; create the account-owned profile only after verified identity; show a check-email state when Auth returns no session. Normalize username and reject duplicates without exposing another account's email or profile.
3. **Login/logout:** use Supabase password auth; persist/refresh the session through a SecureStore adapter; logout revokes/clears local session and all account-specific in-memory state; session restoration and invalid/expired tokens are recoverable.
4. **Email recovery:** request `resetPasswordForEmail` using an app callback URL; handle the `PASSWORD_RECOVERY` event from the callback; collect/confirm a new password; update through Auth and show a truthful confirmation. A link-opened session must not silently skip the new-password form.
5. **SMS recovery:** accept an E.164 phone number only for a previously linked/verified account, request OTP with account creation disabled, verify the SMS code, then set/confirm the new password. Use the same generic request confirmation for existent and nonexistent accounts. Rate limit requests and expose resend cooldown. Provider configuration failure is explicit/retryable and never a false “sent” success.
6. **Phone enrollment:** in authenticated settings, link an optional phone and confirm the provider OTP before enabling SMS recovery. Removing/changing the verified phone requires an authenticated session and a fresh verification. The user's email/password remains available as a recovery path.
7. **Consent:** authenticated users receive a versioned server receipt with server timestamp and explicit required choices for account health-profile processing, nutrition feature processing, and data-lifecycle disclosure. Optional AI processing and health-record storage consent are separate, revocable choices; refusing an optional choice does not block other features. An old/missing required receipt blocks health-data reads/writes and derived processing with a retryable consent flow.
8. **Health assessment/profile:** store username, gender, age, height, weight, activity, one condition/disease type, multiple allergies, mode, symptom/red-flag notes, diagnosis notes, hard limits, and explicit confirmation where the current patient profile requires it. Preserve existing field bounds and derive all ownership from the verified principal. Do not add diagnoses, infer clinical conclusions, or relax allergies/hard limits.
9. **Profile and account-data API:** `GET /api/v1/me` returns only the verified account ID. Add `GET/PUT /api/v1/me/profile`, `GET/PUT /api/v1/me/consent`, `GET /api/v1/me/export` for identity/profile/consent data, and `DELETE /api/v1/me` through an idempotent deletion workflow. No route accepts `userId` as authority. Account export/deletion orchestration must include records owned by later modules before full-app deletion is declared complete.
10. **Local data migration and privacy:** SecureStore demo state is never shared between accounts. On account switch/logout, clear private memory; if a local profile is offered for migration, require the user to explicitly choose it, save server-side successfully, and only then remove local copy. Keep synthetic-only development instructions and do not enable real health data before approved review.

## Data and API Contract

- Mobile uses the Supabase publishable key and Supabase Auth SDK for identity operations. Private application data is read/written only through the Express `/api/v1` API using a verified user bearer token and user-scoped publishable client/RLS.
- The app uses a custom Expo SecureStore adapter for the auth session. Store chunks below platform value limits, write a new version completely before switching the pointer, and keep the prior valid session if a write fails. Do not store passwords, OTPs, profile fields, or consent choices in the auth-session storage namespace.
- Initial database tables: `profiles(id references auth.users on delete cascade, username, gender, age, height_cm, weight_kg, activity_level, mode, condition_type, allergies, symptom_notes, red_flags, diagnosis_notes, hard_limits, medical_limits_confirmed, created_at, updated_at)` and append-only `consent_records(id, user_id, version, choices, accepted_at)`. Use server validation as well as DB constraints, a case-insensitive unique username index, timestamps from the database, and explicit column allowlists.
- Enable RLS on both tables. The patient role can select/insert/update only the profile whose `id = auth.uid()` and select/insert only consent rows whose `user_id = auth.uid()`. No public read policy. No client-supplied owner ID is accepted. Do not grant the mobile app the secret key.
- `/api/v1/me/profile` input contains only allowlisted profile fields; route validation uses the existing deterministic profile model. The repository uses the request-scoped user database client; a cross-account query returns no row and cannot mutate another profile.
- Required consent is append-only and server-timestamped. Revocation stops consent-dependent processing and records the revocation/new choice state; linked data deletion follows the approved lifecycle and does not silently clear local retry context before server confirmation.
- Account deletion uses a server-only privileged Auth client only after verified identity. It is idempotent and must cascade Postgres data, private storage objects from later modules, provider conversations, and active integrations. If any external deletion step is pending, show a retryable pending state and do not claim complete deletion.

## Tech Stack

- Expo SDK 58, `@supabase/supabase-js`, `expo-secure-store`, `expo-linking`; current Supabase publishable/secret API keys.
- Supabase Auth email/password and phone OTP; Supabase Postgres/RLS; Express routes, middleware, services and repositories.
- SMS/custom email delivery is configured in the Supabase project (Twilio-compatible SMS provider and verified SMTP). Credentials are operator secrets, never client variables.

## Commands

- Focused tests: `node --test server/tests/identity-profile*.test.js app/src/services/auth-session-storage.test.cjs app/src/features/profile/profile-model.test.cjs` (adjust to exact files when added).
- Required suites: `npm run test:unit`, `npm run test:ui`, `npm run test:api`.
- Expo install/check: `npx expo install @supabase/supabase-js expo-linking` and `npx expo install --check`.
- Bundle check: `npx expo export --platform android`.
- Local database/RLS when prerequisites are available: `npx supabase start`, `npx supabase db reset`, then the documented RLS integration tests.

## Project Structure

- `app/src/services/auth-client.js`: singleton mobile Auth client with SecureStore session adapter.
- `app/src/services/auth-service.js`: account lifecycle, password recovery and phone verification operations.
- `app/src/features/onboarding/AuthScreen.js`: presentation for login/registration/recovery, with operation state passed in from `AppShell`.
- `app/src/features/onboarding/consent-model.cjs`, consent/profile screens: versioned choices, disclosure and assessment.
- `server/src/routes/current-user.js`, `server/src/routes/profiles.js`, `server/src/routes/consent.js`: authenticated HTTP contracts and input validation.
- `server/src/services/profile.js`, `server/src/repositories/profile-repository.js`: deterministic profile rules and request-scoped storage.
- `supabase/migrations/`: profile/consent tables, constraints and RLS policies.

## Code Style

Keep SDK/provider effects behind the auth service and repository; profile normalization remains pure. Route ownership always comes from middleware:

```js
router.put('/profile', requireUser, requireCurrentConsent, asyncRoute(async (req, res) => {
  const profile = parseProfileInput(req.body);
  const saved = await profileRepository.upsert({
    db: req.userDatabase,
    ownerId: req.auth.user.id,
    profile,
  });
  return res.json({ profile: saved });
}));
```

Never accept `ownerId` from a client, log credentials/OTP/profile/consent payloads, or return provider error internals.

## Testing Strategy

- Unit-test email/username/password and profile schemas, consent-version/choice validation, OTP/password recovery state transitions, session chunk corruption/recovery, write-failure atomicity, and account-switch clearing.
- API-test 401/403/503 behavior, missing/old consent blocking, request-body owner tampering, cross-user read/write isolation, uniqueness conflicts without account disclosure, export scope, and delete retry/idempotency.
- Use two synthetic Supabase accounts for local integration RLS tests; run them against Supabase local after Docker/CLI is available. Provider tests use fake transports or official sandbox accounts; never use a real user's account or send unapproved messages.
- UI tests cover email confirmation, session restore, logout/account switch, SMS only for verified phone, generic recovery confirmation, callback password update, consent gating/review, and profile assessment.
- Required repository suites and Android bundle export must pass; report actual provider delivery and DB integration only when executed with configured credentials.

## Boundaries

- **Always:** require verified identity for private data; derive every owner from `req.auth.user.id`; enforce RLS and explicit query ownership; use SecureStore only for auth session; clear account-scoped state on session change; store consent server-side with server time; keep username private; use generic reset confirmations; keep non-clinical and estimate copy; use synthetic fixtures.
- **Ask first / external owner required:** enable a live Supabase project, custom SMTP/Twilio billing, public callback domains, real health-data processing, production retention/deletion policy, or any claim that consent meets Vietnam legal requirements. The user delegated code decisions but cannot create vendor accounts or qualified reviewer approval from this repository.
- **Never:** store password/OTP in app storage or logs; allow arbitrary phone numbers to reset another account without verified linkage; reveal whether an account exists in a reset screen; use auth metadata as a provider/admin role; make consent optional for processing it requires; let a client select an owner; claim profile persistence until migration/RLS and API tests pass.

## Success Criteria

- Registration, email confirmation, login, session restore, logout, email reset, verified-SMS recovery, and recovery confirmation work through configured Supabase Auth.
- No session secret is exposed to JavaScript logs or stored outside the secure session adapter; failed storage updates preserve a usable prior session.
- Every health profile/consent route is authenticated, validates fields, rejects owner tampering, and is protected by RLS; tests prove two-account isolation.
- Assessment persists all requested fields, one condition and multiple allergies; profile completion is required before planning features; allergies/hard limits remain strict.
- Server consent version/timestamp controls processing; optional AI and record storage consents can be independently withheld/revoked.
- Account/profile export is scoped; deletion is retryable, idempotent, and does not claim completion while any module-owned record/object remains.
- Existing demo routes and data cannot be mistaken for authenticated account records; public nutrition `/api/v1` behavior stays compatible.

## Out of Scope (Deferred)

- Social login, passkeys, multi-factor authentication, multi-tenant organizations and clinician credentials/verification are separate specifications.
- Legal opinion, consent-copy approval, clinical suitability and production data-controller decisions belong to qualified project owners, not this code module.

## Open Questions

- No repository decision blocks implementation. External prerequisites are a configured Supabase project, callback allowlist, deliverable SMTP and SMS provider, and a local Supabase/Docker environment to prove RLS. The current profile contains patient-specific limits; keep those as user-entered data and do not imply clinician validation.

## Source Notes

- [Supabase Expo React Native quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
- [Supabase `getUser(jwt)`](https://supabase.com/docs/reference/javascript/auth-getuser), [email password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [phone sign-in/OTP](https://supabase.com/docs/guides/auth/phone-login), [verify OTP](https://supabase.com/docs/reference/javascript/auth-verifyotp), [password security](https://supabase.com/docs/guides/auth/password-security).
- [Expo SecureStore SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/), [Expo Linking SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/linking/), [Expo app deep links](https://docs.expo.dev/linking/into-your-app/).
