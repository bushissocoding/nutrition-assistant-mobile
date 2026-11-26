const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const {
  PaymentValidationError,
  canonicalizePayosData,
  normalizePayosWebhook,
  signPayosData,
  verifyPayosSignature,
} = require('../src/services/payments');

const checksumKey = 'synthetic-checksum-key';
const data = {
  orderCode: 1800000042,
  amount: 250000,
  description: 'APT0042',
  currency: 'VND',
  paymentLinkId: 'synthetic-link-123',
  reference: 'synthetic-bank-ref-123',
  transactionDateTime: '2026-11-24 10:30:00',
  code: '00',
  desc: 'Thành công',
};

function webhook(overrides = {}) {
  const payloadData = { ...data, ...overrides.data };
  return { code: '00', desc: 'success', success: true, data: payloadData, signature: signPayosData(payloadData, checksumKey), ...overrides.payload };
}

test('PayOS canonical data sorts keys and retains provider primitive values', () => {
  assert.equal(canonicalizePayosData({ z: 'z value', a: 2, m: null, b: true }), 'a=2&b=true&m=&z=z value');
  assert.equal(signPayosData(data, checksumKey), createHmac('sha256', checksumKey).update(canonicalizePayosData(data)).digest('hex'));
});

test('validates webhook HMAC with constant-time digest comparison and rejects altered payloads', () => {
  const signature = signPayosData(data, checksumKey);
  assert.equal(verifyPayosSignature(data, signature, checksumKey), true);
  assert.equal(verifyPayosSignature({ ...data, amount: 1 }, signature, checksumKey), false);
  assert.equal(verifyPayosSignature(data, 'a'.repeat(64), checksumKey), false);
  assert.equal(verifyPayosSignature(data, 'not-hex', checksumKey), false);
});

test('normalizes a successful signed webhook without retaining raw bank details', () => {
  const event = normalizePayosWebhook(webhook(), checksumKey);
  assert.deepEqual(event, {
    orderCode: data.orderCode, amount: data.amount, currency: 'VND', paymentLinkId: data.paymentLinkId,
    reference: data.reference, eventCode: '00', success: true, transactionDateTime: data.transactionDateTime,
    eventKey: require('node:crypto').createHash('sha256').update(canonicalizePayosData(data), 'utf8').digest('hex'),
  });
  assert.equal(JSON.stringify(event).includes('counterAccount'), false);
});

test('derives payment success only from signed transaction data, not the unsigned webhook envelope', () => {
  const alteredEnvelope = webhook({ payload: { code: '99', success: false } });
  assert.equal(normalizePayosWebhook(alteredEnvelope, checksumKey).success, true);

  const signedFailure = webhook({ data: { code: '01' }, payload: { code: '00', success: true } });
  assert.equal(normalizePayosWebhook(signedFailure, checksumKey).success, false);
});

test('rejects webhook signature, shape, currency and transaction identity failures', () => {
  const invalidSignature = webhook(); invalidSignature.signature = '0'.repeat(64);
  assert.throws(() => normalizePayosWebhook(invalidSignature, checksumKey), PaymentValidationError);
  for (const invalid of [
    webhook({ data: { orderCode: 0 } }),
    webhook({ data: { amount: -1 } }),
    webhook({ data: { currency: 'USD' } }),
    webhook({ data: { paymentLinkId: '' } }),
    webhook({ data: { reference: '' } }),
    webhook({ payload: { success: 'true' } }),
  ]) assert.throws(() => normalizePayosWebhook(invalid, checksumKey), PaymentValidationError);
});

