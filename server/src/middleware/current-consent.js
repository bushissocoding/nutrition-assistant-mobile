const { hasRequiredConsent, readCurrentConsent } = require('../services/consent');

function createCurrentConsentMiddleware() {
  return async function requireCurrentConsent(req, res, next) {
    try {
      const record = await readCurrentConsent(req.userDatabase, req.auth.user.id);
      if (!hasRequiredConsent(record)) {
        return res.status(403).json({ error: 'Hãy xem lại và xác nhận các lựa chọn dữ liệu trước khi tiếp tục.', code: 'CONSENT_REQUIRED' });
      }
      req.currentConsent = record;
      return next();
    } catch {
      return res.status(503).json({ error: 'Không thể tải lựa chọn dữ liệu lúc này.', code: 'CONSENT_UNAVAILABLE' });
    }
  };
}

module.exports = { createCurrentConsentMiddleware };
