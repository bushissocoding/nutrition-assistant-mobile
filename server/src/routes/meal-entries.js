const express = require('express');
const { calculateTotals } = require('../services/nutrition');
const {
  MealEntryValidationError,
  getLocalDateRange,
  normalizeMealEntryInput,
  sortAndPaginateEntries,
} = require('../services/meal-entries');
const { createMealEntryRepository } = require('../repositories/meal-entry-repository');

const DISCLAIMER = 'Giá trị dinh dưỡng là ước tính từ danh mục demo, không phải tư vấn y tế.';
const ALLOWED_LIST_QUERY = new Set(['date', 'timeZone', 'limit', 'offset']);

function parseListQuery(query) {
  if (Object.keys(query).some(key => !ALLOWED_LIST_QUERY.has(key))) {
    throw new MealEntryValidationError('Truy vấn có tham số không được hỗ trợ.');
  }
  if (typeof query.date !== 'string' || typeof query.timeZone !== 'string') {
    throw new MealEntryValidationError('Cần cung cấp date và timeZone để xem nhật ký.');
  }

  const parseInteger = (value, fallback, minimum, maximum, label) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) {
      throw new MealEntryValidationError(`${label} phải là số nguyên không âm.`);
    }
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
      throw new MealEntryValidationError(`${label} nằm ngoài giới hạn cho phép.`);
    }
    return number;
  };

  return {
    date: query.date,
    timeZone: query.timeZone,
    limit: parseInteger(query.limit, 50, 1, 100, 'limit'),
    offset: parseInteger(query.offset, 0, 0, Number.MAX_SAFE_INTEGER, 'offset'),
  };
}

function sendRouteError(req, res, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR';
  if (status >= 500) console.error('Meal diary API operation failed', { method: req.method, path: req.path, code });
  const message = status === 500
    ? 'Không thể xử lý nhật ký lúc này. Hãy thử lại sau.'
    : error.message;
  res.status(status).json({ error: message, code });
}

function asyncRoute(handler) {
  return (req, res) => Promise.resolve(handler(req, res)).catch(error => sendRouteError(req, res, error));
}

function createMealEntryRouter({ foods, demoContext, repository = createMealEntryRepository({ store: demoContext?.store }) } = {}) {
  if (!Array.isArray(foods) || typeof demoContext?.requireScope !== 'function') {
    throw new TypeError('Meal entry routes require a catalog and demo context.');
  }

  const router = express.Router();
  router.use((req, res, next) => demoContext.requireScope(req, res, next));

  router.post('/', asyncRoute(async (req, res) => {
    const normalized = normalizeMealEntryInput(req.body, foods);
    const result = await repository.create(req.demoNamespace, normalized, foods, req.get('Idempotency-Key'));
    return res.status(result.replayed ? 200 : 201).json({ item: result.item, disclaimer: DISCLAIMER });
  }));

  router.get('/', asyncRoute(async (req, res) => {
    const query = parseListQuery(req.query);
    const range = getLocalDateRange(query.date, query.timeZone);
    const entries = await repository.listByRange(req.demoNamespace, range.start, range.end);
    const page = sortAndPaginateEntries(entries, query);
    const totals = calculateTotals(entries.map(item => ({ foodId: item.foodId, grams: item.portion.amount })), foods);
    return res.json({
      date: query.date,
      timeZone: query.timeZone,
      items: page.items,
      totals,
      pagination: page.pagination,
      disclaimer: DISCLAIMER,
    });
  }));

  router.get('/:id', asyncRoute(async (req, res) => {
    const item = await repository.get(req.demoNamespace, req.params.id);
    if (!item) return sendRouteError(req, res, Object.assign(new Error('Không tìm thấy bản ghi nhật ký.'), { status: 404, code: 'MEAL_ENTRY_NOT_FOUND' }));
    return res.json({ item, disclaimer: DISCLAIMER });
  }));

  router.patch('/:id', asyncRoute(async (req, res) => {
    const patch = normalizeMealEntryInput(req.body, foods, { partial: true });
    const item = await repository.update(req.demoNamespace, req.params.id, patch, foods);
    if (!item) return sendRouteError(req, res, Object.assign(new Error('Không tìm thấy bản ghi nhật ký.'), { status: 404, code: 'MEAL_ENTRY_NOT_FOUND' }));
    return res.json({ item, disclaimer: DISCLAIMER });
  }));

  router.delete('/:id', asyncRoute(async (req, res) => {
    await repository.delete(req.demoNamespace, req.params.id);
    return res.sendStatus(204);
  }));

  router.delete('/', asyncRoute(async (req, res) => {
    await repository.purge(req.demoNamespace);
    return res.sendStatus(204);
  }));

  return router;
}

module.exports = { createMealEntryRouter, parseListQuery };
