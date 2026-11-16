const round = n => Math.round(n * 10) / 10;
const roundBudget = n => Math.round(n);
const TARGET_KEYS = ['energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fiberG', 'sodiumMg'];
const DEFAULT_TARGETS = {
  energyKcal: { min: 1500, max: 2000 }, proteinG: { min: 50, max: 90 },
  carbohydrateG: { min: 180, max: 280 }, fatG: { min: 45, max: 75 },
  fiberG: { min: 25, max: 35 }, sodiumMg: { min: 0, max: 2000 }
};

function validateTargets(targets) {
  if (!targets || typeof targets !== 'object' || Array.isArray(targets)) throw new Error('targets phải là object.');
  const result = {};
  for (const [key, range] of Object.entries(targets)) {
    if (!TARGET_KEYS.includes(key) || !range || typeof range !== 'object' || Array.isArray(range)) throw new Error(`Mục tiêu không hỗ trợ: ${key}.`);
    const { min, max } = range;
    if ((min !== undefined && (!Number.isFinite(min) || min < 0)) || (max !== undefined && (!Number.isFinite(max) || max < 0)) || (min !== undefined && max !== undefined && min > max)) throw new Error(`Khoảng mục tiêu ${key} không hợp lệ.`);
    result[key] = { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) };
  }
  return result;
}

function calculateTotals(items, foodById) {
  const result = Object.fromEntries(TARGET_KEYS.map(key => [key, 0]));
  for (const item of items) {
    const food = foodById.get(item.foodId);
    if (!food) continue;
    for (const key of TARGET_KEYS) result[key] += Number(food.per100g[key] || 0) * item.grams / 100;
  }
  for (const key of TARGET_KEYS) result[key] = round(result[key]);
  return result;
}

function buildMeal(template, foodById, scale, costScale = scale) {
  const items = template.items.map(item => ({ foodId: item.foodId, grams: round(item.grams * scale) }));
  return { id: template.id, slot: template.slot, name: template.name, items, estimatedCostVnd: roundBudget(template.estimatedCostVnd * costScale), nutrients: calculateTotals(items, foodById) };
}

function scorePlan(meals, targets, preferences) {
  const day = calculateTotals(meals.flatMap(m => m.items), new Map());
  // Sum meal nutrient profiles because these already use the source catalog.
  for (const key of TARGET_KEYS) day[key] = round(meals.reduce((n, m) => n + m.nutrients[key], 0));
  let score = 0;
  for (const [key, range] of Object.entries(targets)) {
    if (range.min !== undefined && day[key] < range.min) score += ((range.min - day[key]) / Math.max(range.min, 1)) ** 2;
    if (range.max !== undefined && day[key] > range.max) score += ((day[key] - range.max) / Math.max(range.max, 1)) ** 2;
  }
  const query = preferences.toLocaleLowerCase('vi').trim();
  if (query) {
    const words = query.split(/\s+/).filter(w => w.length > 2);
    const text = meals.flatMap(m => [m.name, ...m.items.map(i => i.foodId)]).join(' ').toLocaleLowerCase('vi');
    const hits = words.filter(word => text.includes(word)).length;
    score -= hits * 0.03;
  }
  return { score: round(score), dailyTotals: day };
}

