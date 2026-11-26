const express = require('express');
const { getProfile } = require('../repositories/profile-repository');
const { createMealPlanRepository, MealPlanRepositoryError, validIdempotencyKey } = require('../repositories/meal-plan-repository');
const { createCurrentConsentMiddleware } = require('../middleware/current-consent');
const { createSourcedMealPlan } = require('../services/sourced-meal-plans');

function parsePlanInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (Object.keys(input).some(key => !['contractVersion', 'preferences', 'dietaryVariety'].includes(key))) return null;
  if (input.contractVersion !== undefined && input.contractVersion !== 1) return null;
  if (input.preferences !== undefined && (typeof input.preferences !== 'string' || input.preferences.length > 200)) return null;
  const dietaryVariety = input.dietaryVariety === undefined ? 'balanced' : input.dietaryVariety;
  if (!['simple', 'balanced', 'varied'].includes(dietaryVariety)) return null;
  return { contractVersion: 1, preferences: typeof input.preferences === 'string' ? input.preferences.trim() : '', dietaryVariety };
}

function pageValue(value, fallback, maximum) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d{1,5}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed <= maximum ? parsed : null;
}

function createMealPlanRouter({ foods, mealTemplates, catalog, foodSource, repository = createMealPlanRepository(), requireCurrentConsent = createCurrentConsentMiddleware() } = {}) {
  const router = express.Router();
  router.use(requireCurrentConsent);

  function savedResponse(record) {
    return {
      ...record.plan,
      savedPlan: { id: record.id, createdAt: record.createdAt, catalogVersion: record.catalogVersion, profileUpdatedAt: record.profileUpdatedAt },
    };
  }

  router.get('/', async (req, res) => {
    const limit = pageValue(req.query.limit, 20, 50);
    const offset = pageValue(req.query.offset, 0, 10000);
    if (!limit || offset === null) return res.status(400).json({ error: 'Phân trang kế hoạch không hợp lệ.', code: 'INVALID_PAGINATION' });
    try { return res.json(await repository.list({ db: req.userDatabase, userId: req.auth.user.id, limit, offset })); }
    catch { return res.status(503).json({ error: 'Không thể tải lịch sử kế hoạch lúc này.', code: 'MEAL_PLAN_UNAVAILABLE' }); }
  });

  router.post('/', async (req, res) => {
    const input = parsePlanInput(req.body);
    if (!input) return res.status(400).json({ error: 'Chỉ nhận contractVersion và sở thích; dị ứng/giới hạn lấy từ hồ sơ.', code: 'INVALID_MEAL_PLAN_REQUEST' });
    const requestKey = req.get('Idempotency-Key');
    if (!validIdempotencyKey(requestKey)) return res.status(400).json({ error: 'Cần Idempotency-Key dài 8–128 ký tự ASCII.', code: 'INVALID_IDEMPOTENCY_KEY' });

    let profile;
    try { profile = await getProfile(req.userDatabase, req.auth.user.id); }
    catch { return res.status(503).json({ error: 'Không thể tải hồ sơ tài khoản lúc này.', code: 'PROFILE_UNAVAILABLE' }); }
    if (!profile) return res.status(409).json({ error: 'Hãy hoàn tất hồ sơ trước khi tạo kế hoạch.', code: 'PROFILE_REQUIRED' });

    try {
      const replay = await repository.replay({
        db: req.userDatabase,
        userId: req.auth.user.id,
        requestKey,
        input,
        profileUpdatedAt: profile.updated_at || null,
        catalogVersion: catalog?.version || 'catalog-pending',
      });
      if (replay) return res.json(savedResponse(replay.record));
    } catch (error) {
      if (error instanceof MealPlanRepositoryError) return res.status(error.status).json({ error: error.message, code: error.code });
      return res.status(503).json({ error: 'Không thể xác minh lần lưu kế hoạch trước.', code: 'MEAL_PLAN_UNAVAILABLE' });
    }

    const result = await createSourcedMealPlan({ foods, mealTemplates, catalog, profile, foodSource, input });
    if (result.status !== 'feasible' || result.planFeasible !== true) return res.json(result);
    try {
      const { record, replayed } = await repository.create({
        db: req.userDatabase,
        userId: req.auth.user.id,
        requestKey,
        input,
        plan: result,
        profileUpdatedAt: profile.updated_at || null,
        catalogVersion: result.metadata.catalogVersion,
      });
      return res.status(replayed ? 200 : 201).json(savedResponse(record));
    } catch (error) {
      if (error instanceof MealPlanRepositoryError) return res.status(error.status).json({ error: error.message, code: error.code });
      return res.status(503).json({ error: 'Không thể lưu kế hoạch lúc này.', code: 'MEAL_PLAN_UNAVAILABLE' });
    }
  });
  return router;
}

module.exports = { createMealPlanRouter, parsePlanInput, pageValue };
