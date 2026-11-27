const test = require('node:test');
const assert = require('node:assert/strict');
const { createAccountDeletionService, exportAccount } = require('../src/services/account-lifecycle');

function accountDatabase({ profile = null, consents = [], assistantConsents = [], assistantTurns = [], appointmentMessages = [], notificationPreferences = null, nutritionPreferences = null, notifications = [], healthRecords = [], healthRecordResults = [], plans = [], mealEntries = [], shoppingLists = [], shoppingItems = [], pantryItems = [], appointments = [], payments = [], providerProfile = null, providerCredentials = null, providerAvailability = [], pageRequests = [] } = {}) {
  const rows = {
    consent_records: consents,
    assistant_ai_consents: assistantConsents,
    assistant_turns: assistantTurns,
    appointment_messages: appointmentMessages,
    notifications,
    health_records: healthRecords,
    health_record_results: healthRecordResults,
    meal_plans: plans,
    meal_entries: mealEntries,
    shopping_lists: shoppingLists,
    shopping_list_items: shoppingItems,
    pantry_items: pantryItems,
    appointments,
    appointment_payments: payments,
    provider_availability: providerAvailability,
  };
  function arrayQuery(table) {
    const query = {
      eq() { return query; },
      in() { return query; },
      is() { return query; },
      order() { return query; },
      async range(from, to) {
        pageRequests.push({ table, from, to });
        return { data: rows[table].slice(from, to + 1), error: null };
      },
    };
    return query;
  }
  function singleQuery(data) {
    return { eq() { return this; }, async maybeSingle() { return { data, error: null }; } };
  }
  return {
    from(table) {
      if (table === 'profiles') return { select: () => singleQuery(profile) };
      if (table === 'notification_preferences') return { select: () => singleQuery(notificationPreferences) };
      if (table === 'nutrition_preferences') return { select: () => singleQuery(nutritionPreferences) };
      if (table === 'care_providers') return { select: () => singleQuery(providerProfile) };
      if (table === 'care_provider_credentials') return { select: () => singleQuery(providerCredentials) };
      if (Object.hasOwn(rows, table)) return { select: () => arrayQuery(table) };
      throw new Error('Unexpected test table.');
    },
  };
}