function generatePlan({ foods, mealTemplates, budgetVnd = 120000, allergies = [], excludedFoodIds = [], preferences = '', targets: suppliedTargets, hardLimits = {} }) {
  if (!Number.isFinite(budgetVnd) || budgetVnd < 0 || budgetVnd > 10000000) throw new Error('Ngân sách không hợp lệ.');
  if (!Array.isArray(allergies) || allergies.some(x => typeof x !== 'string') || !Array.isArray(excludedFoodIds) || excludedFoodIds.some(x => typeof x !== 'string')) throw new Error('Dị ứng và thực phẩm cần tránh phải là danh sách chuỗi.');
  if (typeof preferences !== 'string' || preferences.length > 200) throw new Error('Sở thích không được vượt quá 200 ký tự.');
  const targets = { ...DEFAULT_TARGETS, ...validateTargets(suppliedTargets || {}) };
  const limits = validateTargets(hardLimits);
  const foodById = new Map(foods.map(f => [f.id, f]));
  const excluded = new Set(excludedFoodIds);
  const allergenTokens = allergies.map(x => x.toLocaleLowerCase('vi'));
  const blockedIds = foods.filter(f => excluded.has(f.id) || f.allergens.some(a => allergenTokens.includes(a.toLocaleLowerCase('vi')))).map(f => f.id);
  const slots = [...new Set(mealTemplates.map(m => m.slot))];
  const optionsBySlot = slots.map(slot => mealTemplates.filter(t => t.slot === slot && t.items.every(item => foodById.has(item.foodId) && !blockedIds.includes(item.foodId))).flatMap(t => [0.75, 1, 1.25].map(scale => buildMeal(t, foodById, scale))));
  const withinHardLimits = totals => Object.entries(limits).every(([key, range]) => (range.max === undefined || totals[key] <= range.max) && (range.min === undefined || totals[key] >= range.min));
  const plans = [];
  function enumerate(index, current, spent) {
    if (index === optionsBySlot.length) {
      const scored = scorePlan(current, targets, preferences);
      if (spent <= budgetVnd && withinHardLimits(scored.dailyTotals)) plans.push({ meals: current, cost: spent, ...scored });
      return;
    }
    for (const meal of optionsBySlot[index]) if (spent + meal.estimatedCostVnd <= budgetVnd) enumerate(index + 1, [...current, meal], spent + meal.estimatedCostVnd);
  }
  enumerate(0, [], 0);
  plans.sort((a, b) => a.score - b.score || b.meals.length - a.meals.length || a.cost - b.cost);
  const best = plans[0] || (() => {
    // If no full-day combination is feasible, return the largest affordable safe partial plan.
    const partials = [];
    for (let mask = 1; mask < (1 << optionsBySlot.length); mask++) {
      const selectedSlots = optionsBySlot.filter((_, index) => mask & (1 << index));
      const candidates = [];
      function choose(index, current, spent) {
        if (index === selectedSlots.length) {
          const scored = scorePlan(current, targets, preferences);
          if (spent <= budgetVnd && withinHardLimits(scored.dailyTotals)) candidates.push({ meals: current, cost: spent, ...scored });
          return;
        }
        for (const meal of selectedSlots[index]) if (spent + meal.estimatedCostVnd <= budgetVnd) choose(index + 1, [...current, meal], spent + meal.estimatedCostVnd);
      }
      choose(0, [], 0); partials.push(...candidates);
    }
    partials.sort((a, b) => b.meals.length - a.meals.length || a.score - b.score || a.cost - b.cost);
    return partials[0];
  })();
  const warnings = [];
  if (!best) warnings.push('Không tìm thấy món mẫu thỏa ràng buộc cứng và ngân sách.');
  else if (best.meals.length < slots.length) warnings.push('Chỉ tìm được thực đơn một phần vì danh mục mẫu không có lựa chọn an toàn/phù hợp cho tất cả bữa.');
  if (best) for (const [key, range] of Object.entries(targets)) {
    const value = best.dailyTotals[key];
    if ((range.min !== undefined && value < range.min) || (range.max !== undefined && value > range.max)) warnings.push(`Mục tiêu ${key} chưa đạt (${value}; khoảng mong muốn ${range.min ?? '—'}–${range.max ?? '—'}). Đây là mục tiêu mềm, không phải ràng buộc lâm sàng.`);
  }
  const meals = best ? best.meals.map(meal => {
    const portions = meal.items.map(item => { const food = foodById.get(item.foodId); return { foodId: food.id, food: food.name, grams: item.grams, household: food.serving.household }; });
    const rationale = [];
    if (meal.nutrients.fiberG > 3) rationale.push('có đóng góp chất xơ');
    if (meal.nutrients.sodiumMg < 500) rationale.push('ước tính natri tương đối thấp trước khi thêm gia vị');
    return { slot: meal.slot, name: meal.name, portions, estimatedCostVnd: meal.estimatedCostVnd, nutrients: meal.nutrients, explanation: `Chọn theo điểm phù hợp với các mục tiêu dinh dưỡng và ngân sách; ${rationale.join(' và ') || 'khẩu phần được tính từ dữ liệu thành phần mẫu'}. Thành phần gia vị chưa được tính.` };
  }) : [];
  const grocery = {};
  for (const meal of meals) for (const portion of meal.portions) grocery[portion.foodId] = (grocery[portion.foodId] || 0) + portion.grams;
  return {
    plan: meals,
    dailyTotals: best?.dailyTotals || Object.fromEntries(TARGET_KEYS.map(key => [key, 0])),
    estimatedCostVnd: best?.cost || 0,
    score: best?.score ?? null,
    grocery: Object.entries(grocery).map(([foodId, grams]) => ({ foodId, name: foodById.get(foodId).name, grams: round(grams) })),
    goals: targets,
    hardLimits: limits,
    constraintsApplied: { allergies, excludedFoodIds: blockedIds },
    warnings,
    disclaimer: 'Ước tính minh họa từ dữ liệu mẫu; không chẩn đoán hoặc thay thế chỉ định của chuyên gia y tế.',
    planFeasible: Boolean(best) && best.meals.length === slots.length,
    limitations: ['Optimizer sắp xếp hữu hạn các công thức mẫu và ba mức khẩu phần; chưa tạo công thức mới.', 'Mục tiêu mặc định chỉ là giá trị minh họa cho phần mềm, không phải nhu cầu dinh dưỡng cá nhân hay chế độ điều trị.', 'Giá mẫu và dữ liệu thành phần có sai số; gia vị, dầu, nước chấm có thể làm thay đổi đáng kể dinh dưỡng.', 'Không dùng kết quả để chẩn đoán hoặc điều trị; cần chuyên gia xác nhận nguồn dữ liệu, khẩu phần và mục tiêu.']
  };
}

module.exports = { DEFAULT_TARGETS, TARGET_KEYS, generatePlan, validateTargets };
