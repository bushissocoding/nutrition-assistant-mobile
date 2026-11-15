const express = require('express');
const fs = require('fs');
const path = require('path');

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
  const { budgetVnd = 120000, allergies = [], excludedFoodIds = [], preferences = '' } = req.body || {};
  if (!Number.isFinite(budgetVnd) || budgetVnd < 0 || budgetVnd > 10000000) return res.status(400).json({ error: 'Ngân sách không hợp lệ.' });
  const blocked = [...new Set([...(Array.isArray(excludedFoodIds) ? excludedFoodIds : []), ...foods.filter(f => f.allergens.some(a => (allergies || []).includes(a))).map(f => f.id)])];
  const allowed = foods.filter(f => !blocked.includes(f.id));
  const pick = id => allowed.find(f => f.id === id);
  const meals = mealTemplates.map(template => ({
    slot: template.slot,
    name: template.name,
    estimatedCostVnd: template.estimatedCostVnd,
    items: template.items.map(item => [pick(item.foodId), item.grams])
  })).filter(meal => meal.items.every(([food]) => food));
  let cost = 0; const withinBudget = meals.filter(meal => { if (cost + meal.estimatedCostVnd > budgetVnd) return false; cost += meal.estimatedCostVnd; return true; });
  const plan = withinBudget.map(meal => {
    const items = meal.items.map(([food, grams]) => ({ foodId: food.id, grams }));
    return { slot: meal.slot, name: meal.name, portions: items.map(i => ({ food: foods.find(f => f.id === i.foodId).name, grams: i.grams, household: foods.find(f => f.id === i.foodId).serving.household })), estimatedCostVnd: meal.estimatedCostVnd, nutrients: totals(items), explanation: 'Thành phần được ước tính từ dữ liệu trên 100 g; lượng natri trong dầu, muối, nước chấm và gia vị nấu chưa được tính.', why: `Có thể điều chỉnh theo sở thích${preferences ? ` (yêu cầu: ${String(preferences).slice(0, 120)})` : ''}; cần bác sĩ/chuyên gia dinh dưỡng duyệt nếu áp dụng chế độ điều trị.` };
  });
  const grocery = {};
  for (const meal of withinBudget) for (const [food, grams] of meal.items) grocery[food.id] = (grocery[food.id] || 0) + grams;
  res.json({ plan, dailyTotals: plan.reduce((sum, meal) => { for (const [key, value] of Object.entries(meal.nutrients)) sum[key] = round((sum[key] || 0) + value); return sum; }, {}), estimatedCostVnd: cost, grocery: Object.entries(grocery).map(([foodId, grams]) => ({ foodId, name: foods.find(f => f.id === foodId).name, grams })), constraintsApplied: { allergies, excludedFoodIds: blocked }, limitations: ['Thực đơn mẫu dùng các mức chi phí minh họa, không phải giá thị trường trực tiếp.', 'Chưa tích hợp chuẩn khẩu phần/chế độ bệnh viện DD01-X hoặc DD02-CKD.', 'Không dùng thực đơn này làm chỉ định y tế; số natri thực tế chịu ảnh hưởng lớn bởi gia vị và cách nấu.'] });
});
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Lỗi nội bộ.' }); });
app.listen(port, '0.0.0.0', () => console.log(`Nutrition API listening on ${port}`));
