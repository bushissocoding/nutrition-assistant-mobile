const test = require('node:test');
const assert = require('node:assert/strict');
const { createAccountDeletionService, exportAccount } = require('../src/services/account-lifecycle');

function accountDatabase({ profile = null, consents = [], plans = [], mealEntries = [], shoppingLists = [], shoppingItems = [], pantryItems = [], appointments = [], providerProfile = null, providerCredentials = null, providerAvailability = [] } = {}) {
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
      if (table === 'meal_plans') return { select: () => ({ eq: () => ({ order: () => ({ order: async () => ({ data: plans, error: null }) }) }) }) };
      if (table === 'meal_entries') return { select: () => ({ eq: () => ({ is: () => ({ order: () => ({ order: async () => ({ data: mealEntries, error: null }) }) }) }) }) };
      if (table === 'shopping_lists') return { select: () => ({ eq: () => ({ order: () => ({ order: async () => ({ data: shoppingLists, error: null }) }) }) }) };
      if (table === 'shopping_list_items') return { select: () => ({ in: () => ({ order: () => ({ order: async () => ({ data: shoppingItems, error: null }) }) }) }) };
      if (table === 'pantry_items') return { select: () => ({ eq: () => ({ order: () => ({ order: async () => ({ data: pantryItems, error: null }) }) }) }) };
      if (table === 'appointments') return { select: () => ({ eq: () => ({ order: () => ({ order: async () => ({ data: appointments, error: null }) }) }) }) };
      if (table === 'care_providers') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: providerProfile, error: null }) }) }) };
      if (table === 'care_provider_credentials') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: providerCredentials, error: null }) }) }) };
      if (table === 'provider_availability') return { select: () => ({ eq: () => ({ order: () => ({ order: async () => ({ data: providerAvailability, error: null }) }) }) }) };
      throw new Error('Unexpected test table.');
    },
  };
}

