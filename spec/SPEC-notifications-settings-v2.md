# Spec: `notifications-settings` — V2

Status: implementation complete in repository; live Expo credentials/device delivery and Supabase RLS checks remain release gates.

## Objective

Replace sample notifications and device-only settings with account-owned event notices, server read state, notification categories, privacy controls and Expo push token lifecycle. In-app events remain available even when push is denied. Appointment, payment and doctor-message events are delivered through a durable outbox; push payloads contain no health details or message text.

## Tech Stack

Expo SDK 58 / React Native with `expo-notifications`, Express `/api/v1`, Supabase Postgres/RLS and a server worker using Expo Push Service HTTPS endpoints. Push is opt-in and disabled until the user grants device permission. The EAS project id is public app configuration; FCM/APNs credentials and any Expo push access token remain operator-managed. If push configuration is absent, in-app events still work.

## Commands

- Unit/API: `npm run test:unit` and `npm run test:api`
- Focused UI: `npx jest app/src/features/notifications/NotificationsScreen.test.js app/src/features/settings/SettingsScreen.test.js app/src/app/AppShell.test.js --runInBand`
- Android JS bundle: `npx expo export --platform android`
- Native push smoke: development build on a physical/device emulator with push credentials.
- Migration/whitespace: repository unit suite and `git diff --check`

## Project Structure

- `server/src/routes/notifications.js` validates notifications, preferences and token APIs.
- `server/src/repositories/notification-repository.js` uses owner-scoped reads and service-only worker RPCs.
- `server/src/services/expo-push-gateway.js` sends minimal payloads and checks tickets/receipts.
- `server/src/services/push-worker.js` claims durable jobs with bounded retries and receipt processing; `server/push-worker.js` is its separately supervised process entry point.
- `app/src/features/notifications/NotificationsScreen.js` renders account events and read state.
- `app/src/features/settings/SettingsScreen.js` edits saved categories/privacy preferences and push opt-in.
- `app/src/services/push-notifications.js` requests permission and registers/revokes device tokens.
- `supabase/migrations/` owns notification events, preferences, tokens, outbox and lifecycle triggers.

## Code Style

Keep event text generic and the push payload free of medical/message content:

```js
await pushGateway.send({
  to: token,
  title: 'Nutrition Assistant',
  body: 'Bạn có thông báo mới. Mở ứng dụng để xem.',
});
```

Persist the in-app event before enqueueing delivery. Retry temporary provider failures with bounded exponential backoff; disable invalid device tokens after provider feedback.

## Testing Strategy

- Unit tests: category defaults, read/unread state, preference normalization, token validation, retry schedule and Expo ticket/receipt normalization.
- API tests: account isolation, token ownership/revocation, preference bounds, read own event, no arbitrary event creation, no push when disabled, safe failure handling.
- Migration tests: RLS, triggers, outbox idempotency, service-only claims and event copy contains no message body.
- UI tests: persisted notification list, mark-one/all read, settings preference save/retry, permission denial and deep-link/open behavior.
- Push/network delivery and device credential setup require a real Expo project and native build; local tests inject the provider and do not claim device delivery.

## Boundaries

- **Always:** persist in-app event first; allow per-category opt-in/out; request push permission only after user action; keep tokens tied to verified account/device and remove on logout; send minimal generic push data with no medical condition, values, appointment symptoms or chat text; keep account event state server-owned; process delivery receipts and remove invalid tokens; use synthetic tests.
- **Ask first:** none for this implementation; the user delegated approval of provider/config choices.
- **Never:** treat an Expo ticket as device delivery; use push as the only notification channel; expose another account's events/preferences/tokens; silently enable push; put health or chat content in a lock-screen payload.

## Success Criteria

- Booking/payment/message event triggers create one durable owner notification and delivery job for each intended recipient.
- Users can page/filter account events, mark one/all read, and see the same read state after restart or sign-in on another device.
- Settings save notification categories, push choice and privacy preferences to the account; invalid or unauthenticated writes fail closed.
- A device can register and revoke its Expo token; logout/account deletion removes owned tokens.
- Worker claims jobs idempotently, sends only to opted-in devices, retries temporary failures with limits, checks Expo tickets/receipts and retires `DeviceNotRegistered` tokens.
- If push is unavailable, stored in-app notifications remain usable and settings explain that push is not currently available.
- No PII, health details or message text appears in push requests, logs or test data.

## Out of Scope (Deferred)

- Marketing campaigns, SMS/email notification delivery and clinician-specific pager escalation.
- Scheduled reminders that require a deployed scheduler; this version covers committed business events.
- Real push activation until the Expo project and FCM/APNs credentials are supplied.

## Open Questions

None. Expo Push is selected for the current Expo client; user delegation covers provider selection.

## Source References

- [Expo Notifications SDK](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)
- [Expo Push Service: sending, retries and receipts](https://docs.expo.dev/push-notifications/sending-notifications/)