test('account export contains only authenticated identity and owned profile, nutrition, grocery, care and notification data', async () => {
  const data = await exportAccount({
    db: accountDatabase({
      consents: [{ version: 'v1', choices: { profile_processing: true }, accepted_at: '2026-01-01T00:00:00.000Z' }],
      assistantConsents: [{ version: 'ai-assistant-processing-v1', choice: 'accepted', recorded_at: '2026-01-02T00:00:00.000Z' }],
      assistantTurns: [{ id: 'turn-1', request_key: 'request-1', user_message: 'How?', assistant_message: 'Open diary.', status: 'completed', created_at: '2026-01-03T00:00:00.000Z', updated_at: '2026-01-03T00:00:00.000Z' }],
      appointmentMessages: [{ id: 'message-1', appointment_id: 'appointment-1', sender_user_id: 'synthetic-user', client_message_id: 'message-key-1', body: 'Please confirm.', created_at: '2026-01-04T00:00:00.000Z' }],
      notificationPreferences: { in_app_appointments: true, in_app_payments: false, in_app_messages: true, push_enabled: false, push_appointments: true, push_payments: true, push_messages: false, updated_at: '2026-01-04T00:00:00.000Z' },
      nutritionPreferences: { dietary_variety: 'varied', food_preferences: ['Vietnamese', 'easy_cook'], allergy_reminder: true, track_confirmed_targets: false, updated_at: '2026-01-04T00:00:00.000Z' },
      notifications: [{ id: 'notice-1', kind: 'appointment', reference_id: 'appointment-1', title: 'Lịch hẹn có cập nhật', body: 'Mở ứng dụng để xem thông tin mới nhất.', read_at: null, created_at: '2026-01-04T00:00:00.000Z' }],
      healthRecords: [{ id: 'record-1', title: 'Panel', source_date: '2026-01-03', note: '', file_mime_type: 'image/jpeg', file_size: '2400', created_at: '2026-01-04T00:00:00.000Z', updated_at: '2026-01-04T00:00:00.000Z' }],
      healthRecordResults: [{ id: 'result-1', record_id: 'record-1', name: 'Glucose', value: '5.4', unit: 'mmol/L', reference_range: '3.9–5.5', created_at: '2026-01-04T00:00:00.000Z' }],
      plans: [{ id: 'plan-1', plan: { status: 'feasible' }, profile_updated_at: null, catalog_version: 'synthetic-test-v1', created_at: '2026-01-02T00:00:00.000Z', user_id: 'not-exported' }],
      mealEntries: [{ id: 'entry-1', food_id: 'synthetic-test-source:12345', food_name: 'Beans', portion_grams: '150', meal_type: 'LUNCH', consumed_at: '2026-01-03T00:00:00.000Z', time_zone: 'Asia/Saigon', notes: null, nutrients: { energyKcal: 100 }, source: { id: 'synthetic-test-source', recordId: '12345' }, food_snapshot: { id: 'synthetic-test-source:12345' }, catalog_version: 'synthetic-test-v1', created_at: '2026-01-03T00:00:00.000Z', updated_at: '2026-01-03T00:00:00.000Z' }],
      shoppingLists: [{ id: 'list-1', source_plan_id: 'plan-1', request_key: 'grocery-intent-1', is_current: true, created_at: '2026-01-04T00:00:00.000Z', updated_at: '2026-01-04T00:00:00.000Z', user_id: 'not-exported' }],
      shoppingItems: [{ id: 'item-1', list_id: 'list-1', food_id: 'synthetic-test-source:12345', name: 'Beans', amount: '150', unit: 'g', purchased: false, source: { id: 'synthetic-test-source' }, catalog_version: 'synthetic-test-v1', created_at: '2026-01-04T00:00:00.000Z', updated_at: '2026-01-04T00:00:00.000Z' }],
      pantryItems: [{ id: 'pantry-1', food_id: 'synthetic-test-source:12345', name: 'Beans', amount: '200', unit: 'g', source: { id: 'synthetic-test-source' }, catalog_version: 'synthetic-test-v1', created_at: '2026-01-05T00:00:00.000Z', updated_at: '2026-01-05T00:00:00.000Z', user_id: 'not-exported' }],
      appointments: [{ id: 'appointment-1', provider_id: 'provider-1', slot_id: 'slot-1', provider_name: 'Dr An', provider_specialty: 'Dinh dưỡng', starts_at: '2026-01-06T09:00:00.000Z', ends_at: '2026-01-06T09:30:00.000Z', fee_vnd: 200000, currency: 'VND', status: 'awaiting_payment', patient_name: 'Bình', patient_phone: '+84901234567', symptom_note: 'Mệt', provider_sharing_version: 'provider-booking-sharing-v1', provider_sharing_accepted_at: '2026-01-05T00:00:00.000Z', hold_expires_at: '2026-01-05T00:20:00.000Z', created_at: '2026-01-05T00:00:00.000Z', updated_at: '2026-01-05T00:00:00.000Z' }],
      payments: [{ id: 'payment-1', appointment_id: 'appointment-1', order_code: '1800000001', amount_vnd: '200000', currency: 'VND', status: 'paid', payment_link_id: 'synthetic-link', provider_reference: 'synthetic-ref', provider_transaction_at: '2026-01-05 00:01:00', link_created_at: '2026-01-05T00:00:00.000Z', paid_at: '2026-01-05T00:01:00.000Z', created_at: '2026-01-05T00:00:00.000Z', updated_at: '2026-01-05T00:01:00.000Z' }],
    }),
    user: { id: 'synthetic-user', email: 'person@example.test' },
  });
  assert.equal(data.exportVersion, 6);
  assert.deepEqual(data.identity, { id: 'synthetic-user', email: 'person@example.test' });
  assert.equal(data.profile, null);
  assert.deepEqual(data.consentRecords, [{ version: 'v1', choices: { profile_processing: true }, acceptedAt: '2026-01-01T00:00:00.000Z' }]);
  assert.deepEqual(data.assistantAiConsentRecords, [{ version: 'ai-assistant-processing-v1', accepted: true, recordedAt: '2026-01-02T00:00:00.000Z' }]);
  assert.deepEqual(data.assistantTurns, [{ id: 'turn-1', clientMessageId: 'request-1', userMessage: 'How?', assistantMessage: 'Open diary.', status: 'completed', createdAt: '2026-01-03T00:00:00.000Z', updatedAt: '2026-01-03T00:00:00.000Z' }]);
  assert.deepEqual(data.appointmentMessages, [{ id: 'message-1', appointmentId: 'appointment-1', senderUserId: 'synthetic-user', clientMessageId: 'message-key-1', body: 'Please confirm.', createdAt: '2026-01-04T00:00:00.000Z' }]);
  assert.deepEqual(data.notificationPreferences, { inAppAppointments: true, inAppPayments: false, inAppMessages: true, pushEnabled: false, pushAppointments: true, pushPayments: true, pushMessages: false, updatedAt: '2026-01-04T00:00:00.000Z' });
  assert.deepEqual(data.nutritionPreferences, { dietaryVariety: 'varied', foodPreferences: ['Vietnamese', 'easy_cook'], allergyReminder: true, trackConfirmedTargets: false, updatedAt: '2026-01-04T00:00:00.000Z' });
  assert.deepEqual(data.notifications, [{ id: 'notice-1', kind: 'appointment', referenceId: 'appointment-1', title: 'Lịch hẹn có cập nhật', body: 'Mở ứng dụng để xem thông tin mới nhất.', readAt: null, createdAt: '2026-01-04T00:00:00.000Z' }]);
  assert.deepEqual(data.healthRecords, [{ id: 'record-1', title: 'Panel', sourceDate: '2026-01-03', note: '', source: { mimeType: 'image/jpeg', size: 2400 }, results: [{ id: 'result-1', name: 'Glucose', value: '5.4', unit: 'mmol/L', referenceRange: '3.9–5.5', createdAt: '2026-01-04T00:00:00.000Z' }], createdAt: '2026-01-04T00:00:00.000Z', updatedAt: '2026-01-04T00:00:00.000Z' }]);
  assert.deepEqual(data.mealPlans, [{ id: 'plan-1', plan: { status: 'feasible' }, profileUpdatedAt: null, catalogVersion: 'synthetic-test-v1', createdAt: '2026-01-02T00:00:00.000Z' }]);
  assert.deepEqual(data.mealEntries, [{ id: 'entry-1', foodId: 'synthetic-test-source:12345', foodName: 'Beans', portion: { amount: 150, unit: 'g' }, mealType: 'LUNCH', consumedAt: '2026-01-03T00:00:00.000Z', timeZone: 'Asia/Saigon', notes: null, nutrients: { energyKcal: 100 }, source: { id: 'synthetic-test-source', recordId: '12345' }, foodSnapshot: { id: 'synthetic-test-source:12345' }, catalogVersion: 'synthetic-test-v1', createdAt: '2026-01-03T00:00:00.000Z', updatedAt: '2026-01-03T00:00:00.000Z' }]);
  assert.deepEqual(data.shoppingLists, [{ id: 'list-1', sourcePlanId: 'plan-1', requestKey: 'grocery-intent-1', isCurrent: true, createdAt: '2026-01-04T00:00:00.000Z', updatedAt: '2026-01-04T00:00:00.000Z', items: [{ id: 'item-1', foodId: 'synthetic-test-source:12345', name: 'Beans', amount: 150, unit: 'g', purchased: false, source: { id: 'synthetic-test-source' }, catalogVersion: 'synthetic-test-v1', createdAt: '2026-01-04T00:00:00.000Z', updatedAt: '2026-01-04T00:00:00.000Z' }] }]);
  assert.deepEqual(data.pantryItems, [{ id: 'pantry-1', foodId: 'synthetic-test-source:12345', name: 'Beans', amount: 200, unit: 'g', source: { id: 'synthetic-test-source' }, catalogVersion: 'synthetic-test-v1', createdAt: '2026-01-05T00:00:00.000Z', updatedAt: '2026-01-05T00:00:00.000Z' }]);
  assert.deepEqual(data.appointments, [{ id: 'appointment-1', providerId: 'provider-1', slotId: 'slot-1', provider: { name: 'Dr An', specialty: 'Dinh dưỡng' }, startsAt: '2026-01-06T09:00:00.000Z', endsAt: '2026-01-06T09:30:00.000Z', amount: { value: 200000, currency: 'VND' }, status: 'awaiting_payment', patient: { name: 'Bình', phone: '+84901234567', preliminarySymptoms: 'Mệt' }, providerSharing: { version: 'provider-booking-sharing-v1', acceptedAt: '2026-01-05T00:00:00.000Z' }, holdExpiresAt: '2026-01-05T00:20:00.000Z', cancellation: null, createdAt: '2026-01-05T00:00:00.000Z', updatedAt: '2026-01-05T00:00:00.000Z' }]);
  assert.deepEqual(data.appointmentPayments, [{ id: 'payment-1', appointmentId: 'appointment-1', orderCode: 1800000001, amount: { value: 200000, currency: 'VND' }, status: 'paid', paymentLinkId: 'synthetic-link', providerReference: 'synthetic-ref', providerTransactionAt: '2026-01-05 00:01:00', linkCreatedAt: '2026-01-05T00:00:00.000Z', paidAt: '2026-01-05T00:01:00.000Z', createdAt: '2026-01-05T00:00:00.000Z', updatedAt: '2026-01-05T00:01:00.000Z' }]);
  assert.equal(data.providerApplication, null);
  assert.equal(JSON.stringify(data).includes('password'), false);
});

