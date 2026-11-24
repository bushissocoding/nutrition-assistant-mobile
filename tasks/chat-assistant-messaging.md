# Tasks: `chat-assistant-messaging`

Spec: `spec/SPEC-chat-assistant-messaging-v2.md`.

- [ ] 1. Add owner-scoped assistant threads/turns and appointment message schema, RLS, authorization/idempotency RPCs, and migration contract tests.
  - Acceptance: patient/provider can access only eligible appointment threads; assistant turns are owner-only; retries do not duplicate turns.
  - Verify: focused migration/repository tests and full unit suite.
- [ ] 2. Implement chat repository/routes for doctor inbox, history, send, assistant consent and turn state.
  - Acceptance: route boundary rejects malformed/unauthorized requests; pending/failed assistant turns can retry safely.
  - Verify: API route tests for both roles, nonparticipants, appointment state and consent.
- [ ] 3. Implement configurable stateless OpenAI Responses adapter and server chat safety/rate limits.
  - Acceptance: `store:false`, fixed provider host, bounded history/output, safe timeout/provider errors and no request-body logs.
  - Verify: injected fetch tests including malformed, timeout and missing-config cases.
- [ ] 4. Replace local chat UI with persisted assistant/doctor conversation states and explicit AI-processing disclosure.
  - Acceptance: history reloads, send errors retry, no fabricated replies, doctor chat remains appointment-gated.
  - Verify: focused chat/AppShell UI tests and Android export.
- [ ] 5. Register chat export/deletion lifecycle, update docs/capability map, review and commit.
  - Acceptance: export includes only the caller's chat; deletion cascades owned messages/consent; API contract remains `/api/v1`.
  - Verify: required unit/UI/API checks, Android export and `git diff --check`.

## Checkpoint

- [ ] Patient/provider chat and AI assistant remain private, idempotent and honest when providers are unavailable; live RLS/API checks are reported separately.
