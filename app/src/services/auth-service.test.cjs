const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthService } = require('./auth-service.cjs');

function fakeAuth(overrides = {}) {
  const calls = [];
  const auth = {
    calls,
    async signUp(input) { calls.push(['signUp', input]); return { data: { user: { id: 'synthetic-user' }, session: null }, error: null }; },
    async signInWithPassword(input) { calls.push(['signInWithPassword', input]); return { data: { user: { id: 'synthetic-user', email: input.email }, session: { access_token: 'secret' } }, error: null }; },
    async getSession() { return { data: { session: null }, error: null }; },
    async getUser() { return { data: { user: { id: 'synthetic-user' } }, error: null }; },
    async signOut() { return { error: null }; },
    async resetPasswordForEmail(input, options) { calls.push(['resetPasswordForEmail', input, options]); return { error: null }; },
    async signInWithOtp(input) { calls.push(['signInWithOtp', input]); return { error: null }; },
    async verifyOtp(input) { calls.push(['verifyOtp', input]); return { data: { session: { access_token: 'secret' } }, error: null }; },
    async updateUser(input) { calls.push(['updateUser', input]); return { data: { user: { id: 'synthetic-user', phone: '+84900123456', phone_confirmed_at: 'synthetic-time' } }, error: null }; },
    async exchangeCodeForSession(input) { calls.push(['exchangeCodeForSession', input]); return { error: null }; },
    async setSession(input) { calls.push(['setSession', input]); return { error: null }; },
    onAuthStateChange(listener) { this.listener = listener; return { data: { subscription: { unsubscribe() {} } } }; },
    ...overrides,
  };
  return auth;
}

test('registration never stores credentials and asks for email verification without a session', async () => {
  const auth = fakeAuth();
  const service = createAuthService({ client: { auth }, callbackUrl: () => 'nutritionassistant://auth/callback' });
  const result = await service.register({ email: ' User@example.com ', username: 'patient_1', password: 'password-123', confirmPassword: 'password-123' });
  assert.deepEqual(result, { status: 'verification-required' });
  assert.deepEqual(auth.calls[0], ['signUp', {
    email: 'user@example.com',
    password: 'password-123',
    options: { data: { username: 'patient_1' }, emailRedirectTo: 'nutritionassistant://auth/callback' },
  }]);
});

test('password login maps provider failures to a generic error', async () => {
  const auth = fakeAuth({ async signInWithPassword() { return { data: {}, error: new Error('sensitive vendor detail') }; } });
  const service = createAuthService({ client: { auth } });
  await assert.rejects(service.login({ email: 'user@example.com', password: 'bad' }), error => error.code === 'LOGIN_FAILED' && !error.message.includes('sensitive'));
});

test('SMS recovery disables account creation and exposes only a generic accepted state', async () => {
  const auth = fakeAuth();
  const service = createAuthService({ client: { auth } });
  assert.deepEqual(await service.requestSmsRecovery('+84 900 123 456'), { status: 'accepted' });
  assert.equal(auth.calls[0][1].options.shouldCreateUser, false);
});

test('SMS recovery verifies OTP before updating the password', async () => {
  const auth = fakeAuth();
  const service = createAuthService({ client: { auth } });
  assert.deepEqual(await service.verifySmsRecovery({ phone: '+84900123456', token: '123456', password: 'secure-pass', confirmPassword: 'secure-pass' }), { status: 'updated' });
  assert.deepEqual(auth.calls.map(call => call[0]), ['verifyOtp', 'updateUser']);
  assert.equal(auth.calls[0][1].type, 'sms');
});

test('phone linking requires a verified phone-change OTP result', async () => {
  const auth = fakeAuth({
    async verifyOtp(input) {
      this.calls.push(['verifyOtp', input]);
      return { data: { user: { id: 'synthetic-user', phone: '+84900123456', phone_confirmed_at: 'synthetic-time' } }, error: null };
    },
  });
  const service = createAuthService({ client: { auth } });
  await service.requestPhoneLink('+84900123456');
  const result = await service.verifyPhoneLink({ phone: '+84900123456', token: '123456' });
  assert.deepEqual(result, { status: 'verified', phone: '+84900123456' });
  assert.equal(auth.calls[1][1].type, 'phone_change');
});

test('account settings update the password only in a live session', async () => {
  const noSession = createAuthService({ client: { auth: fakeAuth() } });
  await assert.rejects(noSession.updatePassword({ password: 'secure-pass', confirmPassword: 'secure-pass' }), error => error.code === 'SESSION_UNAVAILABLE');

  const auth = fakeAuth({ async getSession() { return { data: { session: { access_token: 'synthetic-token' } }, error: null }; } });
  const service = createAuthService({ client: { auth } });
  assert.deepEqual(await service.updatePassword({ password: 'secure-pass', confirmPassword: 'secure-pass' }), { status: 'updated' });
  assert.deepEqual(auth.calls.map(call => call[0]), ['updateUser']);
  assert.deepEqual(auth.calls[0][1], { password: 'secure-pass' });
});

test('auth user DTO preserves verified phone and account creation time', async () => {
  const auth = fakeAuth({
    async getSession() { return { data: { session: { access_token: 'synthetic-token' } }, error: null }; },
    async getUser() { return { data: { user: { id: 'synthetic-user', email: 'person@example.test', created_at: '2024-03-18T08:30:00.000Z', phone: '+84900123456', phone_confirmed_at: 'synthetic-time', user_metadata: { username: 'patient_1', private: 'ignored' } } }, error: null }; },
  });
  const service = createAuthService({ client: { auth } });
  const result = await service.restoreSession();
  assert.deepEqual(result.user, { id: 'synthetic-user', email: 'person@example.test', username: 'patient_1', phone: '+84900123456', createdAt: '2024-03-18T08:30:00.000Z' });
});

test('recovery callback exchanges PKCE code and rejects malformed callback', async () => {
  const auth = fakeAuth();
  const service = createAuthService({ client: { auth } });
  assert.deepEqual(await service.completeCallback('nutritionassistant://auth/callback?code=synthetic-code'), { status: 'completed' });
  assert.deepEqual(auth.calls[0], ['exchangeCodeForSession', 'synthetic-code']);
  await assert.rejects(service.completeCallback('nutritionassistant://auth/callback'), error => error.code === 'INVALID_CALLBACK');
});

test('recognizes only the configured deep-link path as an auth callback', () => {
  const service = createAuthService({ client: { auth: fakeAuth() }, callbackUrl: () => 'nutritionassistant://auth/callback' });
  assert.equal(service.isCallbackUrl('nutritionassistant://auth/callback?code=synthetic-code'), true);
  assert.equal(service.isCallbackUrl('http://127.0.0.1:8765/'), false);
  assert.equal(service.isCallbackUrl('nutritionassistant://auth/other?code=synthetic-code'), false);
});

test('missing provider configuration fails explicitly instead of claiming success', async () => {
  const service = createAuthService({ client: null });
  await assert.rejects(service.login({ email: 'user@example.com', password: 'anything' }), error => error.code === 'AUTH_NOT_CONFIGURED');
});
