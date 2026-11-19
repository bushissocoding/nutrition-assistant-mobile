const round = n => Math.round(n * 10) / 10;
const roundBudget = n => Math.round(n);
const CONTRACT_VERSION = '1.0';
const ALGORITHM_VERSION = '1.0.0';
const TARGET_KEYS = ['energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fiberG', 'sodiumMg'];
const NUTRIENT_UNITS = { energyKcal: 'kcal', proteinG: 'g', carbohydrateG: 'g', fatG: 'g', fiberG: 'g', sodiumMg: 'mg' };
const DEFAULT_TARGETS = {
  energyKcal: { min: 1500, max: 2000 }, proteinG: { min: 50, max: 90 },
  carbohydrateG: { min: 180, max: 280 }, fatG: { min: 45, max: 75 },
  fiberG: { min: 25, max: 35 }, sodiumMg: { min: 0, max: 2000 },
};

function invalidInput(message, field) {
  const error = new TypeError(message);
  error.code = 'INVALID_INPUT';
  error.field = field;
  return error;
}

function validateTargets(targets, field = 'targets') {
  if (!targets || typeof targets !== 'object' || Array.isArray(targets)) throw invalidInput(`${field} phải là object.`, field);
  const result = {};
  for (const [key, range] of Object.entries(targets)) {
    if (!TARGET_KEYS.includes(key) || !range || typeof range !== 'object' || Array.isArray(range)) throw invalidInput(`Mục tiêu không hỗ trợ: ${key}.`, `${field}.${key}`);
    const { min, max } = range;
    if (Object.keys(range).some(bound => !['min', 'max'].includes(bound)) ||
      (min !== undefined && (!Number.isFinite(min) || min < 0)) ||
      (max !== undefined && (!Number.isFinite(max) || max < 0)) ||
      (min !== undefined && max !== undefined && min > max) || (min === undefined && max === undefined)) {
      throw invalidInput(`Khoảng ${field} ${key} không hợp lệ; giá trị phải không âm và dùng đơn vị ${NUTRIENT_UNITS[key]}.`, `${field}.${key}`);
    }
    result[key] = { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) };
  }
  return result;
}

function validateGenerateRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalidInput('Nội dung yêu cầu phải là object JSON.', 'body');
  const allowed = ['contractVersion', 'budgetVnd', 'allergies', 'excludedFoodIds', 'preferences', 'targets', 'hardLimits'];
  const unknown = Object.keys(body).find(key => !allowed.includes(key));
  if (unknown) throw invalidInput(`Trường không được hỗ trợ: ${unknown}.`, unknown);
  if (!Object.hasOwn(body, 'budgetVnd')) throw invalidInput('Thiếu ngân sách bắt buộc (budgetVnd).', 'budgetVnd');
  if (!Object.hasOwn(body, 'contractVersion')) throw invalidInput(`Thiếu contractVersion bắt buộc (${CONTRACT_VERSION}).`, 'contractVersion');
  if (body.contractVersion !== CONTRACT_VERSION) {
    const error = invalidInput(`contractVersion phải là ${CONTRACT_VERSION}.`, 'contractVersion');
    error.code = 'UNSUPPORTED_CONTRACT_VERSION';
    throw error;
  }
  if (!Number.isSafeInteger(body.budgetVnd) || body.budgetVnd < 0 || body.budgetVnd > 10000000) {
    throw invalidInput('budgetVnd phải là số nguyên VNĐ từ 0 đến 10000000.', 'budgetVnd');
  }
  const allergies = body.allergies === undefined ? [] : body.allergies;
  const excludedFoodIds = body.excludedFoodIds === undefined ? [] : body.excludedFoodIds;
  const preferences = body.preferences === undefined ? '' : body.preferences;
  if (!Array.isArray(allergies) || allergies.length > 50 || allergies.some(value => typeof value !== 'string' || !value.trim() || value.length > 80)) throw invalidInput('allergies phải là danh sách tối đa 50 tên dị ứng không rỗng.', 'allergies');
  if (!Array.isArray(excludedFoodIds) || excludedFoodIds.length > 200 || excludedFoodIds.some(value => typeof value !== 'string' || !value.trim() || value.length > 100)) throw invalidInput('excludedFoodIds phải là danh sách tối đa 200 mã thực phẩm không rỗng.', 'excludedFoodIds');
  if (typeof preferences !== 'string' || preferences.length > 200) throw invalidInput('preferences phải là chuỗi tối đa 200 ký tự.', 'preferences');
  return {
    contractVersion: body.contractVersion,
    budgetVnd: body.budgetVnd,
    allergies: [...new Set(allergies.map(value => value.trim()))],
    excludedFoodIds: [...new Set(excludedFoodIds.map(value => value.trim()))],
    preferences: preferences.trim(),
    targets: validateTargets(body.targets === undefined ? {} : body.targets, 'targets'),
    hardLimits: validateTargets(body.hardLimits === undefined ? {} : body.hardLimits, 'hardLimits'),
  };
}

