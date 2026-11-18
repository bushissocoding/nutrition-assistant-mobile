const express = require('express');
const { calculateFood, calculateTotals } = require('../services/nutrition');
const { generatePlan } = require('../services/meal-planner');
const { createMealEntryRouter } = require('./meal-entries');
const { createShoppingListRouter } = require('./shopping-lists');

function createApiRouter({ foods, mealTemplates, catalog }, demoContext) {
  const hasStoreMethods = ['readCollection', 'updateCollection', 'writeCollection']
    .every(method => typeof demoContext?.store?.[method] === 'function');
  if (!hasStoreMethods || typeof demoContext.requireScope !== 'function') {
    throw new TypeError('A complete demo context is required to compose the API router.');
  }

  const router = express.Router();
  router.use((req, _res, next) => {
    req.demoContext = demoContext;
    return next();
  });
  router.get('/foods', (req, res) => {
    const query = String(req.query.q || '').trim().toLocaleLowerCase('vi');
    const category = String(req.query.category || '').trim().toLocaleLowerCase('vi');
    const items = foods.filter(food => ((!query || [food.name, ...(food.aliases || [])].some(name => name.toLocaleLowerCase('vi').includes(query))) && (!category || food.category.toLocaleLowerCase('vi') === category)));
    res.json({ items, count: items.length, catalog, disclaimer: 'Dữ liệu MVP tham khảo, không phải hướng dẫn điều trị.' });
  });
  router.get('/foods/:id', (req, res) => {
    const food = foods.find(item => item.id === req.params.id);
    if (!food) return res.status(404).json({ error: 'Không tìm thấy thực phẩm.' });
    res.json({ ...food, catalogVersion: catalog?.version || null, catalog });
  });
  router.post('/nutrition/calculate', (req, res) => {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0 || items.length > 100) return res.status(400).json({ error: 'items phải là danh sách 1–100 thực phẩm.' });
    for (const item of items) if (!item || typeof item !== 'object' || Array.isArray(item) || !foods.some(food => food.id === item.foodId) || !Number.isFinite(item.grams) || item.grams <= 0 || item.grams > 5000) return res.status(400).json({ error: 'foodId hoặc khối lượng không hợp lệ.' });
    res.json({ totals: calculateTotals(items, foods), items: items.map(item => ({ food: foods.find(food => food.id === item.foodId).name, grams: item.grams, nutrients: calculateFood(foods.find(food => food.id === item.foodId), item.grams) })), sources: [...new Set(items.flatMap(item => Object.values(foods.find(food => food.id === item.foodId).nutrientSources).map(source => source.name)))], catalog });
  });
  router.post('/meal-plans/generate', (req, res) => {
    try { return res.json({ ...generatePlan({ foods, mealTemplates, ...(req.body || {}) }), catalog }); }
    catch (error) { return res.status(400).json({ error: error.message || 'Tham số tạo thực đơn không hợp lệ.' }); }
  });
  router.use('/meal-entries', createMealEntryRouter({ foods, demoContext }));
  router.use('/shopping-lists', createShoppingListRouter({ foods, demoContext }));
  return router;
}

module.exports = { createApiRouter };
