const express = require('express');
const { logApiFailure } = require('../observability/request-telemetry');
const { createHash } = require('node:crypto');
const { createCurrentConsentMiddleware } = require('../middleware/current-consent');
const {
  AccountGroceryRepositoryError,
  createAccountGroceryRepository,
} = require('../repositories/account-grocery-repository');
const {
  AccountGroceryValidationError,
  normalizePantryItemPatch,
  normalizePantryMutation,
  normalizeShoppingItemPatch,
} = require('../services/account-grocery');
const { validIdempotencyKey } = require('../repositories/meal-plan-repository');
const { FOOD_ID_PATTERN, FoodSourceError, parseFoodId } = require('../services/food-source');
const { sendFoodSourceError } = require('./sourced-foods');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parsePantryPage(query) {
  if (Object.keys(query).some(key => !['limit', 'offset'].includes(key))) throw new AccountGroceryRepositoryError('Truy vấn kho nhà không hợp lệ.', 400, 'INVALID_PAGINATION');
  const parse = (value, fallback, maximum) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d{1,5}$/.test(value)) return null;
    const number = Number(value);
    return number <= maximum ? number : null;
  };
  const limit = parse(query.limit, 100, 100);
  const offset = parse(query.offset, 0, 10000);
  if (!limit || offset === null) throw new AccountGroceryRepositoryError('Phân trang kho nhà không hợp lệ.', 400, 'INVALID_PAGINATION');
  return { limit, offset };
}

async function resolveFood(foodSource, foodId) {
  if (!foodSource || typeof foodSource.getFood !== 'function') {
    throw new FoodSourceError('FOOD_SOURCE_UNAVAILABLE');
  }
  const parsed = parseFoodId(foodId);
  if (!parsed) throw new FoodSourceError('INVALID_FOOD_ID', 'Mã thực phẩm không hợp lệ.');
  const food = await foodSource.getFood(parsed.recordId);
  if (food?.id !== foodId) throw new FoodSourceError('INVALID_FOOD_ID', 'Mã thực phẩm không khớp bản ghi của nguồn đã đăng ký.');
  return food;
}

function asyncRoute(handler) {
  return (req, res) => Promise.resolve(handler(req, res)).catch(error => {
    if (error instanceof AccountGroceryValidationError || error instanceof AccountGroceryRepositoryError || Number.isInteger(error?.status)) {
      return res.status(error.status).json({ error: error.message, code: error.code || 'GROCERY_UNAVAILABLE' });
    }
    if (error instanceof FoodSourceError) return sendFoodSourceError(res, error);
    logApiFailure(req, 'account_grocery_operation_failed', 'GROCERY_UNAVAILABLE');
    return res.status(503).json({ error: 'Không thể xử lý kho thực phẩm lúc này. Hãy thử lại sau.', code: 'GROCERY_UNAVAILABLE' });
  });
}

function createCustomPantryFoodId(name) {
  const normalized = String(name).normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
  return `custom:${createHash('sha256').update(normalized).digest('hex')}`;
}

