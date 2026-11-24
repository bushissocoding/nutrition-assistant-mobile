const express = require('express');
const { randomUUID } = require('node:crypto');
const { getLocalDateRange, sortAndPaginateEntries } = require('../services/meal-entries');
const {
  aggregateMealEntries,
  createAccountMealEntry,
  normalizeAccountMealEntryInput,
  updateAccountMealEntry,
} = require('../services/account-meal-entries');
const {
  AccountMealEntryRepositoryError,
  createAccountMealEntryRepository,
} = require('../repositories/account-meal-entry-repository');
const { createCurrentConsentMiddleware } = require('../middleware/current-consent');
const { validIdempotencyKey } = require('../repositories/meal-plan-repository');
const { sendFoodSourceError } = require('./sourced-foods');
const { FoodSourceError } = require('../services/fdc-food-source');

const DISCLAIMER = 'Giá trị dinh dưỡng được tính từ dữ liệu USDA đã lưu tại thời điểm ghi nhận; đây không phải tư vấn y tế.';
const MAX_DAILY_ROWS = 500;
const MAX_REPORT_DAYS = 31;
const MAX_REPORT_ROWS = 2000;

function parseReportQuery(query) {
  if (Object.keys(query).some(key => !['date', 'timeZone', 'days'].includes(key))) {
    const error = new Error('Truy vấn báo cáo có tham số không được hỗ trợ.');
    error.status = 400; error.code = 'VALIDATION_ERROR'; throw error;
  }
  if (typeof query.date !== 'string' || typeof query.timeZone !== 'string') {
    const error = new Error('Cần cung cấp date và timeZone để xem báo cáo.');
    error.status = 400; error.code = 'VALIDATION_ERROR'; throw error;
  }
  let days = 7;
  if (query.days !== undefined) {
    if (typeof query.days !== 'string' || !/^\d{1,2}$/.test(query.days) || Number(query.days) < 1 || Number(query.days) > MAX_REPORT_DAYS) {
      const error = new Error(`days phải là số từ 1 đến ${MAX_REPORT_DAYS}.`);
      error.status = 400; error.code = 'VALIDATION_ERROR'; throw error;
    }
    days = Number(query.days);
  }
  const last = new Date(`${query.date}T00:00:00.000Z`);
  if (!Number.isFinite(last.getTime()) || last.toISOString().slice(0, 10) !== query.date) {
    const error = new Error('Ngày lịch không hợp lệ.');
    error.status = 400; error.code = 'VALIDATION_ERROR'; throw error;
  }
  const dates = Array.from({ length: days }, (_, index) => {
    const day = new Date(last);
    day.setUTCDate(last.getUTCDate() - (days - index - 1));
    return day.toISOString().slice(0, 10);
  });
  const firstRange = getLocalDateRange(dates[0], query.timeZone);
  const lastRange = getLocalDateRange(query.date, query.timeZone);
  return { date: query.date, timeZone: query.timeZone, dates, start: firstRange.start, end: lastRange.end };
}

function sendAccountDiaryError(req, res, error) {
  if (error instanceof AccountMealEntryRepositoryError || Number.isInteger(error?.status)) {
    return res.status(error.status).json({ error: error.message, code: error.code || 'MEAL_DIARY_UNAVAILABLE' });
  }
  if (error instanceof FoodSourceError) return sendFoodSourceError(res, error);
  console.error('Account meal diary operation failed', { method: req.method, path: req.path, code: 'MEAL_DIARY_UNAVAILABLE' });
  return res.status(503).json({ error: 'Không thể xử lý nhật ký lúc này. Hãy thử lại sau.', code: 'MEAL_DIARY_UNAVAILABLE' });
}

function asyncRoute(handler) {
  return (req, res) => Promise.resolve(handler(req, res)).catch(error => sendAccountDiaryError(req, res, error));
}

