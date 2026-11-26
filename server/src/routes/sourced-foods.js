const express = require('express');
const { calculateFood, calculateTotals } = require('../services/nutrition');
const { FOOD_ID_PATTERN, INSTITUTE_SOURCE_ID, FoodSourceError, PENDING_DATASET_MESSAGE, parseFoodId } = require('../services/food-source');

const RECORD_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const SOURCE_SLUG_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;

function parseFoodSearch(query, rawPage) {
  if (typeof query !== 'string' || query.trim().length < 2 || query.trim().length > 100) {
    throw new FoodSourceError('INVALID_FOOD_QUERY', 'Từ khóa cần dài từ 2 đến 100 ký tự.');
  }
  if (typeof rawPage !== 'string' || !/^\d{1,3}$/.test(rawPage) || Number(rawPage) < 1 || Number(rawPage) > 100) {
    throw new FoodSourceError('INVALID_FOOD_PAGE', 'Trang tìm kiếm phải là số từ 1 đến 100.');
  }
  return { query: query.trim(), page: Number(rawPage) };
}

function sendFoodSourceError(res, error) {
  if (error?.code === 'INVALID_FOOD_QUERY' || error?.code === 'INVALID_FOOD_PAGE' || error?.code === 'INVALID_FOOD_ID') {
    return res.status(400).json({ error: error.message, code: error.code });
  }
  const code = error?.code === 'FOOD_SOURCE_RATE_LIMITED' ? error.code : 'FOOD_SOURCE_UNAVAILABLE';
  const status = code === 'FOOD_SOURCE_RATE_LIMITED' ? 429 : 503;
  return res.status(status).json({ error: error?.message || PENDING_DATASET_MESSAGE, code });
}

function createSourcedFoodRouter({ foodSource } = {}) {
  const router = express.Router();

  router.get('/foods/search', async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const rawPage = req.query.page === undefined ? '1' : req.query.page;
    try {
      const normalized = parseFoodSearch(query, rawPage);
      if (!foodSource) throw new FoodSourceError('FOOD_SOURCE_UNAVAILABLE');
      return res.json(await foodSource.search(normalized.query, { page: normalized.page }));
    } catch (error) { return sendFoodSourceError(res, error); }
  });

  router.get('/foods/:sourceId/:recordId', async (req, res) => {
    try {
      if (!SOURCE_SLUG_PATTERN.test(req.params.sourceId) || !RECORD_ID_PATTERN.test(req.params.recordId)) {
        throw new FoodSourceError('INVALID_FOOD_ID', 'Mã thực phẩm không hợp lệ.');
      }
      if (req.params.sourceId !== INSTITUTE_SOURCE_ID || !foodSource) throw new FoodSourceError('FOOD_SOURCE_UNAVAILABLE');
      return res.json({ food: await foodSource.getFood(req.params.recordId) });
    } catch (error) { return sendFoodSourceError(res, error); }
  });

  router.post('/nutrition/calculate-sourced', async (req, res) => {
    const items = req.body?.items;
    if (!Array.isArray(items) || items.length < 1 || items.length > 10) {
      return res.status(400).json({ error: 'items phải gồm 1–10 thực phẩm.', code: 'INVALID_NUTRITION_REQUEST' });
    }
    const normalized = [];
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)
        || Object.keys(item).some(key => !['foodId', 'grams'].includes(key))
        || typeof item.foodId !== 'string' || !FOOD_ID_PATTERN.test(item.foodId)
        || !Number.isFinite(item.grams) || item.grams <= 0 || item.grams > 5000) {
        return res.status(400).json({ error: 'foodId hoặc khối lượng không hợp lệ.', code: 'INVALID_NUTRITION_REQUEST' });
      }
      normalized.push({ ...parseFoodId(item.foodId), grams: item.grams });
    }
    if (normalized.some(item => item.sourceId !== INSTITUTE_SOURCE_ID)) {
      return res.status(400).json({ error: 'foodId phải thuộc nguồn Viện Dinh dưỡng đã đăng ký.', code: 'INVALID_FOOD_ID' });
    }
    try {
      if (!foodSource) throw new FoodSourceError('FOOD_SOURCE_UNAVAILABLE');
      const foods = await Promise.all(normalized.map(item => foodSource.getFood(item.recordId)));
      if (foods.some((food, index) => food?.id !== items[index].foodId)) {
        throw new FoodSourceError('INVALID_FOOD_ID', 'Mã thực phẩm không khớp bản ghi của nguồn đã đăng ký.');
      }
      const calculationItems = normalized.map((item, index) => ({ foodId: foods[index].id, grams: item.grams }));
      return res.json({
        totals: calculateTotals(calculationItems, foods),
        items: calculationItems.map(item => {
          const food = foods.find(candidate => candidate.id === item.foodId);
          return { food: food.name, foodId: food.id, grams: item.grams, nutrients: calculateFood(food, item.grams), source: food.source, catalogVersion: food.catalogVersion };
        }),
        sources: [{ ...foods[0].source, catalogVersion: foods[0].catalogVersion }],
        disclaimer: 'Giá trị dinh dưỡng từ bảng của Viện Dinh dưỡng chỉ khả dụng sau khi xác nhận quyền sử dụng; nội dung không thay thế tư vấn chuyên môn.',
      });
    } catch (error) { return sendFoodSourceError(res, error); }
  });
  return router;
}

module.exports = { FOOD_ID_PATTERN, RECORD_ID_PATTERN, SOURCE_SLUG_PATTERN, createSourcedFoodRouter, parseFoodSearch, sendFoodSourceError };
