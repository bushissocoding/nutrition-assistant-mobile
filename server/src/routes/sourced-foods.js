const express = require('express');
const { calculateFood, calculateTotals } = require('../services/nutrition');
const { FoodSourceError } = require('../services/fdc-food-source');

function sendFoodSourceError(res, error) {
  if (error?.code === 'INVALID_FOOD_QUERY' || error?.code === 'INVALID_FOOD_PAGE' || error?.code === 'INVALID_FOOD_ID') {
    return res.status(400).json({ error: error.message, code: error.code });
  }
  const code = error?.code === 'FOOD_SOURCE_RATE_LIMITED' ? error.code : 'FOOD_SOURCE_UNAVAILABLE';
  const status = code === 'FOOD_SOURCE_RATE_LIMITED' ? 429 : 503;
  return res.status(status).json({ error: error?.message || 'Nguồn thực phẩm tạm thời không khả dụng.', code });
}

function createSourcedFoodRouter({ foodSource } = {}) {
  const router = express.Router();

  router.get('/foods/search', async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const rawPage = req.query.page === undefined ? '1' : req.query.page;
    const page = typeof rawPage === 'string' && /^\d{1,3}$/.test(rawPage) ? Number(rawPage) : NaN;
    try {
      if (!foodSource) throw new FoodSourceError('FOOD_SOURCE_UNAVAILABLE', 'Nguồn thực phẩm USDA chưa được cấu hình.');
      return res.json(await foodSource.search(query, { page }));
    } catch (error) { return sendFoodSourceError(res, error); }
  });

  router.get('/foods/fdc/:fdcId', async (req, res) => {
    try {
      if (!foodSource) throw new FoodSourceError('FOOD_SOURCE_UNAVAILABLE', 'Nguồn thực phẩm USDA chưa được cấu hình.');
      return res.json({ food: await foodSource.getFood(req.params.fdcId) });
    } catch (error) { return sendFoodSourceError(res, error); }
  });

  router.post('/nutrition/calculate-sourced', async (req, res) => {
    const items = req.body?.items;
    if (!Array.isArray(items) || items.length < 1 || items.length > 10) {
      return res.status(400).json({ error: 'items phải gồm 1–10 thực phẩm USDA.', code: 'INVALID_NUTRITION_REQUEST' });
    }
    const normalized = [];
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)
        || Object.keys(item).some(key => !['foodId', 'grams'].includes(key))
        || typeof item.foodId !== 'string' || !/^fdc:\d{1,12}$/.test(item.foodId)
        || !Number.isFinite(item.grams) || item.grams <= 0 || item.grams > 5000) {
        return res.status(400).json({ error: 'foodId hoặc khối lượng không hợp lệ.', code: 'INVALID_NUTRITION_REQUEST' });
      }
      normalized.push({ id: item.foodId.slice(4), grams: item.grams });
    }
    try {
      if (!foodSource) throw new FoodSourceError('FOOD_SOURCE_UNAVAILABLE', 'Nguồn thực phẩm USDA chưa được cấu hình.');
      const foods = await Promise.all(normalized.map(item => foodSource.getFood(item.id)));
      const calculationItems = normalized.map((item, index) => ({ foodId: foods[index].id, grams: item.grams }));
      return res.json({
        totals: calculateTotals(calculationItems, foods),
        items: calculationItems.map(item => {
          const food = foods.find(candidate => candidate.id === item.foodId);
          return { food: food.name, foodId: food.id, grams: item.grams, nutrients: calculateFood(food, item.grams), source: food.source, catalogVersion: food.catalogVersion };
        }),
        sources: [{ ...foods[0].source, catalogVersion: foods[0].catalogVersion }],
        disclaimer: 'Giá trị tham khảo theo dữ liệu USDA, không chẩn đoán hoặc thay thế tư vấn chuyên môn.',
      });
    } catch (error) { return sendFoodSourceError(res, error); }
  });
  return router;
}

module.exports = { createSourcedFoodRouter, sendFoodSourceError };