function hasCompleteFoodData(food) {
  return TARGET_KEYS.every(key => Number.isFinite(food.per100g?.[key]) && food.per100g[key] >= 0) &&
    Boolean(food.source?.name && food.source?.url && food.source?.note) &&
    Number.isFinite(food.serving?.amount) && food.serving.amount > 0 && food.serving.unit === 'g';
}

function calculateTotals(items, foodById) {
  const totals = Object.fromEntries(TARGET_KEYS.map(key => [key, 0]));
  for (const item of items) {
    const food = foodById.get(item.foodId);
    if (!food || !hasCompleteFoodData(food)) throw new Error(`Không có dữ liệu dinh dưỡng hoặc nguồn đầy đủ cho ${item.foodId}.`);
    for (const key of TARGET_KEYS) totals[key] += food.per100g[key] * item.grams / 100;
  }
  for (const key of TARGET_KEYS) totals[key] = round(totals[key]);
  return totals;
}

function buildMeal(template, foodById, scale) {
  const items = template.items.map(item => ({ foodId: item.foodId, grams: round(item.grams * scale) }));
  const priceScale = scale;
  return {
    id: template.id, slot: template.slot, name: template.name, items,
    portionScale: scale,
    estimatedCostVnd: roundBudget(template.estimatedCostVnd * priceScale),
    costProvenance: template.costSource || null,
    nutrients: calculateTotals(items, foodById),
  };
}

function scorePlan(meals, targets, preferences) {
  const dailyTotals = Object.fromEntries(TARGET_KEYS.map(key => [
    key, round(meals.reduce((total, meal) => total + meal.nutrients[key], 0)),
  ]));
  let score = 0;
  for (const [key, range] of Object.entries(targets)) {
    if (range.min !== undefined && dailyTotals[key] < range.min) score += ((range.min - dailyTotals[key]) / Math.max(range.min, 1)) ** 2;
    if (range.max !== undefined && dailyTotals[key] > range.max) score += ((dailyTotals[key] - range.max) / Math.max(range.max, 1)) ** 2;
  }
  const words = preferences.toLocaleLowerCase('vi').trim().split(/\s+/).filter(word => word.length > 2);
  const searchable = meals.flatMap(meal => [meal.name, ...meal.items.map(item => item.foodId)]).join(' ').toLocaleLowerCase('vi');
  const preferenceMatches = words.filter(word => searchable.includes(word));
  return { score: round(score), dailyTotals, preferenceMatches, preferenceMatchCount: preferenceMatches.length };
}

function withinHardLimits(totals, limits) {
  return Object.entries(limits).every(([key, range]) =>
    (range.max === undefined || totals[key] <= range.max) && (range.min === undefined || totals[key] >= range.min));
}

function comparePlans(a, b) {
  return a.score - b.score || b.preferenceMatchCount - a.preferenceMatchCount || a.cost - b.cost ||
    a.meals.map(meal => meal.id).join('|').localeCompare(b.meals.map(meal => meal.id).join('|'));
}