test('account export contains only authenticated identity and owned profile, nutrition, grocery and appointment data', async () => {
  const data = await exportAccount({
    db: accountDatabase({
      consents: [{ version: 'v1', choices: { profile_processing: true }, accepted_at: '2026-01-01T00:00:00.000Z' }],
      plans: [{ id: 'plan-1', plan: { status: 'feasible' }, profile_updated_at: null, catalog_version: 'USDA-FDC-live-v1', created_at: '2026-01-02T00:00:00.000Z', user_id: 'not-exported' }],
      mealEntries: [{ id: 'entry-1', food_id: 'fdc:12345', food_name: 'Beans', portion_grams: '150', meal_type: 'LUNCH', consumed_at: '2026-01-03T00:00:00.000Z', time_zone: 'Asia/Saigon', notes: null, nutrients: { energyKcal: 100 }, source: { id: 'USDA-FDC', recordId: '12345' }, food_snapshot: { id: 'fdc:12345' }, catalog_version: 'USDA-FDC-live-v1', created_at: '2026-01-03T00:00:00.000Z', updated_at: '2026-01-03T00:00:00.000Z' }],
      shoppingLists: [{ id: 'list-1', source_plan_id: 'plan-1', request_key: 'grocery-intent-1', is_current: true, created_at: '2026-01-04T00:00:00.000Z', updated_at: '2026-01-04T00:00:00.000Z', user_id: 'not-exported' }],
      shoppingItems: [{ id: 'item-1', list_id: 'list-1', food_id: 'fdc:12345', name: 'Beans', amount: '150', unit: 'g', purchased: false, source: { id: 'USDA-FDC' }, catalog_version: 'USDA-FDC-live-v1', created_at: '2026-01-04T00:00:00.000Z', updated_at: '2026-01-04T00:00:00.000Z' }],
      pantryItems: [{ id: 'pantry-1', food_id: 'fdc:12345', name: 'Beans', amount: '200', unit: 'g', source: { id: 'USDA-FDC' }, catalog_version: 'USDA-FDC-live-v1', created_at: '2026-01-05T00:00:00.000Z', updated_at: '2026-01-05T00:00:00.000Z', user_id: 'not-exported' }],
      appointments: [{ id: 'appointment-1', provider_id: 'provider-1', slot_id: 'slot-1', provider_name: 'Dr An', provider_specialty: 'Dinh dưỡng', starts_at: '2026-01-06T09:00:00.000Z', ends_at: '2026-01-06T09:30:00.000Z', fee_vnd: 200000, currency: 'VND', status: 'awaiting_payment', patient_name: 'Bình', patient_phone: '+84901234567', symptom_note: 'Mệt', provider_sharing_version: 'provider-booking-sharing-v1', provider_sharing_accepted_at: '2026-01-05T00:00:00.000Z', hold_expires_at: '2026-01-05T00:20:00.000Z', created_at: '2026-01-05T00:00:00.000Z', updated_at: '2026-01-05T00:00:00.000Z' }],
    }),
    user: { id: 'synthetic-user', email: 'person@example.test' },
  });
  assert.equal(data.exportVersion, 2);
  assert.deepEqual(data.identity, { id: 'synthetic-user', email: 'person@example.test' });
  assert.equal(data.profile, null);
  assert.deepEqual(data.consentRecords, [{ version: 'v1', choices: { profile_processing: true }, acceptedAt: '2026-01-01T00:00:00.000Z' }]);
  assert.deepEqual(data.mealPlans, [{ id: 'plan-1', plan: { status: 'feasible' }, profileUpdatedAt: null, catalogVersion: 'USDA-FDC-live-v1', createdAt: '2026-01-02T00:00:00.000Z' }]);
  assert.deepEqual(data.mealEntries, [{ id: 'entry-1', foodId: 'fdc:12345', foodName: 'Beans', portion: { amount: 150, unit: 'g' }, mealType: 'LUNCH', consumedAt: '2026-01-03T00:00:00.000Z', timeZone: 'Asia/Saigon', notes: null, nutrients: { energyKcal: 100 }, source: { id: 'USDA-FDC', recordId: '12345' }, foodSnapshot: { id: 'fdc:12345' }, catalogVersion: 'USDA-FDC-live-v1', createdAt: '2026-01-03T00:00:00.000Z', updatedAt: '2026-01-03T00:00:00.000Z' }]);
  assert.deepEqual(data.shoppingLists, [{ id: 'list-1', sourcePlanId: 'plan-1', requestKey: 'grocery-intent-1', isCurrent: true, createdAt: '2026-01-04T00:00:00.000Z', updatedAt: '2026-01-04T00:00:00.000Z', items: [{ id: 'item-1', foodId: 'fdc:12345', name: 'Beans', amount: 150, unit: 'g', purchased: false, source: { id: 'USDA-FDC' }, catalogVersion: 'USDA-FDC-live-v1', createdAt: '2026-01-04T00:00:00.000Z', updatedAt: '2026-01-04T00:00:00.000Z' }] }]);
  assert.deepEqual(data.pantryItems, [{ id: 'pantry-1', foodId: 'fdc:12345', name: 'Beans', amount: 200, unit: 'g', source: { id: 'USDA-FDC' }, catalogVersion: 'USDA-FDC-live-v1', createdAt: '2026-01-05T00:00:00.000Z', updatedAt: '2026-01-05T00:00:00.000Z' }]);
  assert.deepEqual(data.appointments, [{ id: 'appointment-1', providerId: 'provider-1', slotId: 'slot-1', provider: { name: 'Dr An', specialty: 'Dinh dưỡng' }, startsAt: '2026-01-06T09:00:00.000Z', endsAt: '2026-01-06T09:30:00.000Z', amount: { value: 200000, currency: 'VND' }, status: 'awaiting_payment', patient: { name: 'Bình', phone: '+84901234567', preliminarySymptoms: 'Mệt' }, providerSharing: { version: 'provider-booking-sharing-v1', acceptedAt: '2026-01-05T00:00:00.000Z' }, holdExpiresAt: '2026-01-05T00:20:00.000Z', cancellation: null, createdAt: '2026-01-05T00:00:00.000Z', updatedAt: '2026-01-05T00:00:00.000Z' }]);
  assert.equal(data.providerApplication, null);
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
