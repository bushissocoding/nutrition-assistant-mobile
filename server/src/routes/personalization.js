'use strict';

const express = require('express');
const { logApiFailure } = require('../observability/request-telemetry');
const { PersonalizationRepositoryError, createPersonalizationRepository } = require('../repositories/personalization-repository');

const VARIETY_VALUES = new Set(['simple', 'balanced', 'varied']);
const FOOD_PREFERENCES = new Set(['vegetarian', 'low_sugar', 'low_salt', 'mild', 'Vietnamese', 'easy_cook']);
const KEYS = ['dietaryVariety', 'foodPreferences', 'allergyReminder', 'trackConfirmedTargets'];

function normalizePersonalization(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== KEYS.length || Object.keys(body).some(key => !KEYS.includes(key))
    || !VARIETY_VALUES.has(body.dietaryVariety)
    || !Array.isArray(body.foodPreferences) || body.foodPreferences.length > FOOD_PREFERENCES.size
    || body.foodPreferences.some(value => typeof value !== 'string' || !FOOD_PREFERENCES.has(value))
    || new Set(body.foodPreferences).size !== body.foodPreferences.length
    || typeof body.allergyReminder !== 'boolean' || typeof body.trackConfirmedTargets !== 'boolean') {
    throw new PersonalizationRepositoryError('Lựa chọn cá nhân hóa không hợp lệ.', 400, 'INVALID_PERSONALIZATION');
  }
  return {
    dietaryVariety: body.dietaryVariety,
    foodPreferences: [...body.foodPreferences],
    allergyReminder: body.allergyReminder,
    trackConfirmedTargets: body.trackConfirmedTargets,
  };
}

function createPersonalizationRouter({ repository = createPersonalizationRepository() } = {}) {
  const router = express.Router();
  const handle = handler => (req, res) => Promise.resolve(handler(req, res)).catch(error => {
    if (error instanceof PersonalizationRepositoryError || Number.isInteger(error?.status)) {
      return res.status(error.status).json({ error: error.message, code: error.code || 'PERSONALIZATION_UNAVAILABLE' });
    }
    logApiFailure(req, 'personalization_operation_failed', 'PERSONALIZATION_UNAVAILABLE');
    return res.status(503).json({ error: 'Không thể xử lý lựa chọn cá nhân hóa lúc này. Hãy thử lại sau.', code: 'PERSONALIZATION_UNAVAILABLE' });
  });

  router.get('/', handle(async (req, res) => {
    const preferences = await repository.get({ db: req.userDatabase, userId: req.auth.user.id });
    return res.json({ preferences });
  }));
  router.put('/', handle(async (req, res) => {
    const preferences = normalizePersonalization(req.body);
    const saved = await repository.save({ db: req.userDatabase, preferences });
    return res.json({ preferences: saved });
  }));
  return router;
}

module.exports = { FOOD_PREFERENCES, KEYS, VARIETY_VALUES, createPersonalizationRouter, normalizePersonalization };