async function resolveFood(foodSource, fdcId) {
  if (!foodSource || typeof foodSource.getFood !== 'function') {
    throw new FoodSourceError('FOOD_SOURCE_UNAVAILABLE', 'Nguồn thực phẩm USDA chưa được cấu hình.');
  }
  return foodSource.getFood(fdcId);
}

function createAccountMealEntryRouter({ foodSource, repository = createAccountMealEntryRepository(), requireCurrentConsent = createCurrentConsentMiddleware() } = {}) {
  const router = express.Router();
  router.use(requireCurrentConsent);

  router.post('/', asyncRoute(async (req, res) => {
    const input = normalizeAccountMealEntryInput(req.body);
    const requestKey = req.get('Idempotency-Key');
    if (!validIdempotencyKey(requestKey)) return res.status(400).json({ error: 'Cần Idempotency-Key dài 8–128 ký tự ASCII.', code: 'INVALID_IDEMPOTENCY_KEY' });
    const replay = await repository.replay({ db: req.userDatabase, userId: req.auth.user.id, requestKey, input });
    if (replay) return res.json({ item: replay.item, disclaimer: DISCLAIMER });
    const food = await resolveFood(foodSource, input.foodId.slice(4));
    const item = createAccountMealEntry(input, food, randomUUID());
    const result = await repository.create({ db: req.userDatabase, userId: req.auth.user.id, requestKey, input, item });
    return res.status(result.replayed ? 200 : 201).json({ item: result.item, disclaimer: DISCLAIMER });
  }));

  router.get('/', asyncRoute(async (req, res) => {
    const { parseListQuery } = require('./meal-entries');
    const query = parseListQuery(req.query);
    const range = getLocalDateRange(query.date, query.timeZone);
    const entries = await repository.listForReport({ db: req.userDatabase, userId: req.auth.user.id, ...range, maximumRows: MAX_DAILY_ROWS });
    const page = sortAndPaginateEntries(entries, query);
    return res.json({
      date: query.date,
      timeZone: query.timeZone,
      items: page.items,
      pagination: { ...page.pagination, total: entries.length },
      ...aggregateMealEntries(entries),
      disclaimer: DISCLAIMER,
    });
  }));

  router.get('/:id', asyncRoute(async (req, res) => {
    const item = await repository.get({ db: req.userDatabase, userId: req.auth.user.id, id: req.params.id });
    if (!item) return res.status(404).json({ error: 'Không tìm thấy bản ghi nhật ký.', code: 'MEAL_ENTRY_NOT_FOUND' });
    return res.json({ item, disclaimer: DISCLAIMER });
  }));

  router.patch('/:id', asyncRoute(async (req, res) => {
    const current = await repository.get({ db: req.userDatabase, userId: req.auth.user.id, id: req.params.id });
    if (!current) return res.status(404).json({ error: 'Không tìm thấy bản ghi nhật ký.', code: 'MEAL_ENTRY_NOT_FOUND' });
    const input = normalizeAccountMealEntryInput(req.body);
    const food = await resolveFood(foodSource, input.foodId.slice(4));
    const item = updateAccountMealEntry(current, input, food);
    const updated = await repository.update({ db: req.userDatabase, userId: req.auth.user.id, id: req.params.id, item });
    if (!updated) return res.status(404).json({ error: 'Không tìm thấy bản ghi nhật ký.', code: 'MEAL_ENTRY_NOT_FOUND' });
    return res.json({ item: updated, disclaimer: DISCLAIMER });
  }));

  router.delete('/:id', asyncRoute(async (req, res) => {
    const removed = await repository.delete({ db: req.userDatabase, userId: req.auth.user.id, id: req.params.id });
    if (!removed) return res.status(404).json({ error: 'Không tìm thấy bản ghi nhật ký.', code: 'MEAL_ENTRY_NOT_FOUND' });
    return res.sendStatus(204);
  }));
  return router;
}

module.exports = { DISCLAIMER, MAX_DAILY_ROWS, MAX_REPORT_DAYS, MAX_REPORT_ROWS, createAccountMealEntryRouter, parseReportQuery, resolveFood };
