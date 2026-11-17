# Spec: Issue #3 — Onboarding, consent, and demo profile

Status: provider-independent prototype changes implemented. Production authentication and account ownership remain blocked by provider and privacy/legal decisions; issue #3 is not fully complete.

## Objective

Give users a clear, validated path through consent and profile setup. The app may store only synthetic demo profile data locally and send selected planning inputs to the development API. Consent on a device and a demo namespace are not identity, authentication, authorization, or proof of legal compliance.

## Issue criteria against the current implementation

| Issue criterion | Current behavior before this change | This change / status |
|---|---|---|
| Required consent and clear onboarding navigation | Four required checkboxes gate Continue; choices live only in React state. Profile setup has no back path to review consent. | Persist a versioned, timestamped local demo receipt with each required choice; provide review/back navigation. |
| Understandable consent covering data and lifecycle | Copy says profile is local and planning inputs go to the demo API; retention and demo-store deletion limits are not explained. | Explain data types, purpose, API processing, storage, retention limits, withdrawal, and deletion. Mark copy as prototype text awaiting privacy/legal review. |
| Registration, login, logout, session expiry | No identity provider, auth SDK, credentials, auth/session API, or authenticated profile route exists. | Blocked on the team's provider decision. Do not add mock login or custom authentication. |
| Server ownership checks for every profile route | There are no profile routes. Diary and grocery routes use caller-controlled demo namespaces and are not ownership-secure. | Blocked on provider-backed identity and a server persistence/ownership design. Keep existing demo routes demo-only. |
| Clearly labeled demo profile | Profile values are locally entered; the profile screen does not carry a persistent DEMO label. | Label profile and planning views as synthetic demo data; do not add real/prefilled health records. |
| Retryable network errors | Diary and grocery already expose retry. Planner errors are shown without a dedicated retry action. Purges preserve local state on failure and can be retried by repeating the delete action. | Add a planner retry action and focused checks for failed/pending retry. Preserve purge-before-local-delete ordering. |
| Withdrawal and deletion | Diary and grocery purges precede local profile/consent deletion; partial purge failure leaves local state intact. | Preserve this invariant, make retry state clear, and test failure after one purge succeeds. |
| Sensitive data protection | Profile and consent use Expo SecureStore; no credentials/tokens are present. API logs contain method/path/error type, not request bodies. | Keep profile in SecureStore, never log profile/consent/request payloads, and store no credential/token until a provider is selected. |

## Interface and structure

- `app/src/features/onboarding/consent-model.cjs` owns consent version, required choices, receipt validation, and the disclosure copy used by screens.
- `app/src/services/profile-storage.js` persists profiles and local consent receipts with SecureStore. A receipt is device-local and is not account-linked.
- Onboarding, profile, and planner screens own their presentation. `AppShell` owns cross-screen navigation and purge sequencing.
- Preserve existing `/api/v1` routes. Do not create authentication or profile endpoints in this provider-independent increment.
- Future authenticated profile routes must derive the principal from a server-verified provider credential, scope every read/write/delete to that principal, ignore client-supplied owner IDs, and reject expired sessions. Never treat `X-Demo-Namespace` as proof of identity or ownership.

Example contract style:

```js
const receipt = createConsentRecord(choices, new Date('2026-11-17T00:00:00.000Z'));
// { version, acceptedAt, choices }; throws unless every required choice is true.
```

## Commands

- Unit: `npm run test:unit`
- UI: `npm run test:ui`
- API: `npm run test:api`
- Android bundle: `npx expo export --platform android`
- Dependency audit: `npm audit --audit-level=high`
- Diff hygiene: `git diff --check`

## Testing strategy

Test consent choice validation, timestamp/version validation and stale-receipt rejection; profile validation remains covered by the profile model tests. Test planner network failure and retry, and test that local state is never cleared before both demo purges succeed, including a retry after partial remote success. Existing tests cover demo route availability and namespace isolation; those are not authentication or ownership tests. Session-expiry and cross-account ownership tests cannot be meaningful until an identity provider and authenticated profile API exist.

## Boundaries