function findBestPlan(optionsBySlot, targets, preferences, limits, budgetVnd) {
  const candidates = [];
  let hasAffordableCombination = false;
  let hasAffordableHardLimitCombination = false;
  function visit(slotIndex, meals, spent) {
    if (slotIndex === optionsBySlot.length) {
      const scored = scorePlan(meals, targets, preferences);
      const satisfiesHardLimits = withinHardLimits(scored.dailyTotals, limits);
      if (spent <= budgetVnd) hasAffordableCombination = true;
      if (spent <= budgetVnd && satisfiesHardLimits) hasAffordableHardLimitCombination = true;
      if (spent <= budgetVnd && satisfiesHardLimits) candidates.push({ meals, cost: spent, ...scored });
      return;
    }
    for (const meal of optionsBySlot[slotIndex]) visit(slotIndex + 1, [...meals, meal], spent + meal.estimatedCostVnd);
  }
  if (optionsBySlot.every(options => options.length > 0)) visit(0, [], 0);
  candidates.sort(comparePlans);
  return { best: candidates[0] || null, hasAffordableCombination, hasAffordableHardLimitCombination };
}

function unmetSoftTargets(totals, targets) {
  return Object.entries(targets).flatMap(([key, range]) => {
    const actual = totals[key];
    const below = range.min !== undefined && actual < range.min;
    const above = range.max !== undefined && actual > range.max;
    return below || above ? [{ nutrient: key, unit: NUTRIENT_UNITS[key], actual, target: range, type: below ? 'below_minimum' : 'above_maximum' }] : [];
  });
}

function explainMeal(meal, totalCost, preferenceMatches) {
  const matchesPreference = preferenceMatches.some(word => `${meal.name} ${meal.items.map(item => item.foodId).join(' ')}`.toLocaleLowerCase('vi').includes(word));
  const reasons = [`khẩu phần mẫu ${meal.portionScale}×`];
  if (matchesPreference) reasons.push('có từ khóa khớp sở thích (sở thích chỉ ảnh hưởng xếp hạng)');
  reasons.push('được xếp hạng trong phương án toàn ngày khả thi có điểm mục tiêu mềm thấp nhất');
  return `${reasons.join('; ')}. Chi phí ước tính bữa này ${meal.estimatedCostVnd} VNĐ trong tổng ${totalCost} VNĐ; dinh dưỡng là ước tính từ thành phần mẫu, chưa tính gia vị/dầu/nước chấm.`;
}

