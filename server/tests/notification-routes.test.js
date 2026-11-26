const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const test = require('node:test');
const { createNotificationRouter, normalizeDevice, normalizePreferences, parsePage } = require('../src/routes/notifications');

async function withServer(t, repository) {
  const app = express();
  app.use(express.json());
  app.use('/notifications', (req, _res, next) => { req.auth = { user: { id: 'account-1' } }; req.userDatabase = {}; next(); }, createNotificationRouter({ repository }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}/notifications`;
}

const defaultPreferences = { inAppAppointments: true, inAppPayments: true, inAppMessages: true, pushEnabled: false, pushAppointments: true, pushPayments: true, pushMessages: true };

test('validates strict pagination, preferences and Expo token shapes', () => {
  assert.deepEqual(parsePage({ limit: '10', offset: '20', unread: 'true' }), { limit: 10, offset: 20, unreadOnly: true });
  assert.throws(() => parsePage({ limit: '51' }), error => error.code === 'INVALID_PAGINATION');
  assert.throws(() => parsePage({ unread: 'yes' }), error => error.code === 'INVALID_NOTIFICATION_FILTER');
  assert.deepEqual(normalizePreferences(defaultPreferences), defaultPreferences);
  assert.throws(() => normalizePreferences({ ...defaultPreferences, unexpected: true }), error => error.code === 'INVALID_NOTIFICATION_PREFERENCES');
  assert.deepEqual(normalizeDevice({ expoPushToken: 'ExponentPushToken[device-token]', platform: 'android' }), { expoPushToken: 'ExponentPushToken[device-token]', platform: 'android' });
  assert.throws(() => normalizeDevice({ expoPushToken: 'garbage', platform: 'android' }), error => error.code === 'INVALID_PUSH_DEVICE');
});

test('lists only persisted account notifications and marks one or all read', async t => {
  const calls = [];
  const notificationId = '01380e6e-b95f-4bd5-8f38-a1391ae3bda1';
  const repository = {
    async list(input) { calls.push(['list', input]); return { items: [{ id: notificationId, kind: 'appointment', title: 'Lịch hẹn có cập nhật', body: 'Mở ứng dụng để xem thông tin mới nhất.', readAt: null, createdAt: '2026-11-24T00:00:00Z' }], total: 25, limit: input.limit, offset: input.offset }; },
    async markRead(input) { calls.push(['markRead', input]); return { found: input.notificationId !== '00000000-0000-4000-8000-000000000000', updated: input.notificationId ? 1 : 3 }; },
  };
  const baseUrl = await withServer(t, repository);
  const list = await fetch(`${baseUrl}?limit=10&offset=20&unread=true`);
  assert.equal(list.status, 200);
  assert.deepEqual(calls[0], ['list', { db: {}, userId: 'account-1', limit: 10, offset: 20, unreadOnly: true }]);
  assert.equal((await list.json()).pagination.hasMore, true);
  const read = await fetch(`${baseUrl}/${notificationId}/read`, { method: 'POST' });
  assert.equal(read.status, 200);
  assert.deepEqual(await read.json(), { updated: 1 });
  assert.deepEqual(calls[1][1], { db: {}, userId: 'account-1', notificationId });
  const all = await fetch(`${baseUrl}/read-all`, { method: 'POST' });
  assert.equal(all.status, 200);
  assert.deepEqual(await all.json(), { updated: 3 });
  assert.deepEqual(calls[2][1], { db: {}, userId: 'account-1' });
});

test('rejects unknown IDs, request fields and malformed preference/device payloads', async t => {
  const repository = {
    async list() { return { items: [], total: 0, limit: 25, offset: 0 }; },
    async markRead() { return { found: false, changed: false }; },
    async savePreferences() { throw new Error('must not persist invalid preference'); },
    async registerDevice() { throw new Error('must not persist invalid token'); },
  };
  const baseUrl = await withServer(t, repository);
  assert.equal((await fetch(`${baseUrl}/not-an-id/read`, { method: 'POST' })).status, 404);
  const preferences = await fetch(`${baseUrl}/preferences`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...defaultPreferences, surprise: true }) });
  assert.equal(preferences.status, 400);
  const device = await fetch(`${baseUrl}/devices`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expoPushToken: 'not-a-token', platform: 'web' }) });
  assert.equal(device.status, 400);
});

test('persists preferences and registers or removes an account-owned device', async t => {
  const calls = [];
  const repository = {
    async getPreferences(input) { calls.push(['getPreferences', input]); return { ...defaultPreferences, updatedAt: null }; },
    async savePreferences(input) { calls.push(['savePreferences', input]); return { ...input.preferences, updatedAt: '2026-11-24T00:00:00Z' }; },
    async registerDevice(input) { calls.push(['registerDevice', input]); return { registered: true, platform: input.platform }; },
    async unregisterDevice(input) { calls.push(['unregisterDevice', input]); },
  };
  const baseUrl = await withServer(t, repository);
  assert.equal((await fetch(`${baseUrl}/preferences`)).status, 200);
  const saved = await fetch(`${baseUrl}/preferences`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(defaultPreferences) });
  assert.equal(saved.status, 200);
  const payload = { expoPushToken: 'ExponentPushToken[device-token]', platform: 'ios' };
  assert.equal((await fetch(`${baseUrl}/devices`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).status, 201);
  assert.equal((await fetch(`${baseUrl}/devices`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).status, 204);
  assert.equal(calls[0][1].userId, 'account-1');
  assert.deepEqual(calls[3][1], { db: {}, ...payload });
});
