# Identity and Profile — Focused Task Checklist

Spec: `spec/SPEC-identity-profile.md`. Scope: account-backed identity, consent and health profile. The feature remains unavailable as a real-data service until external project settings and required reviews exist.

## Ordering and acceptance

- [x] Specify the account lifecycle, data ownership, sensitive boundaries and acceptance criteria before implementation.
- [ ] 1. Establish mobile Auth client and failure-safe SecureStore adapter; add unit tests for chunking, corruption and atomic pointer swap.
- [ ] 2. Add auth service for email registration/login/logout/session restore and recovery callback; keep SDK errors mapped to safe user messages.
- [ ] 3. Replace AuthScreen local-only success with real async operations and loading/error/email-confirmation/reset-password states; remove demo path from production configuration.
- [ ] 4. Bind app session lifecycle to root navigation; clear account state on logout/switch/expiry and ignore stale async results.
- [ ] 5. Add profile/consent migration, RLS, schema constraints and database integration tests runnable against local Supabase.
- [ ] 6. Add profile/consent validation, repository and owner-scoped API routes; enforce current consent before health processing.
- [ ] 7. Connect assessment/profile/consent UI to owned API; keep only auth credentials in SecureStore.
- [ ] 8. Add email reset, optional verified-phone linking/SMS recovery, callback URL configuration and generic anti-enumeration UI.
- [ ] 9. Add profile export and staged deletion operation; deletion API includes extension hooks for records from later modules and never reports complete before all registered handlers succeed.
- [ ] 10. Add focused unit/API/UI tests, run required full suites and Android bundle, update architecture and operational docs, self-review, commit.

## Per-task verification

1. Focused adapter tests prove failed writes preserve the prior session; tests do not use real account material.
2. Mocked Auth tests cover success, provider errors, verification-required registration, recovery callback and expired session.
3. UI tests assert no success state when Auth is unavailable and that password/OTP text is never echoed.
4. App shell tests cover logout, account switching, expiry, consent gating and stale requests.
5. Local Supabase tests with two synthetic accounts prove RLS read/write isolation; run only if Docker and Supabase CLI are available.
6. API tests cover missing/invalid consent, body owner tampering, strict field validation and provider unavailability.
7. UI tests verify assessment fields persist after reload and account boundary.
8. No real SMS/email send without configured sandbox provider. Delivery outcome is only claimed when provider callback confirms it.
9. API tests cover idempotency/retry, partially failed deletion and no premature completion.
10. Required repository commands: `npm run test:unit`, `npm run test:ui`, `npm run test:api`, `npx expo export --platform android`.

## Implementation review notes

- The current local consent/profile is a prototype. It must not be silently uploaded or migrated; the account holder must explicitly choose migration and see the result.
- Password and OTP handling stays in memory only; Auth SDK manages the token lifecycle through SecureStore.
- Server ownership comes only from the verified Auth principal. There is no client-controlled `userId` or role elevation.
- The API secret key is restricted to server-side deletion orchestration and cannot be imported by client bundles.
- Real patient data is prohibited in screenshots, fixtures, logs and tests; all test records are synthetic.
- Email/SMS vendor credentials, privacy copy approval and legal review are external release gates, not code acceptance shortcuts.
