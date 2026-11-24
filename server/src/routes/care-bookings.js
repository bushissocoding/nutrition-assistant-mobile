const express = require('express');
const { createCurrentConsentMiddleware } = require('../middleware/current-consent');
const { createCareBookingRepository, CareBookingRepositoryError } = require('../repositories/care-booking-repository');
const { validIdempotencyKey } = require('../repositories/meal-plan-repository');
const {
  CareBookingValidationError,
  UUID,
  appointmentRequestHash,
  normalizeAvailabilitySlot,
  normalizeBookingInput,
  normalizeCancelInput,
  normalizeProviderCredentials,
  normalizeProviderProfile,
} = require('../services/care-bookings');

const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function asyncRoute(handler) {
  return (req, res) => Promise.resolve(handler(req, res)).catch(error => {
    if (error instanceof CareBookingValidationError || error instanceof CareBookingRepositoryError || Number.isInteger(error?.status)) {
      return res.status(error.status).json({ error: error.message, code: error.code || 'CARE_BOOKING_UNAVAILABLE' });
    }
    console.error('Care booking operation failed', { method: req.method, path: req.path, code: 'CARE_BOOKING_UNAVAILABLE' });
    return res.status(503).json({ error: 'Không thể xử lý lịch hẹn lúc này. Hãy thử lại sau.', code: 'CARE_BOOKING_UNAVAILABLE' });
  });
}

function parseObjectBody(body, keys, label) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join(',') !== [...keys].sort().join(',')) {
    throw new CareBookingValidationError(`${label} không đúng định dạng.`);
  }
}

function parseProviderQuery(query) {
  if (Object.keys(query).some(key => !['q', 'specialty', 'limit', 'offset'].includes(key))) throw new CareBookingValidationError('Bộ lọc bác sĩ không hợp lệ.');
  const term = (value, label) => {
    if (value === undefined) return '';
    if (typeof value !== 'string' || value.length > 100 || /[^\p{L}\p{N}\s-]/u.test(value)) throw new CareBookingValidationError(`${label} chỉ nhận chữ, số, dấu cách và gạch nối.`);
    return value.trim().replace(/\s+/g, ' ');
  };
  const pageValue = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d{1,6}$/.test(value) || Number(value) > max) throw new CareBookingValidationError('Phân trang không hợp lệ.');
    return Number(value);
  };
  const limit = pageValue(query.limit, 25, 50);
  const offset = pageValue(query.offset, 0, 100000);
  if (limit < 1) throw new CareBookingValidationError('Phân trang không hợp lệ.');
  return { query: term(query.q, 'Từ khóa'), specialty: term(query.specialty, 'Chuyên khoa'), limit, offset };
}

function parseDateRange(query, { now = new Date() } = {}) {
  if (Object.keys(query).some(key => !['from', 'to'].includes(key))
    || typeof query.from !== 'string' || typeof query.to !== 'string'
    || !UTC_ISO.test(query.from) || !UTC_ISO.test(query.to)) throw new CareBookingValidationError('Khoảng ngày UTC không hợp lệ.');
  const from = Date.parse(query.from);
  const to = Date.parse(query.to);
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= Math.max(from, nowMs) || to - Math.max(from, nowMs) > 7 * 24 * 60 * 60 * 1000) {
    throw new CareBookingValidationError('Chỉ có thể xem lịch trong 7 ngày tới.');
  }
  return { from: new Date(Math.max(from, nowMs)).toISOString(), to: new Date(to).toISOString() };
}

function parseAppointmentPage(query) {
  if (Object.keys(query).some(key => !['limit', 'offset'].includes(key))) throw new CareBookingValidationError('Phân trang lịch hẹn không hợp lệ.');
  const number = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d{1,6}$/.test(value) || Number(value) > max) throw new CareBookingValidationError('Phân trang lịch hẹn không hợp lệ.');
    return Number(value);
  };
  const limit = number(query.limit, 25, 50);
  const offset = number(query.offset, 0, 100000);
  if (!limit) throw new CareBookingValidationError('Phân trang lịch hẹn không hợp lệ.');
  return { limit, offset };
}

