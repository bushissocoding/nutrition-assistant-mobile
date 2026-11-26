const express = require('express');
const { buildNutritionReport } = require('../services/account-meal-entries');
const { createAccountMealEntryRepository, MAX_RANGE_ROWS, AccountMealEntryRepositoryError } = require('../repositories/account-meal-entry-repository');
const { createCurrentConsentMiddleware } = require('../middleware/current-consent');
const { DISCLAIMER, MAX_REPORT_ROWS, parseReportQuery } = require('./account-meal-entries');

function createNutritionReportRouter({ repository = createAccountMealEntryRepository(), requireCurrentConsent = createCurrentConsentMiddleware() } = {}) {
  const router = express.Router();
  router.use(requireCurrentConsent);
  router.get('/', async (req, res) => {
    let query;
    try { query = parseReportQuery(req.query); }
    catch (error) { return res.status(error.status || 400).json({ error: error.message, code: error.code || 'VALIDATION_ERROR' }); }
    try {
      const entries = await repository.listForReport({ db: req.userDatabase, userId: req.auth.user.id, start: query.start, end: query.end, maximumRows: Math.min(MAX_REPORT_ROWS, MAX_RANGE_ROWS) });
      return res.json({ ...buildNutritionReport({ entries, dates: query.dates, timeZone: query.timeZone }), requestedDate: query.date, disclaimer: DISCLAIMER });
    } catch (error) {
      if (error instanceof AccountMealEntryRepositoryError) return res.status(error.status).json({ error: error.message, code: error.code });
      return res.status(503).json({ error: 'Không thể tạo báo cáo dinh dưỡng lúc này.', code: 'NUTRITION_REPORT_UNAVAILABLE' });
    }
  });
  return router;
}

module.exports = { createNutritionReportRouter };
