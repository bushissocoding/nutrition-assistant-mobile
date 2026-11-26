const assert = require('node:assert/strict');
const test = require('node:test');
const { DEFAULT_PREFERENCES, createNotificationRepository } = require('../src/repositories/notification-repository');

function queryBuilder(result, calls) {
  const query = {
    select(...args) { calls.push(['select', ...args]); return query; },
    eq(...args) { calls.push(['eq', ...args]); return query; },
    in(...args) { calls.push(['in', ...args]); return query; },
    is(...args) { calls.push(['is', ...args]); return query; },
    order(...args) { calls.push(['order', ...args]); return query; },
    range(...args) { calls.push(['range', ...args]); return Promise.resolve(result); },
    maybeSingle() { calls.push(['maybeSingle']); return Promise.resolve(result); },
  };
  return query;
}

test('returns defaults for an account without saved notification settings', async () => {
  const calls = [];
  const repository = createNotificationRepository();
  const preferences = await repository.getPreferences({ db: { from(table) { calls.push(['from', table]); return queryBuilder({ data: null, error: null }, calls); } }, userId: 'owner-a' });
  assert.deepEqual(preferences, { ...DEFAULT_PREFERENCES, updatedAt: null });
  assert.deepEqual(calls.slice(0, 2), [['from', 'notification_preferences'], ['select', 'in_app_appointments,in_app_payments,in_app_messages,push_enabled,push_appointments,push_payments,push_messages,updated_at']]);
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'owner-a'));
});

test('lists only enabled in-app kinds and maps database names into a safe notification DTO', async () => {
  const calls = [];
  let table = null;
  const db = {
    from(value) { table = value; calls.push(['from', value]); return queryBuilder(table === 'notification_preferences'
      ? { data: { in_app_appointments: true, in_app_payments: false, in_app_messages: true, push_enabled: false, push_appointments: true, push_payments: true, push_messages: true, updated_at: '2026-11-24T00:00:00Z' }, error: null }
      : { data: [{ id: 'notice-1', kind: 'appointment', reference_id: 'appointment-1', title: 'Lịch hẹn có cập nhật', body: 'Mở ứng dụng để xem thông tin mới nhất.', read_at: null, created_at: '2026-11-24T00:00:00Z' }], count: 1, error: null }, calls); },
  };
  const page = await createNotificationRepository().list({ db, userId: 'owner-a', limit: 20, offset: 0, unreadOnly: true });
  assert.equal(page.total, 1);
  assert.deepEqual(page.items[0], { id: 'notice-1', kind: 'appointment', referenceId: 'appointment-1', title: 'Lịch hẹn có cập nhật', body: 'Mở ứng dụng để xem thông tin mới nhất.', readAt: null, createdAt: '2026-11-24T00:00:00Z' });
  assert.ok(calls.some(call => call[0] === 'in' && call[1] === 'kind' && call[2].join(',') === 'appointment,message'));
  assert.ok(calls.some(call => call[0] === 'is' && call[1] === 'read_at' && call[2] === null));
});

test('maps private mutations to authenticated owner RPCs', async () => {
  const calls = [];
  const db = { async rpc(name, args) { calls.push([name, args]); return { data: name === 'mark_notifications_read' ? 1 : { saved: true }, error: null }; } };
  const repository = createNotificationRepository();
  assert.deepEqual(await repository.markRead({ db, userId: 'owner-a', notificationId: 'notice-id' }), { found: true, changed: true });
  await repository.savePreferences({ db, preferences: DEFAULT_PREFERENCES });
  await repository.registerDevice({ db, expoPushToken: 'ExponentPushToken[device-token]', platform: 'ios' });
  await repository.unregisterDevice({ db, expoPushToken: 'ExponentPushToken[device-token]' });
  assert.deepEqual(calls.map(([name]) => name), ['mark_notifications_read', 'save_notification_preferences', 'register_notification_device', 'unregister_notification_device']);
});

test('turns an unknown or cross-account notification into a not-found result', async () => {
  const calls = [];
  const db = {
    async rpc(name) { calls.push(name); return { data: 0, error: null }; },
    from() { return queryBuilder({ data: null, error: null }, calls); },
  };
  assert.deepEqual(await createNotificationRepository().markRead({ db, userId: 'owner-a', notificationId: 'notice-id' }), { found: false, changed: false });
});
