# Spec: `chat-assistant-messaging` — V2

Status: implementation complete in repository; live model credentials, provider staffing and Supabase RLS execution remain release gates.

## Objective

Replace the local chat preview with two account-bound experiences: a non-clinical AI nutrition assistant and direct text messaging between a patient and the provider attached to an eligible appointment. A chat is available only to its owner/participants; messages are persisted in Supabase, bounded, exportable and removed with the account. The assistant sends no profile, diary, record, appointment or other app data unless the user explicitly includes it in a message. The UI must state that messages are processed by the configured AI provider.

## Tech Stack

Expo SDK 58 / React Native 0.88, JavaScript, the existing authenticated `/api/v1` client, Express, Supabase Postgres/RLS, Node `fetch`, and the OpenAI Responses API through a server-only adapter. Configure `OPENAI_API_KEY` and a bounded `OPENAI_MODEL` on the server; no client key or arbitrary base URL. Set `store: false` and send the limited conversation history statelessly. Provider transport remains disabled with a safe `503` until credentials are configured.

## Commands

- Unit and API: `npm run test:unit` and `npm run test:api`
- Focused UI: `npx jest app/src/features/chat/ChatScreen.test.js app/src/app/AppShell.test.js --runInBand`
- Native JS bundle: `npx expo export --platform android`
- Migration/whitespace: repository unit suite and `git diff --check`

## Project Structure

- `server/src/routes/chat.js` validates owner/participant APIs.
- `server/src/repositories/chat-repository.js` owns scoped message reads and RPC calls.
- `server/src/services/assistant-provider.js` owns the model request and bounded assistant rules; `server/src/middleware/user-rate-limit.js` bounds per-account usage.
- `app/src/features/chat/ChatScreen.js` renders assistant and appointment conversations.
- `app/src/app/AppShell.js` supplies the authenticated account, selected conversation and navigation.
- `supabase/migrations/` owns conversation/message tables, consent and authorization RPCs.

## Code Style

Keep the server provider stateless and keep health context out unless explicitly typed by the user:

```js
const response = await fetch(OPENAI_RESPONSES_URL, {
  method: 'POST',
  headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
  body: JSON.stringify({ model, instructions, input: boundedHistory, store: false }),
  signal: AbortSignal.timeout(timeoutMs),
});
```

Doctor message create intents use a client-generated idempotency key. Route handlers validate input and return safe provider errors; logs never contain message bodies or tokens.

## Testing Strategy

- Domain/repository tests: message bounds, turn idempotency/replay, failed provider retry, history limits and account deletion/export.
- Route tests: bearer auth, consent, patient/provider eligibility, canceled/unpaid appointment rejection, payload validation, safe `503`, no model call before AI consent, and no cross-account read/write.
- Provider contract tests use injected `fetch`, synthetic responses, timeout and malformed output cases; no external credentials.
- UI tests cover explicit AI data-sharing consent, loading/retry, empty/error states, persistence after navigation, doctor-chat gate and send state.
- Actual Supabase RLS and live provider smoke require operator infrastructure and credentials and are recorded separately.

## Boundaries

- **Always:** keep model keys server-only; require versioned opt-in before the first AI request; disclose provider processing and advise users not to send identifiers or urgent symptoms; use `store: false`; send only the message history the user typed; keep doctor threads limited to the booking patient and assigned provider; persist idempotently; never log message content; use only synthetic fixtures.
- **Ask first:** none for this implementation; the user delegated decisions and dependency approval.
- **Never:** present generated text as diagnosis/treatment; automatically attach health profile, diary, labs or appointment details to AI input; allow doctor messaging for an unpaid, canceled or unrelated booking; claim messages are delivered when the database has not acknowledged them.

## Success Criteria

- A patient with an eligible confirmed/completed appointment can open and send text to only that appointment's provider; the provider can open the same thread from an authenticated inbox.
- Patient and provider messages are stored and retrievable after app restart, ordered deterministically, bounded to recent history, and idempotent on client retry.
- Unrelated users, unverified roles and ineligible appointment states cannot access a thread or send a message.
- Assistant use is unavailable until the user accepts the current AI-processing disclosure; acceptance can be withdrawn in Settings.
- The server sends a bounded stateless request with `store:false`, saves the response, handles provider failure without a false success, and never includes data beyond the explicit conversation text.
- Account export includes owned chat content; account deletion removes owned conversations/messages and AI consent.
- If `OPENAI_API_KEY` is missing or the provider fails, the UI reports a retryable unavailable state and does not fabricate a reply.

## Out of Scope (Deferred)

- Voice/video, file attachments, group chat, read receipts and external SMS/email delivery.
- Clinical triage, diagnosis, treatment, automated appointment advice or model-controlled actions.
- Live provider staffing and AI/provider credentials, which require operator setup.

## Open Questions

None. This spec follows the approved full-app capability map; user delegation covers the technical and provider choices.

## Source References

- [OpenAI Responses API: disabling stored response state](https://developers.openai.com/api/docs/guides/conversation-state?api-mode=responses)
- [OpenAI Responses API migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses?api-mode=responses.html)