- Always: synthetic values only; explicit demo labels; local profile/consent in SecureStore; purge remote demo collections before local delete; no sensitive logs.
- Ask/decide before: selecting an identity provider, issuing credentials, adding auth SDKs, changing data retention, or using real health data.
- Never: mock login presented as secure auth; client-controlled namespace as authorization; production auth without a selected provider; legal-compliance claims based on this consent UI.

## Success criteria

- Required consent cannot be skipped and its choices/version/time are stored and validated locally.
- Users can inspect the consent disclosure and navigate back during onboarding.
- Demo profiles are visibly labeled and remain synthetic-only.
- Planner network failures show a direct retry action.
- A failed diary or grocery purge leaves profile and consent state intact and retryable.
- No provider-dependent authentication, session, or ownership claim is added.
- The provider and privacy/legal decisions remain clearly documented as blockers to real data and production identity.

## Out of scope / open decisions

- Provider and account credential issuance are not selected in the repository or issue comments. The repo must not contain production credentials; the team must select a provider and configure secrets through its approved secret store before implementation.
- Session refresh, expiry, logout, account deletion, server-side consent receipts, ownership checks, and account data export require the selected provider plus a reviewed server-side data model.
- Consent wording, retention, deletion exceptions, and real-data use require review by the project's privacy/legal owner, which is not assigned in the current security documentation.
- Do not add real health data or claim legal/privacy compliance in this increment.

## Contract for the later authenticated increment (design only)

These routes are proposed interfaces, not endpoints available in this build. Registration, login, refresh and logout must use the selected provider's supported mobile flow and server verification. The team must decide redirect configuration, refresh/revocation semantics and credential provisioning before those interfaces can be finalized; this increment issues no token and stores no credential.

| Proposed authenticated interface | Required behavior before enabling |
|---|---|
| `GET /api/v1/me/profile`, `PUT /api/v1/me/profile` | Derive owner from verified identity, validate allowlisted profile fields, reject client owner IDs; expire invalid sessions with `401`. |
| `GET /api/v1/me/consent`, `PUT /api/v1/me/consent` | Store the version, explicit choices and server-recorded time against the verified account. Old consent must block consent-dependent processing. |
| `DELETE /api/v1/me/consent` | Stop consent-dependent processing and perform the approved linked-data lifecycle; retain local retry context until server confirmation. |
| `GET /api/v1/me/data`, `DELETE /api/v1/me` | Export/delete only the verified owner's profile, consent and linked data. Define deletion receipts, retry/idempotency and legally retained fields after policy review. |

Cross-account tests must tamper with path, body and namespace identifiers and prove they cannot select another account. Logout/expiry tests must prove credentials are removed from secure storage, private in-memory state is cleared and late responses from the previous session cannot repopulate it. These tests and behaviors are blocked, not claimed as passing in this build.

## Synthetic walkthrough

There is no test account or login. Use the local demo API configuration in README, enable demo storage only for synthetic testing, and run `npm start`.

1. Start with no consent receipt: Continue is disabled until all required choices are checked. Read the disclosure, accept and enter invented values, for example age 30, height 170 cm and weight 65 kg.
2. Save the demo profile, open Profile and inspect the DEMO label, receipt version and device timestamp. Use the review action and Back to return. Restart to verify the stored receipt is recognized; legacy `accepted-v1` prompts for fresh consent rather than inventing a timestamp.
3. Generate a plan with the API unavailable; the retry action remains available. Restore the API and retry. No real information may be entered in these checks.
4. Create synthetic diary/grocery data. Interrupt the API and request deletion or withdrawal: local profile/consent remain and an error is shown. Restore the API and repeat the action; both collections are purged before local deletion and a success message is shown. Deleting only the profile retains consent; withdrawing removes it.

## Automated verification

Unit tests cover required consent choices, version/time validation, stale receipts, profile bounds and purge ordering. UI/service tests cover receipt persistence, onboarding/review navigation, demo labeling, planner retry and local consent preservation after a partially successful purge. Existing API tests verify demo route gates and namespace isolation only.

Executed checks: `npm run test:unit`, `npm run test:ui`, `npm run test:api`, `npx expo export --platform android`, `npm audit --audit-level=high`, and `git diff --check`. Audit reports 22 moderate findings and no high/critical findings; the existing dependency review records their disposition. Android export is a bundle check, not a physical-device walkthrough. The walkthrough above is a guide, not a claim of a device test in this session.
