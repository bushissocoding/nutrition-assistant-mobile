# Spec: `care-bookings` — Full App V1

Status: self-approved under the user's explicit delegation (2026-11-24). Parent: [Full App V1](SPEC-full-app-v1.md). Depends on `platform-security` and `identity-profile`; payment checkout is the next module and integrates with held appointments.

## Objective

Replace synthetic doctor and appointment previews with owner-scoped provider discovery, explicit provider verification, real availability and appointment reservation workflows. No provider is fabricated or shown as verified. An empty provider directory is a valid state until an operator verifies real provider accounts.

## Decisions

- Supabase Postgres owns provider profiles, availability slots, booking holds and appointments. Private mutations go through verified JWT, request-scoped DB client, explicit owner filters and RLS.
- Provider verification is a privileged operator action. Providers may apply/edit their own profile but cannot grant themselves verified status. Only verified profiles appear in patient discovery or can accept appointments.
- Slots use fixed, non-overlapping 30-minute UTC intervals, are entered by verified provider accounts and may be published up to 90 days ahead. Patient and provider schedule queries cover a bounded seven-day window; the app converts UTC slots to local time for display.
- Appointment creation reserves one currently open slot transactionally, requires an `Idempotency-Key`, validates patient name/contact and a bounded symptom note, and records explicit disclosure consent for the appointment fields visible to that provider. A reservation remains `awaiting_payment` for 20 minutes; the payment module must confirm only from a signed provider event. Stale holds become available during availability reads and booking operations; production also needs a scheduled cleanup worker.
- Unpaid appointments can be cancelled immediately. A patient may cancel a confirmed appointment at least 24 hours before its start; a provider may cancel a confirmed appointment at any time. A refund is not claimed; any refund remains an explicit merchant/operator workflow until implemented and verified by the payments module.
- Provider and appointment data contain synthetic fixtures only. There is no telehealth, diagnosis or treatment advice.

## Functional requirements

1. Patient provider directory is sourced only from verified account-backed profiles and can search by provider name/specialty. Profile details show source-verified status, qualifications entered by the provider, price and available appointment slots; no fake ratings or fees are shown.
2. A provider can submit/edit their own profile and request approval. Pending providers see a truthful pending state; only a trusted operator can approve/suspend an account.
3. A verified provider can publish/delete future fixed-duration availability slots, view booked appointments and mark them completed or cancel them with a reason. A provider cannot read unrelated patients' profile/diary/records.
4. A patient can inspect slots, enter bounded patient contact/symptom information and explicitly consent to share only those booking fields with the selected provider. Server validates request shape, provider status and profile/contact formats; caller cannot set owner, price, status, provider verification or slot state.
5. Concurrent or retried bookings cannot double-book a slot. Same owner/key/normalized request replays the original booking; changing the request with the same key returns 409. Booking and slot reservation are one transaction.
6. Patient appointment list includes upcoming and past history with bounded pagination. Patient can cancel an owned eligible booking; cancelled/expired appointments cannot be reactivated by the client. Cancellation releases unpaid/eligible slots safely.
7. Booking screen, appointment list and provider workspace use `/api/v1/me/...`, show loading/empty/error/retry states and do not preserve sample provider identities, dates or success states.
8. Export/deletion, consent withdrawal and account lifecycle include provider-owned profile/availability and patient appointment data without leaking another account's fields. Paid payment history must be retained only as required by payment/legal owners and is specified separately.

## API and persistence

- Patient API: `GET /api/v1/me/care/providers?q=&specialty=`, `GET /providers/:providerId/availability?from=&to=`, `POST/GET /appointments`, `GET /appointments/:id`, `POST /appointments/:id/cancel`.
- Provider API: `GET/PUT /provider-profile`, `POST/GET/DELETE /provider/availability`, `GET /provider/appointments`, `POST /provider/appointments/:id/complete`, and `POST /provider/appointments/:id/cancel`.
- `care_providers`: auth user owner, public profile fields, private license details, status (`pending|verified|suspended`), verifier and timestamps. RLS permits self profile access and verified-directory reads; column grants prevent self-verification.
- `provider_availability`: provider FK, exact UTC interval, status (`open|reserved|booked|blocked`), unique provider/start, 30-minute duration, provider RLS. Reserve/book/release operations use narrow security-definer RPCs with `auth.uid()` and fixed search paths.
- `appointments`: patient/provider/slot FKs, state (`awaiting_payment|confirmed|completed|cancelled|expired`), request key/hash, patient contact/symptoms, explicit disclosure receipt, amount/currency snapshot, hold expiry, lifecycle timestamps and safe cancellation reason. Owner/provider RLS; profile and unrelated health records are never joined into provider responses.
- Use SQL migration checks and RLS integration instructions; repository and service methods keep explicit owner and role IDs even when RLS applies.

## Test criteria

- Domain tests: strict request shapes, field lengths, time windows, state transition matrix and canonical request hashes.
- API tests: anonymous/without-consent access rejected; provider self-verification rejected; status and owner tampering rejected; unverified provider hidden; idempotent replay/conflict; stale hold, cancellation, concurrent slot reserve and explicit provider disclosure.
- Repository/migration tests: all queries owner-filtered; RPC ownership and slot lock; RLS policies; export/deletion coverage.
- UI tests: empty directory, provider pending/unverified state, source-backed availability, form validation, retry, booked/cancelled states and provider role gates; no fake successful outcome.
- Run required `test:unit`, `test:ui`, `test:api`, Android export and `git diff --check`. Execute real two-account RLS/concurrency integration only when local Supabase/Docker is available.

## External gates

Real provider credentials, qualifications, operator verification, roster/staffing, service terms, cancellation/refund policy and qualified privacy/legal review must be supplied by the deployment owner. No credential or medical qualification may be invented from this repository.
