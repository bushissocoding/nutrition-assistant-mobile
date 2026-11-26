# Specification: App Completion V2

## 1. Problem statement

The completed demo supports the requested nutrition, health-profile, appointment-preview, chat-preview, notification, settings, and local PDF workflows. Two visible behaviors still under-deliver: the Home week selector shows an empty message for every non-today date without querying the diary API, and the dashboard's seven-day chart draws only today's bar. Notification read state also resets when the process restarts. These gaps make the demo's history and read-state controls feel nonfunctional.

Real account ownership, provider services, payment processing, clinician messaging, lab OCR, and licensed official food data cannot be completed truthfully from this repository without operator/provider decisions, credentials, access controls, rights, or qualified review. V2 documents those blockers and preserves their current preview labels.

## 2. Goals and non-goals

### Goals

- Load the selected Home calendar day's diary from the existing API, using the selected local date and the device's IANA timezone.
- Populate the dashboard's seven-day chart with daily totals returned by the API, including clear loading, partial failure, empty, and retry states.
- Keep daily totals and item counts sourced from API responses. Do not derive nutrient totals from client food rows.
- Persist only synthetic notification read/unread flags in device SecureStore; retain notification content as the existing in-code samples.
- Document which production integrations remain blocked and the service choice, credentials, data rights, controls, and reviews needed for each.
- Preserve existing `/api/v1` routes/contracts, demo-only data boundary, allergy/hard-limit rules, and non-clinical wording.

### Non-goals

- No production identity, account recovery delivery, server profile storage, or account ownership.
- No provider directory/booking, payment gateway, clinician chat, push notifications, or support inbox.
- No camera, image upload, OCR, diagnosis, clinical interpretation, or real patient data.
- No importing or relabeling food data whose reuse rights are unverified.
- No new dependencies, server schema/routes, or real health information in fixtures.

## 3. User-visible behavior

### Home week selector

- Each calendar tab represents a full local date (`YYYY-MM-DD`), not just a day-of-month number.
- Selecting today displays the existing AppShell diary response and loading/error/retry behavior.
- Selecting another visible date queries `GET /api/v1/meal-entries` with that date and the device timezone. Entries are ordered and rendered into the matching meal slots; an empty successful response says no entries exist for that date.
- A request failure is not shown as an empty day. The screen gives a date-specific error and retry action; a late response for a prior selection must not replace the current selection.

### Seven-day nutrition report

- The chart covers the latest seven local calendar dates, with one server-total value per day for the selected nutrient.
- The current day uses the totals already provided by AppShell. The other dates are loaded from the same diary API and timezone.
- Zero-entry days have a zero-height bar. Failed days remain distinguishable from zero and can be retried; successful dates remain visible if another date fails.
- Loading and partial-failure text is accessible. The chart retains the non-clinical estimate disclaimer and does not imply clinical monitoring.
- Metric cards and the logged-item count continue to describe today's API response.

### Notification read state

- Opening a notice marks only that sample notice as read; “mark all read” marks all sample notices as read.
- Read/unread flags persist locally across component remounts and app restarts. Notification text, appointment details, and delivery history are not persisted by this change.
- Stored data is validated against known sample IDs. Malformed or outdated values fall back to the initial sample read state.
- Storage failures keep the current in-memory interaction available and surface a visible retry/diagnostic state; no error is silently discarded.

## 4. Data and interfaces

- Use the existing `api.getMealEntries({ date, timeZone })`; do not add or alter server routes.
- Use the existing response `{ date, timeZone, items, totals, pagination, disclaimer }`; chart values come from `totals`.
- Add a deterministic local-date helper that avoids UTC date shifts and validates stable `YYYY-MM-DD` keys.
- Add an app storage service that stores only notification `{ id, unread }` values through `expo-secure-store`.
- Existing test seams may inject/mimic the API and SecureStore. No new runtime dependency is permitted.

## 5. Failure and lifecycle handling

- Cancel/ignore obsolete Home and dashboard responses after selection changes or unmount.
- A single failed historical day does not erase other successful chart days. Retry reloads failed days and can safely reload the full history window.
- Today stays accurate after diary create/update/delete through the existing AppShell refresh; historical queries run when the user revisits Home or opens the report.
- SecureStore read parse/validation failure falls back to default notice state. Write failure is surfaced while preserving the current session state.
- Consent/profile deletion does not require a server purge for local synthetic notification flags; no remote notification data exists.

## 6. Acceptance criteria

- [x] Home selection uses complete date keys, sends the matching date/timezone, distinguishes empty from request failure, retries, and ignores stale responses.
- [x] Dashboard renders values from seven API date responses, uses API totals, retains successful partial data, and has loading/error/retry/empty behavior.
- [x] Timezone/date helper covers month/year and daylight-saving-safe local date stepping without UTC key drift.
- [x] Notification read flags validate, persist, restore, and report SecureStore failures.
- [x] Focused tests cover the date helper, Home, dashboard, and notification storage/UI behavior.
- [x] Existing required checks pass: `npm run test:unit`, `npm run test:ui`, and `npm run test:api`.
- [x] Existing nutrition provenance/catalog validation and Android Expo export still pass; docs match implementation.
- [x] No new dependency, generated bundle, real personal/health data, or server contract change is included.

## 7. External integration readiness

Production completion is blocked pending these explicit choices and inputs:

| Capability | Required decision/input | Minimum readiness before integration |
|---|---|---|
| Account/authentication and recovery | Identity provider, project/environment credentials, redirect/deep-link settings, email/SMS sender | Verified identity/ownership model, consent and data lifecycle, security/privacy review; implement issue #3 |
| Diary/grocery production persistence | Authenticated API/database host, server credentials, migration/backup operators | Per-account ownership and deletion/retention protections; keep demo namespaces disabled in production; issue #1 |
| Doctor search/booking and telehealth | Licensed provider/aggregator, provider directory and booking API credentials, service region and operator | Provider verification, cancellation/refund policy, access control, medical-service review |
| Payment | Approved payment processor, merchant account, sandbox/live keys, webhook endpoint | No client-side secret or card storage; backend transaction verification and refund/reconciliation procedures |
| Clinician chat and push notifications | Secure messaging and push providers, credentials, clinician/operator staffing | Identity-bound access, delivery/retention/escalation policy, consent, incident handling |
| Lab image capture/OCR | OCR/vendor choice and credentials, supported report formats, data region | Explicit consent, encrypted upload/retention/deletion, editable candidate extraction, qualified clinical validation; no diagnosis claim |
| Official Vietnam food catalog | Licensed source/export, record-level provenance, permitted redistribution terms | Rights confirmed for app and repository; nutrition review; issue #4 |
| Clinical meal planning | Intended population/clinical governance, target and allergy policy, qualified reviewers | Clinician-approved deterministic constraints and validation; issue #2 |
| Production release/security | Hosting/operator, domains, secrets/CI deployment identities, support owner | Threat model, independent security assessment, incident/backup plan, release/privacy review; issue #5 |

