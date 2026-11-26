const test = require('node:test');
const assert = require('node:assert/strict');
const { validateEmail, validateUsername, validatePassword, normalizeE164 } = require('./identity-model.cjs');

test('normalizes valid email but rejects malformed input', () => {
  assert.equal(validateEmail(' USER@Example.com '), 'user@example.com');
  assert.equal(validateEmail('bad@'), null);
});

test('accepts only bounded username characters', () => {
  assert.equal(validateUsername('health.user_1'), 'health.user_1');
  assert.equal(validateUsername('x'), null);
  assert.equal(validateUsername('name with spaces'), null);
});

test('enforces password size and confirmation', () => {
  assert.equal(validatePassword('long-password'), true);
  assert.equal(validatePassword('short'), false);
  assert.equal(validatePassword('long-password', 'different'), false);
  assert.equal(validatePassword('x'.repeat(73)), false);
});

test('normalizes E.164 formatting and rejects local-only numbers', () => {
  assert.equal(normalizeE164('+84 (900) 123-456'), '+84900123456');
  assert.equal(normalizeE164('0900123456'), null);
});