function generatePlan({ foods, mealTemplates, budgetVnd = 120000, allergies = [], excludedFoodIds = [], preferences = '', targets: suppliedTargets, hardLimits = {}, catalog = {} }) {
  if (!Number.isSafeInteger(budgetVnd) || budgetVnd < 0 || budgetVnd > 10000000) throw invalidInput('Ngân sách phải là số nguyên VNĐ từ 0 đến 10000000.', 'budgetVnd');
  if (!Array.isArray(foods) || !Array.isArray(mealTemplates)) throw invalidInput('foods và mealTemplates phải là danh sách catalog.', 'catalog');
  if (!Array.isArray(allergies) || allergies.length > 50 || allergies.some(value => typeof value !== 'string' || !value.trim() || value.length > 80)) throw invalidInput('Dị ứng phải là danh sách tối đa 50 tên không rỗng.', 'allergies');
  if (!Array.isArray(excludedFoodIds) || excludedFoodIds.length > 200 || excludedFoodIds.some(value => typeof value !== 'string' || !value.trim() || value.length > 100)) throw invalidInput('Thực phẩm cần tránh phải là danh sách tối đa 200 mã không rỗng.', 'excludedFoodIds');
  if (typeof preferences !== 'string' || preferences.length > 200) throw invalidInput('preferences phải là chuỗi tối đa 200 ký tự.', 'preferences');
  const targets = { ...DEFAULT_TARGETS, ...validateTargets(suppliedTargets || {}, 'targets') };
  const limits = validateTargets(hardLimits, 'hardLimits');
  const foodById = new Map(foods.map(food => [food.id, food]));
  const excluded = new Set(excludedFoodIds);
  const allergenTokens = allergies.map(value => value.toLocaleLowerCase('vi'));
  const blockedIds = foods.filter(food => {
    const ingredients = Array.isArray(food.allergens) ? food.allergens : [];
    const malformedAllergenMetadata = !Array.isArray(food.allergens) || ingredients.some(allergen => typeof allergen !== 'string');
    return excluded.has(food.id) || malformedAllergenMetadata || ingredients.some(allergen => allergenTokens.includes(allergen.toLocaleLowerCase('vi')));
  }).map(food => food.id);
  const unavailableDataIds = foods.filter(food => !hasCompleteFoodData(food)).map(food => food.id);
  const validTemplates = mealTemplates.filter(template => template && typeof template.slot === 'string' && template.slot.trim() &&
    Number.isSafeInteger(template.estimatedCostVnd) && template.estimatedCostVnd >= 0 && Array.isArray(template.items) && template.items.length > 0);
  const slots = [...new Set(validTemplates.map(template => template.slot))];
  const optionsBySlot = slots.map(slot => validTemplates
    .filter(template => template.slot === slot && template.items.every(item => item && foodById.has(item.foodId) && hasCompleteFoodData(foodById.get(item.foodId)) && !blockedIds.includes(item.foodId) && Number.isFinite(item.grams) && item.grams > 0))
    .flatMap(template => [0.75, 1, 1.25].map(scale => buildMeal(template, foodById, scale))));
  const { best, hasAffordableCombination, hasAffordableHardLimitCombination } = findBestPlan(optionsBySlot, targets, preferences, limits, budgetVnd);
  const baseTotals = best?.dailyTotals || Object.fromEntries(TARGET_KEYS.map(key => [key, 0]));
  const unmetTargets = best ? unmetSoftTargets(best.dailyTotals, targets) : [];
  const infeasibility = best ? null : {
    code: slots.length === 0 ? 'NO_MEAL_TEMPLATES' : slots.length !== optionsBySlot.filter(options => options.length > 0).length ? 'NO_SAFE_RECIPE_FOR_EACH_MEAL' :
      !hasAffordableCombination ? 'BUDGET_UNSATISFIABLE' :
        !hasAffordableHardLimitCombination ? 'HARD_LIMITS_UNSATISFIABLE' : 'NO_FEASIBLE_PLAN',
    message: slots.length === 0 ? 'Catalog chưa có template bữa ăn hợp lệ.' : slots.length !== optionsBySlot.filter(options => options.length > 0).length
      ? 'Danh mục không có công thức đủ dữ liệu và không chứa thành phần bị loại trừ cho mọi bữa.'
      : !hasAffordableCombination
        ? 'Không có thực đơn trọn ngày nằm trong ngân sách đã nhập.'
        : !hasAffordableHardLimitCombination
          ? 'Không có thực đơn trọn ngày trong ngân sách đáp ứng tất cả giới hạn cứng đã nhập.'
          : 'Không tìm thấy thực đơn trọn ngày đáp ứng đồng thời các điều kiện.',
    unmet: [
      ...(slots.length === 0 ? ['meal_templates'] : slots.length !== optionsBySlot.filter(options => options.length > 0).length ? ['safe_recipe_for_each_meal'] : []),
      ...(!hasAffordableCombination ? ['budgetVnd'] : []),
      ...(hasAffordableCombination && !hasAffordableHardLimitCombination ? ['hardLimits'] : []),
    ],
  };
  const meals = best ? best.meals.map(meal => ({
    slot: meal.slot,
    name: meal.name,
    portions: meal.items.map(item => {
      const food = foodById.get(item.foodId);
      return {
        foodId: food.id, food: food.name, grams: item.grams, unit: 'g', household: food.serving.household,
        nutrients: calculateTotals([item], foodById),
        source: { name: food.source.name, url: food.source.url, note: food.source.note, sourceVersion: food.source.version || null, sourceRecordId: food.source.recordId || null, catalogVersion: catalog.foodsVersion || null },
        provenance: { method: 'Nguồn thành phần đối chiếu; giá trị chuẩn hóa trên 100 g theo trạng thái chế biến ghi trong ghi chú nguồn.', attribution: food.source.attribution || null, reuseRights: food.source.reuseRights || 'Chưa được xác minh trong catalog demo.' },
      };
    }),
    estimatedCostVnd: meal.estimatedCostVnd,
    costUnit: 'VND',
    nutrients: meal.nutrients,
    nutrientUnits: NUTRIENT_UNITS,
    provenance: {
      recipeTemplateId: meal.id,
      recipeTemplateVersion: catalog.mealTemplatesVersion || null,
      pricingVersion: meal.costProvenance?.version || catalog.pricingVersion || null,
      priceSource: meal.costProvenance?.name || 'Prototype estimate (not market quote)',
      priceMethod: meal.costProvenance?.method || 'Ước tính mẫu của template, nhân theo tỷ lệ khẩu phần; không phải báo giá thị trường.',
    },
    explanation: explainMeal(meal, best.cost, best.preferenceMatches),
  })) : [];
  const grocery = {};
  for (const meal of meals) for (const portion of meal.portions) grocery[portion.foodId] = (grocery[portion.foodId] || 0) + portion.grams;
  const warnings = best ? unmetTargets.map(item => `Mục tiêu mềm ${item.nutrient} chưa đạt (${item.actual} ${item.unit}); mục tiêu mềm không phải giới hạn y tế.`) : [];
  if (unavailableDataIds.length) warnings.push('Một số món mẫu bị loại vì thiếu giá trị dinh dưỡng, khẩu phần hoặc thông tin nguồn; dữ liệu thiếu không được giả định bằng 0.');
  return {
    contractVersion: CONTRACT_VERSION,
    plan: meals,
    dailyTotals: baseTotals,
    nutrientUnits: NUTRIENT_UNITS,
    estimatedCostVnd: best?.cost || 0,
    score: best?.score ?? null,
    grocery: Object.entries(grocery).map(([foodId, grams]) => ({ foodId, name: foodById.get(foodId).name, grams: round(grams), unit: 'g' })),
    goals: targets,
    hardLimits: limits,
    constraintsApplied: { allergies, excludedFoodIds: blockedIds, budgetVnd, hardLimits: limits },
    feasibility: best ? { status: 'feasible', code: 'FULL_DAY_PLAN_FOUND', unmetSoftTargets: unmetTargets } : { status: 'infeasible', ...infeasibility },
    warnings,
    disclaimer: 'Gợi ý prototype từ dữ liệu mẫu, chưa được xác nhận lâm sàng; không chẩn đoán, điều trị hoặc thay thế chỉ định chuyên gia. Dị ứng chỉ lọc thành phần được ghi nhận, không bảo đảm tránh nhiễm chéo.',
    metadata: {
      algorithm: 'deterministic-template-ranking',
      algorithmVersion: ALGORITHM_VERSION,
      catalogVersion: catalog.catalogVersion || null,
      foodsVersion: catalog.foodsVersion || null,
      mealTemplatesVersion: catalog.mealTemplatesVersion || null,
      pricingVersion: catalog.pricingVersion || null,
    },
    planFeasible: Boolean(best),
    limitations: [
      'Optimizer xếp hạng các template hữu hạn trong catalog ở ba mức khẩu phần; không tạo món mới.',
      'Mục tiêu mặc định là ví dụ phần mềm, không phải nhu cầu dinh dưỡng cá nhân hay chế độ điều trị; mục tiêu mềm có thể chưa đạt và được báo riêng.',
      'Chi phí mẫu và thành phần dinh dưỡng có sai số; dầu, gia vị, nước chấm và nhiễm chéo dị ứng chưa được tính.',
      'Nguồn comparator và phiên bản nguồn gốc bên ngoài có thể chưa có mã bản ghi/phiên bản được xác minh; metadata phiên bản catalog nội bộ không thay thế việc xác minh nguồn.',
      'Không dùng kết quả để chẩn đoán hoặc điều trị; cần chuyên gia dinh dưỡng rà soát nguồn, khẩu phần, công thức và giới hạn trước mọi tuyên bố phù hợp lâm sàng.',
    ],
  };
}

module.exports = { ALGORITHM_VERSION, CONTRACT_VERSION, DEFAULT_TARGETS, NUTRIENT_UNITS, TARGET_KEYS, generatePlan, validateGenerateRequest, validateTargets };
