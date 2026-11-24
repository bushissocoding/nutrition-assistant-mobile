const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createCareBookingRouter, createPayosWebhookRouter } = require('../src/routes/care-bookings');
const { appointmentRequestHash, normalizeBookingInput } = require('../src/services/care-bookings');
const { signPayosData } = require('../src/services/payments');

const user = { id: '7f35a680-01cf-4db5-b92c-ea734130c17c' };
const providerId = '82b4fefe-81fd-44f1-8be0-905e33f10b16';
const slotId = '92b4fefe-81fd-44f1-8be0-905e33f10b16';
const appointmentId = 'a2b4fefe-81fd-44f1-8be0-905e33f10b16';
const now = new Date('2026-11-24T00:00:00.000Z');
const consent = (_req, _res, next) => next();

async function withServer(router, run) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.auth = { user }; req.userDatabase = { scoped: true }; next(); });
  app.use('/api/v1/me/care', router);
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  try { await run(`http://127.0.0.1:${server.address().port}/api/v1/me/care`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test('provider directory validates safe filters and returns authoritative pagination', async () => {
  const calls = [];
  const repository = { async listVerifiedProviders(input) { calls.push(input); return { items: [{ id: providerId, displayName: 'Nguyễn An', verificationStatus: 'verified' }], total: 11, limit: input.limit, offset: input.offset }; } };
  await withServer(createCareBookingRouter({ repository, requireCurrentConsent: consent }), async base => {
    const response = await fetch(`${base}/providers?q=Nguy%E1%BB%85n%20An&limit=5&offset=5`);
    assert.deepEqual(await response.json(), { items: [{ id: providerId, displayName: 'Nguyễn An', verificationStatus: 'verified' }], total: 11, limit: 5, offset: 5, hasMore: true });
    const invalid = await fetch(`${base}/providers?q=x%2Cverification_status.eq.pending`);
    assert.equal(invalid.status, 400);
    assert.equal(calls.length, 1);
  });
  assert.deepEqual(calls[0], { db: { scoped: true }, query: 'Nguyễn An', specialty: '', limit: 5, offset: 5 });
});

test('provider application accepts only bounded profile and qualification fields', async () => {
  const calls = [];
  const provider = { id: providerId, verificationStatus: 'pending', credentials: { reviewStatus: 'pending' } };
  const repository = { async saveProviderApplication(input) { calls.push(input); return provider; } };
  await withServer(createCareBookingRouter({ repository, requireCurrentConsent: consent }), async base => {
    const invalid = await fetch(`${base}/provider-profile`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile: { displayName: 'An', specialty: 'Nutrition', bio: '', experienceYears: 1, feeVnd: 1, verificationStatus: 'verified' }, credentials: { licenseNumber: 'ABC', region: 'VN' } }) });
    assert.equal(invalid.status, 400);
    const saved = await fetch(`${base}/provider-profile`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile: { displayName: 'Nguyễn An', specialty: 'Dinh dưỡng', bio: '', experienceYears: 1, feeVnd: 200000 }, credentials: { licenseNumber: 'ABC-123', region: 'Việt Nam' } }) });
    assert.equal(saved.status, 200);
    assert.deepEqual(await saved.json(), { provider });
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].userId, user.id);
});

test('availability ranges are clamped to future and limited to seven days', async () => {
  const calls = [];
  const repository = { async listAvailability(input) { calls.push(input); return []; } };
  await withServer(createCareBookingRouter({ repository, requireCurrentConsent: consent, now: () => now }), async base => {
    const valid = await fetch(`${base}/providers/${providerId}/availability?from=2026-11-25T00%3A00%3A00.000Z&to=2026-12-02T00%3A00%3A00.000Z`);
    assert.equal(valid.status, 200);
    const tooWide = await fetch(`${base}/providers/${providerId}/availability?from=2026-11-25T00%3A00%3A00.000Z&to=2026-12-03T00%3A00%3A00.000Z`);
    assert.equal(tooWide.status, 400);
  });
  assert.deepEqual(calls[0], { db: { scoped: true }, providerId, from: '2026-11-25T00:00:00.000Z', to: '2026-12-02T00:00:00.000Z' });
});

