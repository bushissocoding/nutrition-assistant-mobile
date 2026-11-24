# Tasks: `notifications-settings`

Spec: `spec/SPEC-notifications-settings-v2.md`.

- [ ] 1. Add notification event, preferences, push token, outbox and receipt schema/RLS plus business-event triggers.
  - Acceptance: booking, payment and doctor-message changes create deterministic minimal events; no message body enters notice or push payload.
  - Verify: migration contract tests for RLS, idempotency and triggers.
- [ ] 2. Implement owner APIs for paginated events/read state, preferences and device token lifecycle.
  - Acceptance: caller can only read/update own state; unknown event IDs and invalid tokens fail closed.
  - Verify: focused API/repository tests.
- [ ] 3. Implement Expo Push gateway and durable worker with bounded retries and receipt processing.
  - Acceptance: only opted-in tokens receive generic content; temporary errors retry and invalid tokens are retired.
  - Verify: injected gateway/worker tests for success, rate limits, retries and receipts.
- [ ] 4. Replace sample notification UI and persist settings/push permissions in the account.
  - Acceptance: read state syncs across sessions; push is opt-in; settings remain useful when push is unavailable.
  - Verify: focused notification/settings/AppShell UI tests and Android export.
- [ ] 5. Connect chat event triggers, account export/deletion lifecycle, docs and review.
  - Acceptance: event sources and lifecycle are complete; no sensitive payloads are logged or sent through push.
  - Verify: required unit/UI/API checks, Android export, catalog validation and diff hygiene.

## Checkpoint

- [ ] In-app events are durable; push delivery is best-effort and never misreported as confirmed device delivery.
