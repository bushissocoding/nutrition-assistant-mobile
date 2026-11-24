# Spec: appointment payments

Status: approved by the agent under the user's explicit delegation to approve implementation decisions (2026-11-24).

## Objective

Let a patient pay for an active appointment hold through PayOS hosted checkout. Persist payment state and receipt metadata in the account database; confirm an appointment only after a valid server-to-server PayOS webhook. The mobile app never collects card or bank credentials and never marks an appointment paid from a return URL.

## Decisions

- Use PayOS v2 payment requests over HTTPS with server-only Client ID, API key, and checksum key. The user app opens only the provider's `checkoutUrl` using an OS linking adapter; return/cancel URLs are navigation hints.
- Create one payment intent per appointment hold. Its order code is an integer in PayOS's documented 32-bit timestamp boundary; amount is copied from the server appointment snapshot, not the request.
- A server-only PayOS webhook validates the HMAC-SHA256 signature over PayOS's alphabetically sorted data fields using constant-time comparison. A payment succeeds only for a success event with a matching order code, exact amount, VND currency, known link, active hold, and matching appointment. Duplicate/replayed events are idempotent.
- Store minimal provider metadata and payment status; never store card/bank credentials or log webhook bodies. Do not trust client redirects, poll queries, or provider response descriptions as payment evidence.
- Expired/cancelled holds cannot be paid into confirmed appointments. The server records late/invalidly matched events for reconciliation but does not confirm the booking. Automatic refunds are not claimed; refund support needs operator policy/account capability.
- If PayOS credentials or callback URLs are absent, return an explicit unavailable result and leave the appointment unpaid.

## User stories / acceptance

1. A patient can start checkout only for their own unexpired `awaiting_payment` appointment with current consent. Retries use a stable idempotency key and return one payment link/intent.
2. A patient can view a private payment/appointment receipt/status. App success is shown only after the API returns the webhook-confirmed `confirmed` appointment/payment state.
3. A PayOS hosted link can be opened externally; app return/cancel links only refresh status and do not mutate it.
4. PayOS webhooks reject malformed or invalid signatures, unknown orders, mismatched amount/currency/link, invalid state transitions, and oversized payloads. Exact duplicate events return success without duplicate booking or payment changes.
5. A valid verified payment atomically transitions the payment and its appointment from pending/held to paid/confirmed and reserves the slot as booked.
6. Failure/cancel/expiration never marks an appointment paid; stale holds expire and reopen a slot according to the appointment lifecycle.
7. Private payment tables use RLS/owner filters. Webhook writes use a narrowly scoped service-side RPC. Patient export includes owned payment receipts; identity deletion cascades owned records after payment/legal retention is configured.
8. Configuration validation is strict and the provider adapter has injected-fetch tests. Missing PayOS credentials fail explicitly without fake checkout links.

## API and persistence

- Patient routes under `/api/v1/me/care/appointments/:id/payment`: `POST` starts or replays checkout; `GET` reads own status/receipt.
- Public webhook: `POST /api/v1/webhooks/payos`; bounded JSON body, no bearer auth, signature required.
- `appointment_payments`: owner, appointment, payment amount/currency, monotonic status, idempotency key, order code, provider payment link/checkout URL and timestamps. One row per appointment hold.
- `payment_webhook_events`: deduplication identity and processing result, with no raw webhook payload or personal banking fields.
- Security-definer database operations bind paid status to the matching payment/appointment row and are unavailable to `anon`/`authenticated`; server-only privileged client calls them after provider signature verification.

## Test plan

- Pure signing/canonicalization, configuration, payload validation, amount checks, time/state transition, and duplicate-event behavior.
- API tests for owner isolation, consent, idempotency, no confirmation from client redirects, signed success/failure/replay/invalid webhooks, and mismatched amount/order/link.
- Repository tests for owner-scoped status and export/deletion; SQL contract tests for grants, locks, and atomic appointment confirmation.
- UI tests for pending, opening hosted checkout, return refresh, retry, expiry, and success only after API-confirmed webhook state.
- Run repository-required unit/UI/API checks, Android export, catalog validation and diff hygiene. Live sandbox calls require merchant credentials unavailable in this repository.

## External gates

PayOS merchant and channel activation, credentials/checksum key, production HTTPS callback and return URLs, confirmed cancellation/refund and receipt/tax policy, and operator reconciliation process are deployment-owned prerequisites. Until configured and sandbox-verified, the integration must report unavailable and must not claim production payment readiness.

## Source

- [PayOS API: create/get/cancel payment links and webhooks](https://payos.vn/docs/api/)
- [PayOS webhook signature verification](https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/)
- [PayOS checkout flow](https://payos.vn/docs/)