test('booking hashes server-normalized input, requires a stable idempotency key, and reports replay status', async () => {
  const calls = [];
  const appointment = { id: appointmentId, status: 'awaiting_payment' };
  const repository = { async createAppointment(input) { calls.push(input); return { appointment, replayed: input.requestKey === 'appointment-intent-1' }; } };
  const body = { providerId, slotId, patientName: ' Nguyễn An ', phone: '+84901234567', symptomNote: '  Mệt   sau ăn ', providerSharingAccepted: true };
  const normalized = normalizeBookingInput(body);
  await withServer(createCareBookingRouter({ repository, requireCurrentConsent: consent }), async base => {
    const missingKey = await fetch(`${base}/appointments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(missingKey.status, 400);
    const created = await fetch(`${base}/appointments`, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': 'appointment-intent-1' }, body: JSON.stringify(body) });
    assert.equal(created.status, 200);
    assert.deepEqual(await created.json(), { appointment, replayed: true });
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].userId, user.id);
  assert.deepEqual(calls[0].input, normalized);
  assert.equal(calls[0].requestHash, appointmentRequestHash(normalized));
});

test('patient and provider appointment lists use authenticated owners and reject malformed cancellation requests', async () => {
  const calls = [];
  const repository = {
    async listPatientAppointments(input) { calls.push(['patient', input]); return { items: [], total: 0, limit: input.limit, offset: input.offset }; },
    async cancelAppointment(input) { calls.push(['cancel', input]); return { appointment: { id: appointmentId, status: 'cancelled' }, actor: 'patient' }; },
  };
  await withServer(createCareBookingRouter({ repository, requireCurrentConsent: consent }), async base => {
    assert.equal((await fetch(`${base}/appointments?limit=5`)).status, 200);
    const invalid = await fetch(`${base}/appointments/${appointmentId}/cancel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'unknown', note: '' }) });
    assert.equal(invalid.status, 400);
    const cancelled = await fetch(`${base}/appointments/${appointmentId}/cancel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'illness', note: '' }) });
    assert.equal((await cancelled.json()).appointment.status, 'cancelled');
  });
  assert.deepEqual(calls, [
    ['patient', { db: { scoped: true }, userId: user.id, limit: 5, offset: 0 }],
    ['cancel', { db: { scoped: true }, userId: user.id, appointmentId, cancellation: { reason: 'illness', note: '' }, actor: 'patient' }],
  ]);
});

test('payment intent creates one hosted link from server-owned amount and returns only after persistence', async () => {
  const calls = [];
  const payment = { id: 'payment-1', appointmentId, orderCode: 1800000001, amount: { value: 250000, currency: 'VND' }, status: 'creating_link', holdExpiresAt: '2026-11-24T00:20:00.000Z' };
  const repository = {
    async createIntent(input) { calls.push(['intent', input]); return { payment, replayed: false }; },
    async finishLink(input) { calls.push(['finish', input]); },
    async getOwnPayment(input) { calls.push(['read', input]); return { payment: { ...payment, status: 'pending', checkoutUrl: 'https://pay.payos.vn/web/synthetic-link' }, appointmentStatus: 'awaiting_payment' }; },
    async markReconciliationRequired() { assert.fail('successful provider response must not be reconciled'); },
  };
  const gateway = { configured: true, async createPaymentLink(input) { calls.push(['provider', input]); return { paymentLinkId: 'synthetic-link', checkoutUrl: 'https://pay.payos.vn/web/synthetic-link', qrCode: null }; } };
  await withServer(createCareBookingRouter({ repository, paymentRepository: repository, payosGateway: gateway, requireCurrentConsent: consent }), async base => {
    const response = await fetch(`${base}/appointments/${appointmentId}/payment`, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': `appointment-payment-${appointmentId}` }, body: '{}' });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).payment.status, 'pending');
  });
  assert.deepEqual(calls.map(([name]) => name), ['intent', 'provider', 'finish', 'read']);
  assert.deepEqual(calls[0][1], { db: { scoped: true }, appointmentId, idempotencyKey: `appointment-payment-${appointmentId}` });
  assert.equal(calls[1][1].amount, 250000);
  assert.equal(calls[1][1].orderCode, 1800000001);
});

test('payment link replay never calls PayOS twice and returns a pending retry response', async () => {
  let providerCalls = 0;
  const repository = {
    async createIntent() { return { replayed: true, payment: { id: 'payment-1', appointmentId, status: 'creating_link' } }; },
  };
  const gateway = { configured: true, async createPaymentLink() { providerCalls += 1; throw new Error('must not create twice'); } };
  await withServer(createCareBookingRouter({ repository, paymentRepository: repository, payosGateway: gateway, requireCurrentConsent: consent }), async base => {
    const response = await fetch(`${base}/appointments/${appointmentId}/payment`, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': `appointment-payment-${appointmentId}` }, body: '{}' });
    assert.equal(response.status, 202);
    assert.equal((await response.json()).payment.status, 'creating_link');
  });
  assert.equal(providerCalls, 0);
});

test('appointment cancellation also cancels an existing unpaid hosted link and reports unresolved provider state', async () => {
  const calls = [];
  const repository = { async cancelAppointment() { return { appointment: { id: appointmentId, status: 'cancelled' }, actor: 'patient' }; } };
  const paymentRepository = { async getCancelledPaymentLink(input) { calls.push(['lookup', input]); return { orderCode: 1800000001, paymentLinkId: 'synthetic-link' }; } };
  const payosGateway = { async cancelPaymentLink(input) { calls.push(['cancel', input]); throw new Error('provider unavailable'); } };
  await withServer(createCareBookingRouter({ repository, paymentRepository, payosGateway, requireCurrentConsent: consent }), async base => {
    const response = await fetch(`${base}/appointments/${appointmentId}/cancel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'schedule-change', note: '' }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).paymentLinkCancellation, 'needs_reconciliation');
  });
  assert.deepEqual(calls, [
    ['lookup', { appointmentId }],
    ['cancel', { orderCode: 1800000001 }],
  ]);
});

test('PayOS webhook rejects a bad signature and hands only normalized signed events to processing', async () => {
  const checksumKey = 'synthetic-checksum-key';
  const calls = [];
  const repository = { async processVerifiedEvent(event) { calls.push(event); return 'paid'; } };
  const data = { orderCode: 1800000001, amount: 250000, currency: 'VND', paymentLinkId: 'synthetic-link', reference: 'synthetic-ref', code: '00', transactionDateTime: '2026-11-24 10:00:00' };
  const payload = { code: '00', desc: 'success', success: true, data, signature: signPayosData(data, checksumKey) };
  await withServer(createPayosWebhookRouter({ paymentRepository: repository, checksumKey }), async base => {
    const invalid = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, signature: '0'.repeat(64) }) });
    assert.equal(invalid.status, 400);
    const valid = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), { code: '00', desc: 'success', data: { outcome: 'paid' } });
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].orderCode, data.orderCode);
  assert.equal(calls[0].paymentLinkId, data.paymentLinkId);
});
