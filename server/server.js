const express = require('express');
const fs = require('fs');
const path = require('path');
const { generatePlan } = require('./meal-planner');

const app = express();
const port = Number(process.env.PORT || 4000);
let foods;
let mealTemplates;
try {
  foods = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'foods.json'), 'utf8'));
  mealTemplates = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'meals.json'), 'utf8'));
  if (!Array.isArray(foods) || !Array.isArray(mealTemplates)) throw new Error('Catalog files must contain JSON arrays');
} catch (error) {
  console.error('Unable to load food catalog:', error.message);
  process.exit(1);
}
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const round = n => Math.round(n * 10) / 10;
function calculateFood(food, grams) {
  const factor = grams / 100;
  return Object.fromEntries(Object.entries(food.per100g).map(([key, value]) => [key, round(value * factor)]));
}
function totals(items) {
  return items.reduce((sum, item) => {
    const f = foods.find(x => x.id === item.foodId);
    if (!f) return sum;
    const amounts = calculateFood(f, item.grams);
    for (const key of Object.keys(amounts)) sum[key] = round((sum[key] || 0) + amounts[key]);
    return sum;
  }, { energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fiberG: 0, sodiumMg: 0 });
}

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'nutrition-assistant-api' }));
app.get('/api/v1/foods', (req, res) => {
  const q = String(req.query.q || '').trim().toLocaleLowerCase('vi');
  const category = String(req.query.category || '').trim().toLocaleLowerCase('vi');
  const result = foods.filter(food => (!q || food.name.toLocaleLowerCase('vi').includes(q)) && (!category || food.category.toLocaleLowerCase('vi') === category));
  res.json({ items: result, count: result.length, disclaimer: 'Dữ liệu MVP tham khảo, không phải hướng dẫn điều trị.' });
});
app.get('/api/v1/foods/:id', (req, res) => {
  const food = foods.find(item => item.id === req.params.id);
  if (!food) return res.status(404).json({ error: 'Không tìm thấy thực phẩm.' });
  res.json(food);
});
app.post('/api/v1/nutrition/calculate', (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) return res.status(400).json({ error: 'items phải là danh sách 1–100 thực phẩm.' });
  for (const item of items) if (!foods.some(f => f.id === item.foodId) || !Number.isFinite(item.grams) || item.grams <= 0 || item.grams > 5000) return res.status(400).json({ error: 'foodId hoặc khối lượng không hợp lệ.' });
  res.json({ totals: totals(items), items: items.map(item => ({ food: foods.find(f => f.id === item.foodId).name, grams: item.grams, nutrients: calculateFood(foods.find(f => f.id === item.foodId), item.grams) })), sources: [...new Set(items.map(i => foods.find(f => f.id === i.foodId).source.name))] });
});
app.post('/api/v1/meal-plans/generate', (req, res) => {
  try {
    res.json(generatePlan({ foods, mealTemplates, ...(req.body || {}) }));
  } catch (error) {
    res.status(400).json({ error: error.message || 'Tham số tạo thực đơn không hợp lệ.' });
  }
});
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Lỗi nội bộ.' }); });
app.listen(port, '0.0.0.0', () => console.log(`Nutrition API listening on ${port}`));
