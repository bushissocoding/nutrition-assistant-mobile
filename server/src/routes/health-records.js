const express = require('express');
const { logApiFailure } = require('../observability/request-telemetry');
const { createHealthRecordRepository, HealthRecordError, MAX_SOURCE_BYTES } = require('../repositories/health-record-repository');
const { hasRequiredConsent, readCurrentConsent } = require('../services/consent');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asyncRoute(handler) {
  return (req, res) => Promise.resolve(handler(req, res)).catch(error => {
    if (error instanceof HealthRecordError || Number.isInteger(error?.status)) {
      return res.status(error.status).json({ error: error.message, code: error.code || 'HEALTH_RECORD_UNAVAILABLE' });
    }
    logApiFailure(req, 'health_record_operation_failed', 'HEALTH_RECORD_UNAVAILABLE');
    return res.status(503).json({ error: 'Không thể xử lý hồ sơ xét nghiệm lúc này. Hãy thử lại sau.', code: 'HEALTH_RECORD_UNAVAILABLE' });
  });
}

function invalidInput(message = 'Thông tin hồ sơ xét nghiệm không hợp lệ.') {
  return new HealthRecordError(message, 400, 'INVALID_HEALTH_RECORD');
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function normalizeRecordInput(body) {
  if (!exactKeys(body, ['title', 'sourceDate', 'note', 'results'])) throw invalidInput();
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 120
    || typeof body.note !== 'string' || body.note.length > 1000
    || !(body.sourceDate === null || (typeof body.sourceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.sourceDate) && !Number.isNaN(Date.parse(`${body.sourceDate}T00:00:00.000Z`)) && new Date(`${body.sourceDate}T00:00:00.000Z`).toISOString().startsWith(body.sourceDate)))
    || !Array.isArray(body.results) || body.results.length < 1 || body.results.length > 50) throw invalidInput();
  const results = body.results.map(result => {
    if (!exactKeys(result, ['name', 'value', 'unit', 'referenceRange', 'confirmed'])
      || result.confirmed !== true
      || typeof result.name !== 'string' || !result.name.trim() || result.name.trim().length > 100
      || typeof result.value !== 'string' || !result.value.trim() || result.value.trim().length > 100
      || typeof result.unit !== 'string' || result.unit.length > 40
      || typeof result.referenceRange !== 'string' || result.referenceRange.length > 80) throw invalidInput('Chỉ lưu được giá trị bạn đã xem lại và xác nhận.');
    return { name: result.name.trim(), value: result.value.trim(), unit: result.unit.trim(), referenceRange: result.referenceRange.trim(), confirmed: true };
  });
  return { title: body.title.trim(), sourceDate: body.sourceDate, note: body.note, results };
}

function parsePage(query) {
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) throw invalidInput('Phân trang hồ sơ không hợp lệ.');
  return { limit, offset };
}

function createHealthRecordConsentMiddleware() {
  return async function requireHealthRecordConsent(req, res, next) {
    try {
      const record = await readCurrentConsent(req.userDatabase, req.auth.user.id);
      if (!hasRequiredConsent(record) || record.choices?.health_record_storage !== true) {
        return res.status(403).json({ error: 'Hãy xác nhận quyền lưu hồ sơ xét nghiệm trước khi tiếp tục.', code: 'HEALTH_RECORD_CONSENT_REQUIRED' });
      }
      return next();
    } catch {
      return res.status(503).json({ error: 'Không thể tải lựa chọn dữ liệu lúc này.', code: 'CONSENT_UNAVAILABLE' });
    }
  };
}