test('account export pages large collections and nested shopping items past the API row limit', async () => {
  const notifications = Array.from({ length: 1001 }, (_, index) => ({
    id: `notice-${index}`,
    kind: 'appointment',
    reference_id: null,
    title: `Notice ${index}`,
    body: 'Synthetic notice.',
    read_at: null,
    created_at: `2026-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
  }));
  const shoppingItems = Array.from({ length: 1001 }, (_, index) => ({
    id: `item-${index}`,
    list_id: 'list-many-items',
    food_id: 'synthetic-test-source:12345',
    name: `Synthetic food ${index}`,
    amount: '100',
    unit: 'g',
    purchased: false,
    source: { id: 'synthetic-test-source' },
    catalog_version: 'synthetic-test-v1',
    created_at: '2026-01-04T00:00:00.000Z',
    updated_at: '2026-01-04T00:00:00.000Z',
  }));
  const pageRequests = [];
  const data = await exportAccount({
    db: accountDatabase({
      notifications,
      shoppingLists: [{ id: 'list-many-items', source_plan_id: null, request_key: 'synthetic-key', is_current: true, created_at: '2026-01-04T00:00:00.000Z', updated_at: '2026-01-04T00:00:00.000Z' }],
      shoppingItems,
      pageRequests,
    }),
    user: { id: 'synthetic-user', email: 'person@example.test' },
  });

  assert.equal(data.notifications.length, 1001);
  assert.equal(data.shoppingLists[0].items.length, 1001);
  assert.deepEqual(pageRequests.filter(page => page.table === 'notifications').map(page => page.from), [0, 500, 1000]);
  assert.deepEqual(pageRequests.filter(page => page.table === 'shopping_list_items').map(page => page.from), [0, 500, 1000]);
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

test('account deletion removes linked and orphan private record files before deleting the auth identity', async () => {
  const steps = [];
  const storageFiles = new Map([
    ['account-1', [
      { name: 'record-1', id: 'object-1', metadata: {} },
      { name: 'unlinked-record', id: 'object-2', metadata: {} },
      { name: 'legacy', id: null, metadata: null },
    ]],
    ['account-1/legacy', [{ name: 'orphan', id: 'object-3', metadata: {} }]],
  ]);
  const adminClient = {
    storage: { from(bucket) { return {
      async list(folder, { limit, offset }) {
        steps.push(`list:${bucket}:${folder}:${limit}:${offset}`);
        return { data: (storageFiles.get(folder) || []).slice(offset, offset + limit), error: null };
      },
      async remove(paths) {
        steps.push(`storage:${bucket}:${paths.join(',')}`);
        const removed = [];
        for (const path of paths) {
          const slash = path.lastIndexOf('/');
          const folder = path.slice(0, slash);
          const name = path.slice(slash + 1);
          const files = storageFiles.get(folder) || [];
          const index = files.findIndex(entry => entry.name === name);
          if (index >= 0) removed.push(...files.splice(index, 1));
        }
        return { data: removed, error: null };
      },
    }; } },
    auth: { admin: { async deleteUser(userId) { steps.push(`identity:${userId}`); return { error: null }; } } },
  };
  const service = createAccountDeletionService({ adminClient });
  await service({ userId: 'account-1', db: {} });
  assert.deepEqual(steps, [
    'list:health-record-images:account-1:100:0',
    'storage:health-record-images:account-1/record-1,account-1/unlinked-record',
    'list:health-record-images:account-1:100:0',
    'list:health-record-images:account-1/legacy:100:0',
    'storage:health-record-images:account-1/legacy/orphan',
    'list:health-record-images:account-1/legacy:100:0',
    'storage:health-record-images:account-1/legacy',
    'list:health-record-images:account-1:100:0',
    'identity:account-1',
  ]);
});

test('account deletion preserves identity if private storage cannot be fully listed', async () => {
  let identityDeleteCalls = 0;
  const service = createAccountDeletionService({ adminClient: {
    storage: { from() { return { async list() { return { data: null, error: new Error('storage unavailable') }; } }; } },
    auth: { admin: { async deleteUser() { identityDeleteCalls += 1; return { error: null }; } } },
  } });
  await assert.rejects(service({ userId: 'account-1', db: {} }));
  assert.equal(identityDeleteCalls, 0);
});

test('account deletion pages through storage entries and removes files in bounded batches', async () => {
  const offsets = [];
  const removedBatches = [];
  let identityDeleted = false;
  let listedCount = 0;
  let removedCount = 0;
  let maxUnremovedListed = 0;
  const files = Array.from({ length: 101 }, (_, index) => ({ name: `record-${index}`, id: `object-${index}`, metadata: {} }));
  const service = createAccountDeletionService({ adminClient: {
    storage: { from() { return {
      async list(folder, { limit, offset }) {
        assert.equal(folder, 'account-1');
        assert.equal(limit, 100);
        offsets.push(offset);
        const data = files.slice(offset, offset + limit);
        listedCount += data.length;
        maxUnremovedListed = Math.max(maxUnremovedListed, listedCount - removedCount);
        return { data, error: null };
      },
      async remove(paths) {
        removedBatches.push(paths);
        for (const path of paths) {
          const name = path.slice(path.lastIndexOf('/') + 1);
          const index = files.findIndex(entry => entry.name === name);
          if (index >= 0) { files.splice(index, 1); removedCount += 1; }
        }
        return { data: paths.map(name => ({ name })), error: null };
      },
    }; } },
    auth: { admin: { async deleteUser() { identityDeleted = true; return { error: null }; } } },
  } });
  await service({ userId: 'account-1', db: {} });
  assert.deepEqual(offsets, [0, 0, 0]);
  assert.deepEqual(removedBatches.map(batch => batch.length), [100, 1]);
  assert.ok(maxUnremovedListed <= 100);
  assert.equal(identityDeleted, true);
});
