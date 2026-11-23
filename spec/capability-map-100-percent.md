# Capability Map: App Completion V2

## Working assumptions

- “Hoàn thiện 100%” means every workflow that can be made truthful and testable inside this repository's current demo architecture, without inventing a production service or relaxing `CONSTRAINTS.md`.
- The prior completion on `codex/complete-app` is the baseline. This branch addresses the remaining local demo gaps and publishes a concrete external-integration readiness list.
- Existing `/api/v1` responses remain the source for diary entries and nutrient totals. Calendar dates are local dates paired with the device IANA timezone.
- Notifications remain synthetic examples. Their read/unread choice can be saved locally; no push delivery or real appointment event is implied.
- Real authentication, clinical use, provider booking, payment, telehealth, OCR, and authorized national food data require separately selected services, credentials, ownership controls, and applicable review.

## Capability map

| Module id | Responsibility | Current status | V2 dependency |
|---|---|---|---|
| `onboarding-profile` | Splash, account-form preview/recovery validation, consent, health assessment, local profile | Complete as a demo; identity service absent by design | None |
| `nutrition-workflows` | Meal plan, recipe preview, diary, grocery list and pantry, daily report | Complete within the current demo scope; historical dates are API-backed and failures are explicit | `diary-history`, current `/api/v1` contract |
| `diary-history` | Load dated diary responses and render a truthful 7-day chart | Complete; uses per-day API totals and the device IANA timezone | API client, AppShell's current-day cache |
| `appointments-chat` | Doctor list, appointment/payment preview, cancellation, gated chat, assistant FAQ | Complete as non-delivering preview | Provider identity, booking, payment, and messaging integrations remain external |
| `health-records-personalization` | Profile editing, synthetic lab preview, local medical-record PDF | Complete as a demo; no OCR/clinical interpretation | Qualified clinical review and image/OCR provider remain external |
| `notifications-settings` | Synthetic notifications, mark read, settings/help/privacy | Complete within the demo scope; only known sample IDs and unread flags persist in SecureStore | `notification-state-storage`, device SecureStore |
| `external-service-readiness` | Record integration decisions and credential/review requirements blocking production claims | Documented in V2 spec; external work remains blocked by provider/operator inputs | Issues #1–#5, architecture, repository constraints |

## Dependency map

```text
Existing local profile + current API contract
        ├── Home selected-day query ──┐
        ├── dashboard 7-day history ──┼── `diary-history`
        └── diary API totals ─────────┘

Synthetic notification samples → validated unread flags → SecureStore

Provider/identity/clinical/data decisions → documented external blockers
```

## Map review

- Every named feature in the supplied product brief maps to an existing module. The concrete local demo gaps found were date-history visibility and notification state durability; both now have implementation and focused acceptance coverage.
- The proposed scope uses already implemented API operations and Expo SecureStore. It adds no new dependency, server route, health interpretation, or real-data collection.
- The storage work is limited to synthetic notification read state; appointment, payment, chat, pantry, and medical scan examples retain their documented demo semantics.
- V2 acceptance verifies that partial history failures remain visible and retryable, invalid stored notification state falls back safely, and diary values/totals still come from the API.
- A production service cannot be selected from code alone. The readiness document must list the missing operator choices, service credentials, data rights, and review gates rather than falsely marking them complete.