function createCareBookingRouter({ repository = createCareBookingRepository(), requireCurrentConsent = createCurrentConsentMiddleware(), now = () => new Date() } = {}) {
  const router = express.Router();
  router.use(requireCurrentConsent);

  router.get('/providers', asyncRoute(async (req, res) => {
    const filters = parseProviderQuery(req.query);
    const page = await repository.listVerifiedProviders({ db: req.userDatabase, ...filters });
    return res.json({ ...page, hasMore: page.offset + page.items.length < page.total });
  }));

  router.get('/providers/:providerId/availability', asyncRoute(async (req, res) => {
    if (!UUID.test(req.params.providerId)) return res.status(404).json({ error: 'Không tìm thấy lịch bác sĩ.', code: 'PROVIDER_NOT_FOUND' });
    const range = parseDateRange(req.query, { now: now() });
    const slots = await repository.listAvailability({ db: req.userDatabase, providerId: req.params.providerId.toLowerCase(), ...range });
    return res.json({ items: slots, range });
  }));

  router.get('/provider-profile', asyncRoute(async (req, res) => {
    return res.json({ provider: await repository.getProviderProfile({ db: req.userDatabase, userId: req.auth.user.id }) });
  }));

  router.put('/provider-profile', asyncRoute(async (req, res) => {
    parseObjectBody(req.body, ['profile', 'credentials'], 'Hồ sơ nhà cung cấp');
    const profile = normalizeProviderProfile(req.body.profile);
    const credentials = normalizeProviderCredentials(req.body.credentials);
    const provider = await repository.saveProviderApplication({ db: req.userDatabase, userId: req.auth.user.id, profile, credentials });
    return res.json({ provider });
  }));

  router.get('/provider/availability', asyncRoute(async (req, res) => {
    const range = parseDateRange(req.query, { now: now() });
    const result = await repository.getProviderSlots({ db: req.userDatabase, userId: req.auth.user.id, ...range });
    if (!result.provider) return res.status(404).json({ error: 'Chưa có hồ sơ nhà cung cấp.', code: 'PROVIDER_PROFILE_NOT_FOUND' });
    return res.json({ provider: result.provider, items: result.slots, range });
  }));

  router.post('/provider/availability', asyncRoute(async (req, res) => {
    const slotInput = normalizeAvailabilitySlot(req.body, { now: now() });
    const slot = await repository.createAvailability({ db: req.userDatabase, userId: req.auth.user.id, slot: slotInput });
    return res.status(201).json({ slot });
  }));

  router.delete('/provider/availability/:slotId', asyncRoute(async (req, res) => {
    if (!UUID.test(req.params.slotId)) return res.status(404).json({ error: 'Không tìm thấy khung giờ.', code: 'SLOT_NOT_FOUND' });
    if (!await repository.deleteAvailability({ db: req.userDatabase, userId: req.auth.user.id, slotId: req.params.slotId.toLowerCase() })) {
      return res.status(404).json({ error: 'Không tìm thấy khung giờ còn trống.', code: 'SLOT_NOT_FOUND' });
    }
    return res.sendStatus(204);
  }));

  router.get('/appointments', asyncRoute(async (req, res) => {
    const page = await repository.listPatientAppointments({ db: req.userDatabase, userId: req.auth.user.id, ...parseAppointmentPage(req.query) });
    return res.json({ ...page, hasMore: page.offset + page.items.length < page.total });
  }));

  router.post('/appointments', asyncRoute(async (req, res) => {
    const input = normalizeBookingInput(req.body);
    const requestKey = req.get('Idempotency-Key');
    if (!validIdempotencyKey(requestKey)) throw new CareBookingValidationError('Cần Idempotency-Key dài 8–128 ký tự ASCII.', 'INVALID_IDEMPOTENCY_KEY');
    const result = await repository.createAppointment({ db: req.userDatabase, userId: req.auth.user.id, input, requestKey, requestHash: appointmentRequestHash(input) });
    return res.status(result.replayed ? 200 : 201).json(result);
  }));

  router.get('/appointments/:appointmentId', asyncRoute(async (req, res) => {
    if (!UUID.test(req.params.appointmentId)) return res.status(404).json({ error: 'Không tìm thấy lịch hẹn.', code: 'APPOINTMENT_NOT_FOUND' });
    const appointment = await repository.getPatientAppointment({ db: req.userDatabase, userId: req.auth.user.id, appointmentId: req.params.appointmentId.toLowerCase() });
    if (!appointment) return res.status(404).json({ error: 'Không tìm thấy lịch hẹn.', code: 'APPOINTMENT_NOT_FOUND' });
    return res.json({ appointment });
  }));

  router.post('/appointments/:appointmentId/cancel', asyncRoute(async (req, res) => {
    if (!UUID.test(req.params.appointmentId)) return res.status(404).json({ error: 'Không tìm thấy lịch hẹn.', code: 'APPOINTMENT_NOT_FOUND' });
    const cancellation = normalizeCancelInput(req.body);
    const result = await repository.cancelAppointment({ db: req.userDatabase, userId: req.auth.user.id, appointmentId: req.params.appointmentId.toLowerCase(), cancellation, actor: 'patient' });
    return res.json(result);
  }));

  router.get('/provider/appointments', asyncRoute(async (req, res) => {
    const page = await repository.listProviderAppointments({ db: req.userDatabase, userId: req.auth.user.id, ...parseAppointmentPage(req.query) });
    return res.json({ ...page, hasMore: page.offset + page.items.length < page.total });
  }));

  router.post('/provider/appointments/:appointmentId/complete', asyncRoute(async (req, res) => {
    if (!UUID.test(req.params.appointmentId)) return res.status(404).json({ error: 'Không tìm thấy lịch hẹn.', code: 'APPOINTMENT_NOT_FOUND' });
    parseObjectBody(req.body, [], 'Yêu cầu hoàn tất lịch hẹn');
    const appointment = await repository.completeAppointment({ db: req.userDatabase, userId: req.auth.user.id, appointmentId: req.params.appointmentId.toLowerCase() });
    return res.json({ appointment });
  }));

  router.post('/provider/appointments/:appointmentId/cancel', asyncRoute(async (req, res) => {
    if (!UUID.test(req.params.appointmentId)) return res.status(404).json({ error: 'Không tìm thấy lịch hẹn.', code: 'APPOINTMENT_NOT_FOUND' });
    const cancellation = normalizeCancelInput(req.body);
    const result = await repository.cancelAppointment({ db: req.userDatabase, userId: req.auth.user.id, appointmentId: req.params.appointmentId.toLowerCase(), cancellation, actor: 'provider' });
    if (result.actor !== 'provider') return res.status(403).json({ error: 'Không có quyền quản lý lịch hẹn này.', code: 'CARE_FORBIDDEN' });
    return res.json(result);
  }));

  return router;
}

module.exports = { UTC_ISO, createCareBookingRouter, parseAppointmentPage, parseDateRange, parseProviderQuery };
