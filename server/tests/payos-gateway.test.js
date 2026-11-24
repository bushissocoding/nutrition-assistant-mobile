const test = require('node:test');
const assert = require('node:assert/strict');
const { createPayosGateway } = require('../src/services/payos-gateway');

const config = {
  clientId: 'synthetic-client', apiKey: 'synthetic-api-key', checksumKey: 'synthetic-checksum-key',
  returnUrl: 'https://app.example.test/payments/return', cancelUrl: 'https://app.example.test/payments/cancel',
};

test('creates a PayOS hosted payment link using the signed V2 request and trusted amount', async () => {
  let request;
  const gateway = createPayosGateway({ config, fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, json: async () => ({ code: '00', data: { orderCode: 1800000001, amount: 250000, paymentLinkId: 'synthetic-link', checkoutUrl: 'https://pay.payos.vn/web/synthetic-link', qrCode: 'synthetic-qr' } }) };
  } });
  const result = await gateway.createPaymentLink({ orderCode: 1800000001, amount: 250000, expiresAt: '2026-11-24T10:50:00.000Z' });
  assert.equal(request.url, 'https://api-merchant.payos.vn/v2/payment-requests');
  assert.equal(request.options.headers['x-client-id'], config.clientId);
  assert.equal(request.options.headers['x-api-key'], config.apiKey);
  const body = JSON.parse(request.options.body);
  assert.equal(body.orderCode, 1800000001);
  assert.equal(body.amount, 250000);
  assert.equal(body.description, 'APT000001');
  assert.equal(body.signature.length, 64);
  assert.equal(body.expiredAt, Math.floor(Date.parse('2026-11-24T10:50:00.000Z') / 1000));
  assert.deepEqual(result, { paymentLinkId: 'synthetic-link', checkoutUrl: 'https://pay.payos.vn/web/synthetic-link', qrCode: 'synthetic-qr' });
});

test('rejects invalid or mismatched provider link responses and never accepts arbitrary checkout hosts', async () => {
  for (const data of [
    { orderCode: 1, amount: 250000, paymentLinkId: 'link', checkoutUrl: 'javascript:alert(1)' },
    { orderCode: 2, amount: 250000, paymentLinkId: 'link', checkoutUrl: 'https://pay.payos.vn/web/link' },
    { orderCode: 1, amount: 1, paymentLinkId: 'link', checkoutUrl: 'https://pay.payos.vn/web/link' },
  ]) {
    const gateway = createPayosGateway({ config, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ code: '00', data }) }) });
    await assert.rejects(gateway.createPaymentLink({ orderCode: 1, amount: 250000, expiresAt: '2026-11-24T10:50:00.000Z' }), { code: 'PAYOS_INVALID_RESPONSE' });
  }
});

test('does not send requests when PayOS is unconfigured and maps provider failures safely', async () => {
  const unavailable = createPayosGateway({ config: null, fetchImpl: async () => assert.fail('must not fetch') });
  await assert.rejects(unavailable.createPaymentLink({}), { code: 'PAYMENT_UNAVAILABLE' });
  const failing = createPayosGateway({ config, fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ desc: 'secret provider response' }) }) });
  await assert.rejects(failing.createPaymentLink({ orderCode: 1, amount: 250000, expiresAt: '2026-11-24T10:50:00.000Z' }), error => error.code === 'PAYOS_UNAVAILABLE' && !error.message.includes('secret'));
});

test('cancels only a valid hosted order code through the PayOS cancellation endpoint', async () => {
  let request;
  const gateway = createPayosGateway({ config, fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, json: async () => ({ code: '00', data: { orderCode: 1800000001, status: 'CANCELLED' } }) };
  } });
  assert.deepEqual(await gateway.cancelPaymentLink({ orderCode: 1800000001 }), { orderCode: 1800000001, status: 'cancelled' });
  assert.equal(request.url, 'https://api-merchant.payos.vn/v2/payment-requests/1800000001/cancel');
  assert.deepEqual(JSON.parse(request.options.body), { cancellationReason: 'Appointment cancelled' });
  await assert.rejects(gateway.cancelPaymentLink({ orderCode: 0 }), { code: 'INVALID_PAYMENT_EVENT' });
});
