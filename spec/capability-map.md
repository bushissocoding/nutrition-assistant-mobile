# Capability Map: Nutrition Assistant App Completion — V1

This initiative completes the supplied mobile app flows as a clearly labeled demonstration prototype. Existing API, profile, consent, and nutrition boundaries remain in force.

| Module id | Responsibility | Depends on |
|---|---|---|
| `onboarding-profile` | Splash, welcome, demo account forms/recovery, consent, and health assessment | Existing app shell, SecureStore profile/consent, API client |
| `nutrition-workflows` | Home shortcuts, meal plan and recipe, diary, daily report, and grocery/pantry workflows | `onboarding-profile`, existing `/api/v1` nutrition/diary/grocery contracts |
| `appointments-chat` | Provider discovery, appointment/payment preview, appointment list/cancel, assistant and gated provider chat | `onboarding-profile`, app-shell route state |
| `health-records-personalization` | Profile adjustment, scan-state preview, health record summary and local PDF export | `onboarding-profile`, Expo device file/share APIs |
| `notifications-settings` | Sample notifications/read state, app settings, consent review and demo data deletion | `onboarding-profile`, app-shell navigation |

## Build order

`onboarding-profile` → `nutrition-workflows` → (`appointments-chat`, `health-records-personalization`) → `notifications-settings` → integrated acceptance checks.

The app shell, versioned `/api/v1` client, demo storage boundary, profile model and consent lifecycle already exist. This work preserves those interfaces; it adds no server identity, real booking/payment, remote messaging, push service, or clinical image extraction.

## Shared constraints

- Use synthetic data and label all account, provider, booking, payment and communication screens as previews where no real service exists.
- Do not collect or export real patient data. A PDF is generated and shared locally from the demo profile only; escape all user-entered text included in PDF HTML.
- Keep medical scan results empty unless the user supplies clearly synthetic demo values; do not claim image recognition or clinical interpretation.
- Preserve allergies and planner hard limits, server-calculated diary nutrients, source attribution, timezone rules, idempotency, and demo-only API route gating.
- Preserve all `/api/v1` request and response contracts. No server schema or CI changes are in scope.
