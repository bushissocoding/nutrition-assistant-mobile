const express = require('express');
const { calculateFood, calculateTotals } = require('../services/nutrition');
const { generatePlan } = require('../services/meal-planner');

function createApiRouter({ foods, mealTemplates }, { demoContext } = {}) {
  const router = express.Router();
  router.use((req, _res, next) => {
    req.demoContext = demoContext;
    return next();
  });
  router.get('/foods', (req, res) => {
    const query = String(req.query.q || '').trim().toLocaleLowerCase('vi');
    const category = String(req.query.category || '').trim().toLocaleLowerCase('vi');
    const items = foods.filter(food => (!query || food.name.toLocaleLowerCase('vi').includes(query)) && (!category || food.category.toLocaleLowerCase('vi') === category));
    res.json({ items, count: items.length, disclaimer: 'Dữ liệu MVP tham khảo, không phải hướng dẫn điều trị.' });
  });
  router.get('/foods/:id', (req, res) => {
    const food = foods.find(item => item.id === req.params.id);
    if (!food) return res.status(404).json({ error: 'Không tìm thấy thực phẩm.' });
    res.json(food);
  });
  router.post('/nutrition/calculate', (req, res) => {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0 || items.length > 100) return res.status(400).json({ error: 'items phải là danh sách 1–100 thực phẩm.' });
    for (const item of items) if (!foods.some(food => food.id === item.foodId) || !Number.isFinite(item.grams) || item.grams <= 0 || item.grams > 5000) return res.status(400).json({ error: 'foodId hoặc khối lượng không hợp lệ.' });
    res.json({ totals: calculateTotals(items, foods), items: items.map(item => ({ food: foods.find(food => food.id === item.foodId).name, grams: item.grams, nutrients: calculateFood(foods.find(food => food.id === item.foodId), item.grams) })), sources: [...new Set(items.map(item => foods.find(food => food.id === item.foodId).source.name))] });
  });
  router.post('/meal-plans/generate', (req, res) => {
    try { return res.json(generatePlan({ foods, mealTemplates, ...(req.body || {}) })); }
    catch (error) { return res.status(400).json({ error: error.message || 'Tham số tạo thực đơn không hợp lệ.' }); }
  });
  return router;
}

module.exports = { createApiRouter };