function createAccountGroceryRouter({ foodSource, repository = createAccountGroceryRepository(), requireCurrentConsent = createCurrentConsentMiddleware() } = {}) {
  const router = express.Router();
  router.use(requireCurrentConsent);

  router.get('/shopping-list', asyncRoute(async (req, res) => {
    const list = await repository.getCurrent({ db: req.userDatabase, userId: req.auth.user.id });
    return res.json({ list });
  }));

  router.post('/shopping-list', asyncRoute(async (req, res) => {
    if (!req.body || Array.isArray(req.body) || Object.keys(req.body).some(key => key !== 'savedPlanId')
      || typeof req.body.savedPlanId !== 'string' || !UUID.test(req.body.savedPlanId)) {
      return res.status(400).json({ error: 'savedPlanId phải là ID của thực đơn đã lưu.', code: 'VALIDATION_ERROR' });
    }
    const requestKey = req.get('Idempotency-Key');
    if (!validIdempotencyKey(requestKey)) return res.status(400).json({ error: 'Cần Idempotency-Key dài 8–128 ký tự ASCII.', code: 'INVALID_IDEMPOTENCY_KEY' });
    const result = await repository.createFromPlan({ db: req.userDatabase, userId: req.auth.user.id, savedPlanId: req.body.savedPlanId, requestKey });
    return res.status(result.replayed ? 200 : 201).json({ list: result.list, replayed: result.replayed });
  }));

  router.delete('/shopping-list', asyncRoute(async (req, res) => {
    await repository.clearCurrent({ db: req.userDatabase });
    return res.sendStatus(204);
  }));

  router.post('/shopping-list/items', asyncRoute(async (req, res) => {
    const input = normalizePantryMutation(req.body);
    const food = await resolveFood(foodSource, input.foodId);
    const item = await repository.addShoppingItem({
      db: req.userDatabase,
      userId: req.auth.user.id,
      item: {
        ...input,
        name: food.name,
        purchased: false,
        source: { id: food.source.id, recordId: food.source.recordId, edition: food.source.edition },
        catalogVersion: food.catalogVersion,
      },
    });
    return res.status(201).json({ item });
  }));

  router.patch('/shopping-list/items/:id', asyncRoute(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Không tìm thấy nguyên liệu.', code: 'SHOPPING_ITEM_NOT_FOUND' });
    const patch = normalizeShoppingItemPatch(req.body);
    const row = { ...(patch.amount === undefined ? {} : { amount: patch.amount }), ...(patch.unit === undefined ? {} : { unit: patch.unit }), ...(patch.purchased === undefined ? {} : { purchased: patch.purchased }) };
    const item = await repository.updateShoppingItem({ db: req.userDatabase, userId: req.auth.user.id, itemId: req.params.id, patch: row });
    if (!item) return res.status(404).json({ error: 'Không tìm thấy nguyên liệu.', code: 'SHOPPING_ITEM_NOT_FOUND' });
    return res.json({ item });
  }));

  router.delete('/shopping-list/items/:id', asyncRoute(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Không tìm thấy nguyên liệu.', code: 'SHOPPING_ITEM_NOT_FOUND' });
    if (!await repository.deleteShoppingItem({ db: req.userDatabase, userId: req.auth.user.id, itemId: req.params.id })) {
      return res.status(404).json({ error: 'Không tìm thấy nguyên liệu.', code: 'SHOPPING_ITEM_NOT_FOUND' });
    }
    return res.sendStatus(204);
  }));

  router.get('/pantry', asyncRoute(async (req, res) => {
    const page = parsePantryPage(req.query);
    const result = await repository.listPantry({ db: req.userDatabase, userId: req.auth.user.id, ...page });
    return res.json({ items: result.items, pagination: { limit: result.limit, offset: result.offset, total: result.total, hasMore: result.total !== null && result.offset + result.items.length < result.total } });
  }));

  router.get('/pantry/food/:foodId', asyncRoute(async (req, res) => {
    if (!FOOD_ID_PATTERN.test(req.params.foodId)) return res.status(404).json({ error: 'Không tìm thấy nguyên liệu trong kho.', code: 'PANTRY_ITEM_NOT_FOUND' });
    const item = await repository.getPantryItemByFoodId({ db: req.userDatabase, userId: req.auth.user.id, foodId: req.params.foodId });
    if (!item) return res.status(404).json({ error: 'Không tìm thấy nguyên liệu trong kho.', code: 'PANTRY_ITEM_NOT_FOUND' });
    return res.json({ item });
  }));

  router.get('/pantry/:id', asyncRoute(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Không tìm thấy nguyên liệu trong kho.', code: 'PANTRY_ITEM_NOT_FOUND' });
    const item = await repository.getPantryItem({ db: req.userDatabase, userId: req.auth.user.id, itemId: req.params.id });
    if (!item) return res.status(404).json({ error: 'Không tìm thấy nguyên liệu trong kho.', code: 'PANTRY_ITEM_NOT_FOUND' });
    return res.json({ item });
  }));

  router.post('/pantry', asyncRoute(async (req, res) => {
    const input = normalizePantryMutation(req.body);
    const food = input.customName ? null : await resolveFood(foodSource, input.foodId);
    const result = await repository.createPantryItem({
      db: req.userDatabase,
      userId: req.auth.user.id,
      item: {
        ...(input.customName ? {
          foodId: createCustomPantryFoodId(input.customName),
          amount: input.amount,
          unit: input.unit,
          name: input.customName,
          source: { id: 'USER-ENTERED' },
          catalogVersion: 'user-entered-v1',
        } : {
          ...input,
          name: food.name,
          source: { id: food.source.id, recordId: food.source.recordId, edition: food.source.edition },
          catalogVersion: food.catalogVersion,
        }),
      },
    });
    return res.status(result.replayed ? 200 : 201).json(result);
  }));

  router.patch('/pantry/:id', asyncRoute(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Không tìm thấy nguyên liệu trong kho.', code: 'PANTRY_ITEM_NOT_FOUND' });
    const patch = normalizePantryItemPatch(req.body);
    const item = await repository.updatePantryItem({ db: req.userDatabase, userId: req.auth.user.id, itemId: req.params.id, patch });
    if (!item) return res.status(404).json({ error: 'Không tìm thấy nguyên liệu trong kho.', code: 'PANTRY_ITEM_NOT_FOUND' });
    return res.json({ item });
  }));

  router.delete('/pantry/:id', asyncRoute(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Không tìm thấy nguyên liệu trong kho.', code: 'PANTRY_ITEM_NOT_FOUND' });
    if (!await repository.deletePantryItem({ db: req.userDatabase, userId: req.auth.user.id, itemId: req.params.id })) {
      return res.status(404).json({ error: 'Không tìm thấy nguyên liệu trong kho.', code: 'PANTRY_ITEM_NOT_FOUND' });
    }
    return res.sendStatus(204);
  }));
  return router;
}

module.exports = { FOOD_ID_PATTERN, UUID, createAccountGroceryRouter, createCustomPantryFoodId, parsePantryPage, resolveFood };
