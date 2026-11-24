const { getProfile } = require('../repositories/profile-repository');
const { toProfileDto } = require('./profile');

function createAccountDeletionService({ adminClient, deletionSteps = [] } = {}) {
  if (!Array.isArray(deletionSteps) || deletionSteps.some(step => typeof step !== 'function')) {
    throw new TypeError('Account deletion steps must be functions.');
  }
  return async function deleteAccount({ userId, db }) {
    if (!adminClient?.auth?.admin?.deleteUser) {
      const error = new Error('Account deletion is not configured.');
      error.code = 'ACCOUNT_DELETE_UNAVAILABLE';
      throw error;
    }
    for (const deleteOwnedData of deletionSteps) await deleteOwnedData({ userId, db });
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error && !['user_not_found', 'USER_NOT_FOUND'].includes(error.code)) {
      const failure = new Error('Account deletion provider failed.');
      failure.code = 'ACCOUNT_DELETE_UNAVAILABLE';
      throw failure;
    }
  };
}

async function exportAccount({ db, user }) {
  const profile = await getProfile(db, user.id);
  const { data: consents, error } = await db.from('consent_records')
    .select('version,choices,accepted_at')
    .eq('user_id', user.id)
    .order('accepted_at', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw error;
  return {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    identity: { id: user.id, email: user.email },
    profile: toProfileDto(profile),
    consentRecords: (consents || []).map(record => ({ version: record.version, choices: record.choices, acceptedAt: record.accepted_at })),
  };
}

module.exports = { createAccountDeletionService, exportAccount };