function createHealthRecordRouter({ repository = createHealthRecordRepository(), requireHealthRecordConsent = createHealthRecordConsentMiddleware() } = {}) {
  const router = express.Router();
  const parseImage = express.raw({ type: 'application/octet-stream', limit: MAX_SOURCE_BYTES });

  router.get('/', asyncRoute(async (req, res) => res.json(await repository.list({ db: req.userDatabase, userId: req.auth.user.id, ...parsePage(req.query) }))));

  router.post('/', requireHealthRecordConsent, asyncRoute(async (req, res) => {
    const requestKey = req.get('Idempotency-Key');
    if (typeof requestKey !== 'string' || !UUID.test(requestKey)) throw invalidInput('Yêu cầu lưu hồ sơ cần mã thử lại hợp lệ.');
    const record = await repository.save({ db: req.userDatabase, userId: req.auth.user.id, requestKey: requestKey.toLowerCase(), input: normalizeRecordInput(req.body) });
    return res.status(201).json({ record });
  }));

  router.get('/:recordId/source', asyncRoute(async (req, res) => {
    if (!UUID.test(req.params.recordId)) return res.status(404).json({ error: 'Không tìm thấy ảnh hồ sơ.', code: 'HEALTH_RECORD_SOURCE_NOT_FOUND' });
    const source = await repository.getSourceUrl({ db: req.userDatabase, userId: req.auth.user.id, recordId: req.params.recordId.toLowerCase() });
    if (!source) return res.status(404).json({ error: 'Không tìm thấy hồ sơ xét nghiệm.', code: 'HEALTH_RECORD_NOT_FOUND' });
    return res.json({ source });
  }));

  router.put('/:recordId/source', requireHealthRecordConsent, parseImage, asyncRoute(async (req, res) => {
    if (!UUID.test(req.params.recordId)) throw new HealthRecordError('Không tìm thấy hồ sơ xét nghiệm.', 404, 'HEALTH_RECORD_NOT_FOUND');
    if (!Buffer.isBuffer(req.body)) throw invalidInput('Ảnh tải lên không đúng định dạng.');
    const mimeType = req.get('X-Record-Content-Type');
    const record = await repository.uploadSource({ db: req.userDatabase, userId: req.auth.user.id, recordId: req.params.recordId.toLowerCase(), bytes: req.body, mimeType });
    return res.json({ record });
  }));

  router.get('/:recordId', asyncRoute(async (req, res) => {
    if (!UUID.test(req.params.recordId)) return res.status(404).json({ error: 'Không tìm thấy hồ sơ xét nghiệm.', code: 'HEALTH_RECORD_NOT_FOUND' });
    const record = await repository.get({ db: req.userDatabase, userId: req.auth.user.id, recordId: req.params.recordId.toLowerCase() });
    if (!record) return res.status(404).json({ error: 'Không tìm thấy hồ sơ xét nghiệm.', code: 'HEALTH_RECORD_NOT_FOUND' });
    return res.json({ record });
  }));

  router.put('/:recordId', requireHealthRecordConsent, asyncRoute(async (req, res) => {
    if (!UUID.test(req.params.recordId)) return res.status(404).json({ error: 'Không tìm thấy hồ sơ xét nghiệm.', code: 'HEALTH_RECORD_NOT_FOUND' });
    const record = await repository.save({ db: req.userDatabase, userId: req.auth.user.id, recordId: req.params.recordId.toLowerCase(), input: normalizeRecordInput(req.body) });
    return res.json({ record });
  }));

  router.delete('/:recordId', asyncRoute(async (req, res) => {
    if (!UUID.test(req.params.recordId)) return res.status(404).json({ error: 'Không tìm thấy hồ sơ xét nghiệm.', code: 'HEALTH_RECORD_NOT_FOUND' });
    const deleted = await repository.delete({ db: req.userDatabase, userId: req.auth.user.id, recordId: req.params.recordId.toLowerCase() });
    if (!deleted) return res.status(404).json({ error: 'Không tìm thấy hồ sơ xét nghiệm.', code: 'HEALTH_RECORD_NOT_FOUND' });
    return res.status(204).end();
  }));
  return router;
}

module.exports = { UUID, asyncRoute, createHealthRecordConsentMiddleware, createHealthRecordRouter, normalizeRecordInput, parsePage };
