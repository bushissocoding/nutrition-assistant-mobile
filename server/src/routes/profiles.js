const express = require('express');
const { parseProfileInput, toProfileDto } = require('../services/profile');
const { getProfile, saveProfile, deleteProfile } = require('../repositories/profile-repository');
const { createCurrentConsentMiddleware } = require('../middleware/current-consent');
const { logApiFailure } = require('../observability/request-telemetry');

function createProfileRouter({ requireCurrentConsent = createCurrentConsentMiddleware() } = {}) {
  const router = express.Router();
  router.use(requireCurrentConsent);

  router.get('/', async (req, res) => {
    try {
      const row = await getProfile(req.userDatabase, req.auth.user.id);
      return res.json({ profile: toProfileDto(row) });
    } catch {
      return res.status(503).json({ error: 'Không thể tải hồ sơ lúc này.', code: 'PROFILE_UNAVAILABLE' });
    }
  });

  router.put('/', async (req, res) => {
    let profile;
    try { profile = parseProfileInput(req.body); }
    catch (error) { return res.status(400).json({ error: error.message, code: 'INVALID_PROFILE' }); }
    try {
      const row = await saveProfile(req.userDatabase, req.auth.user.id, profile);
      return res.json({ profile: toProfileDto(row) });
    } catch (error) {
      if (error?.code === '23505' || error?.code === 'USERNAME_TAKEN') {
        return res.status(409).json({ error: 'Tên người dùng đã được sử dụng.', code: 'USERNAME_TAKEN' });
      }
      logApiFailure(req, 'profile_save_failed', error?.code);
      return res.status(503).json({ error: 'Không thể lưu hồ sơ lúc này.', code: 'PROFILE_UNAVAILABLE' });
    }
  });

  router.delete('/', async (req, res) => {
    try {
      await deleteProfile(req.userDatabase, req.auth.user.id);
      return res.status(204).end();
    } catch {
      return res.status(503).json({ error: 'Không thể xóa hồ sơ lúc này.', code: 'PROFILE_UNAVAILABLE' });
    }
  });
  return router;
}

module.exports = { createProfileRouter };
