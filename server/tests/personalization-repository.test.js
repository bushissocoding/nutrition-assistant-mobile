const assert = require('node:assert/strict');
const test = require('node:test');
const { DEFAULT_PERSONALIZATION, createPersonalizationRepository } = require('../src/repositories/personalization-repository');

function query(result, calls) {
  const builder = {
    select(...args) { calls.push(['select', ...args]); return builder; },
    eq(...args) { calls.push(['eq', ...args]); return builder; },
    maybeSingle() { calls.push(['maybeSingle']); return Promise.resolve(result); },
  };
  return builder;
}

test('returns account-owned default preferences when no saved row exists', async () => {
  const calls = [];
  const result = await createPersonalizationRepository().get({ db: { from(table) { calls.push(['from', table]); return query({ data: null, error: null }, calls); } }, userId: 'owner-a' });
  assert.deepEqual(result, { ...DEFAULT_PERSONALIZATION, foodPreferences: ['Vietnamese'], updatedAt: null });
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'owner-a'));
});

test('maps structured profile settings and sends changes through the owner RPC', async () => {
  const calls = [];
  const db = {
    from() { return query({ data: { dietary_variety: 'varied', food_preferences: ['Vietnamese'], allergy_reminder: true, track_confirmed_targets: false, updated_at: '2026-11-24T00:00:00Z' }, error: null }, calls); },
    async rpc(name, args) { calls.push([name, args]); return { data: args.p_preferences, error: null }; },
  };
  const repository = createPersonalizationRepository();
  assert.deepEqual(await repository.get({ db, userId: 'owner-a' }), { dietaryVariety: 'varied', foodPreferences: ['Vietnamese'], allergyReminder: true, trackConfirmedTargets: false, updatedAt: '2026-11-24T00:00:00Z' });
  const preferences = { dietaryVariety: 'simple', foodPreferences: ['vegetarian'], allergyReminder: false, trackConfirmedTargets: true };
  assert.deepEqual(await repository.save({ db, preferences }), preferences);
  assert.deepEqual(calls.at(-1), ['save_nutrition_preferences', { p_preferences: preferences }]);
});
