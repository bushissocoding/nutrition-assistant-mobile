'use strict';

const express = require('express');
const { logApiFailure } = require('../observability/request-telemetry');
const { NotificationRepositoryError, createNotificationRepository } = require('../repositories/notification-repository');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^(Expo|Exponent)PushToken\[[A-Za-z0-9+/_=-]{1,480}\]$/;
const PREFERENCE_KEYS = ['inAppAppointments', 'inAppPayments', 'inAppMessages', 'pushEnabled', 'pushAppointments', 'pushPayments', 'pushMessages'];

function safeRoute(handler) {
  return (req, res) => Promise.resolve(handler(req, res)).catch(error => {
    if (error instanceof NotificationRepositoryError || Number.isInteger(error?.status)) {
      return res.status(error.status).json({ error: error.message, code: error.code || 'NOTIFICATIONS_UNAVAILABLE' });
    }
    logApiFailure(req, 'notification_operation_failed', 'NOTIFICATIONS_UNAVAILABLE');
    return res.status(503).json({ error: 'Không thể xử lý thông báo lúc này. Hãy thử lại sau.', code: 'NOTIFICATIONS_UNAVAILABLE' });
  });
}

function parsePage(query) {
  const limit = query.limit === undefined ? 25 : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0 || offset > 10000) {
    throw new NotificationRepositoryError('Phân trang thông báo không hợp lệ.', 400, 'INVALID_PAGINATION');
  }
  if (query.unread !== undefined && query.unread !== 'true' && query.unread !== 'false') {
    throw new NotificationRepositoryError('Bộ lọc thông báo không hợp lệ.', 400, 'INVALID_NOTIFICATION_FILTER');
  }
  return { limit, offset, unreadOnly: query.unread === 'true' };
}

function normalizePreferences(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== PREFERENCE_KEYS.length
    || Object.keys(body).some(key => !PREFERENCE_KEYS.includes(key))
    || PREFERENCE_KEYS.some(key => typeof body[key] !== 'boolean')) {
    throw new NotificationRepositoryError('Tùy chọn thông báo phải gồm đúng bảy lựa chọn dạng bật/tắt.', 400, 'INVALID_NOTIFICATION_PREFERENCES');
  }
  return Object.fromEntries(PREFERENCE_KEYS.map(key => [key, body[key]]));
}

function normalizeDevice(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).sort().join(',') !== 'expoPushToken,platform'
    || typeof body.expoPushToken !== 'string' || body.expoPushToken.length > 512 || !TOKEN.test(body.expoPushToken)
    || !['ios', 'android'].includes(body.platform)) {
    throw new NotificationRepositoryError('Token hoặc loại thiết bị không hợp lệ.', 400, 'INVALID_PUSH_DEVICE');
  }
  return { expoPushToken: body.expoPushToken, platform: body.platform };
}

function createNotificationRouter({ repository = createNotificationRepository() } = {}) {
  const router = express.Router();

  router.get('/', safeRoute(async (req, res) => {
    const page = parsePage(req.query);
    const result = await repository.list({ db: req.userDatabase, userId: req.auth.user.id, ...page });
    return res.json({ items: result.items, pagination: { limit: result.limit, offset: result.offset, total: result.total, hasMore: result.offset + result.items.length < result.total } });
  }));

  router.post('/read-all', safeRoute(async (req, res) => {
    if (req.body && Object.keys(req.body).length) throw new NotificationRepositoryError('Không cần gửi dữ liệu để đánh dấu đã đọc.', 400, 'INVALID_NOTIFICATION_REQUEST');
    const result = await repository.markRead({ db: req.userDatabase, userId: req.auth.user.id });
    return res.json({ updated: result.updated });
  }));

  router.post('/:id/read', safeRoute(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Không tìm thấy thông báo.', code: 'NOTIFICATION_NOT_FOUND' });
    if (req.body && Object.keys(req.body).length) throw new NotificationRepositoryError('Không cần gửi dữ liệu để đánh dấu đã đọc.', 400, 'INVALID_NOTIFICATION_REQUEST');
    const result = await repository.markRead({ db: req.userDatabase, userId: req.auth.user.id, notificationId: req.params.id.toLowerCase() });
    if (!result.found) return res.status(404).json({ error: 'Không tìm thấy thông báo.', code: 'NOTIFICATION_NOT_FOUND' });
    return res.json({ updated: result.updated });
  }));

  router.get('/preferences', safeRoute(async (req, res) => {
    const preferences = await repository.getPreferences({ db: req.userDatabase, userId: req.auth.user.id });
    return res.json({ preferences });
  }));

  router.put('/preferences', safeRoute(async (req, res) => {
    const preferences = normalizePreferences(req.body);
    return res.json({ preferences: await repository.savePreferences({ db: req.userDatabase, preferences }) });
  }));

  router.post('/devices', safeRoute(async (req, res) => {
    const device = normalizeDevice(req.body);
    const result = await repository.registerDevice({ db: req.userDatabase, ...device });
    return res.status(201).json({ device: result });
  }));

  router.delete('/devices', safeRoute(async (req, res) => {
    const device = normalizeDevice(req.body);
    await repository.unregisterDevice({ db: req.userDatabase, ...device });
    return res.sendStatus(204);
  }));

  return router;
}

module.exports = { PREFERENCE_KEYS, TOKEN, UUID, createNotificationRouter, normalizeDevice, normalizePreferences, parsePage, safeRoute };
