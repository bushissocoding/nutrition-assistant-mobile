const test = require('node:test');
const assert = require('node:assert/strict');
const { createAccountDeletionService, exportAccount } = require('../src/services/account-lifecycle');

function accountDatabase({ profile = null, consents = [] } = {}) {
  return {
    from(table) {
      if (table === 'profiles') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }) };
      if (table === 'consent_records') return {
        select: () => ({
          eq: () => ({
            order: () => ({ order: async () => ({ data: consents, error: null }) }),
          }),
        }),
      };
      throw new Error('Unexpected test table.');
    },
  };
}

test('account export contains only the authenticated identity, owned profile and consent receipts', async () => {
  const data = await exportAccount({
    db: accountDatabase({ consents: [{ version: 'v1', choices: { profile_processing: true }, accepted_at: '2026-01-01T00:00:00.000Z' }] }),
    user: { id: 'synthetic-user', email: 'person@example.test' },
  });
  assert.equal(data.exportVersion, 1);
  assert.deepEqual(data.identity, { id: 'synthetic-user', email: 'person@example.test' });
  assert.equal(data.profile, null);
  assert.deepEqual(data.consentRecords, [{ version: 'v1', choices: { profile_processing: true }, acceptedAt: '2026-01-01T00:00:00.000Z' }]);
  assert.equal(JSON.stringify(data).includes('password'), false);
});

test('account deletion awaits every module cleanup before deleting identity', async () => {
  const steps = [];
  const service = createAccountDeletionService({
    adminClient: { auth: { admin: { async deleteUser(userId) { steps.push(`identity:${userId}`); return { error: null }; } } } },
    deletionSteps: [async ({ userId }) => { steps.push(`records:${userId}`); }, async ({ userId }) => { steps.push(`objects:${userId}`); }],
  });
  await service({ userId: 'synthetic-user', db: {} });
  assert.deepEqual(steps, ['records:synthetic-user', 'objects:synthetic-user', 'identity:synthetic-user']);
});

test('account deletion keeps identity when a module cleanup fails and tolerates an already deleted account', async () => {
  let identityDeleteCalls = 0;
  const adminClient = { auth: { admin: { async deleteUser() { identityDeleteCalls += 1; return { error: { code: 'user_not_found' } }; } } } };
  const failing = createAccountDeletionService({ adminClient, deletionSteps: [async () => { throw new Error('private provider detail'); }] });
  await assert.rejects(failing({ userId: 'synthetic-user', db: {} }));
  assert.equal(identityDeleteCalls, 0);

  const idempotent = createAccountDeletionService({ adminClient });
  await idempotent({ userId: 'synthetic-user', db: {} });
  assert.equal(identityDeleteCalls, 1);
});
