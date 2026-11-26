const ALGORITHM_VERSION = 'meal-planner-v2';
const PORTION_SCALES = [0.75, 1, 1.25];
const NUTRIENTS = {
  energyKcal: { unit: 'kcal', maximum: 100000 },
  proteinG: { unit: 'g', maximum: 10000 },
  carbohydrateG: { unit: 'g', maximum: 10000 },
  fatG: { unit: 'g', maximum: 10000 },
  fiberG: { unit: 'g', maximum: 10000 },
  sodiumMg: { unit: 'mg', maximum: 1000000 }
};
const NUTRIENT_KEYS = Object.keys(NUTRIENTS);
const DEFAULT_TARGETS = {
  energyKcal: { min: 1500, max: 2000 },
  proteinG: { min: 50, max: 90 },
  carbohydrateG: { min: 180, max: 280 },
  fatG: { min: 45, max: 75 },
  fiberG: { min: 25, max: 35 },
  sodiumMg: { min: 0, max: 2000 }
};
const DISCLAIMER = 'Ước tính minh họa từ dữ liệu mẫu có ghi nguồn; không chẩn đoán, điều trị hoặc thay thế chỉ định của chuyên gia y tế.';
const LIMITATIONS = [
  'Đây là gợi ý prototype, không phải thực đơn điều trị hay tư vấn dinh dưỡng cá nhân.',
  'Danh mục hiện không có giá thực phẩm được gắn nguồn; không dùng các giá minh họa cũ để đánh giá ngân sách.',
  'Danh sách dị ứng chỉ phản ánh nhãn trong catalog và không bảo đảm loại trừ nhiễm chéo.',
  'Nguồn một số giá trị dinh dưỡng đối chiếu chưa giữ được mã bản ghi và phiên bản phát hành; xem provenance của từng thành phần.'
];
const ALLOWED_REQUEST_FIELDS = new Set([
  'contractVersion', 'budgetVnd', 'allergies', 'excludedFoodIds', 'preferences', 'dietaryVariety', 'targets', 'hardLimits'
]);
const DIETARY_VARIETY_VALUES = new Set(['simple', 'balanced', 'varied']);

function round(value) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function roundVnd(value) {
  return Math.round(value);
}

function normalizeLabel(value) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('vi').trim().replace(/\s+/g, ' ');
}

class MealPlanValidationError extends Error {
  constructor(issues) {
    super('Dữ liệu tạo thực đơn không hợp lệ.');
    this.name = 'MealPlanValidationError';
    this.code = 'INVALID_MEAL_PLAN_REQUEST';
    this.issues = issues;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateRanges(value, path, issues) {
  if (!isRecord(value)) {
    issues.push({ path, code: 'INVALID_TYPE', message: 'Trường phải là object.' });
    return {};
  }

  const result = {};
  for (const key of Object.keys(value).sort()) {
    const rangePath = `${path}.${key}`;
    const nutrient = NUTRIENTS[key];
    if (!nutrient) {
      issues.push({ path: rangePath, code: 'UNSUPPORTED_NUTRIENT', message: 'Chỉ tiêu dinh dưỡng không được hỗ trợ.' });
      continue;
    }
    const range = value[key];
    if (!isRecord(range)) {
      issues.push({ path: rangePath, code: 'INVALID_TYPE', message: 'Khoảng dinh dưỡng phải là object.' });
      continue;
    }
    const unknownRangeFields = Object.keys(range).filter(field => !['min', 'max', 'unit'].includes(field)).sort();
    for (const field of unknownRangeFields) issues.push({ path: `${rangePath}.${field}`, code: 'UNKNOWN_FIELD', message: 'Trường không được hỗ trợ.' });
    if (range.unit !== undefined && range.unit !== nutrient.unit) {
      issues.push({ path: `${rangePath}.unit`, code: 'INVALID_UNIT', message: `Đơn vị phải là ${nutrient.unit}.` });
    }
    if (range.min === undefined && range.max === undefined) {
      issues.push({ path: rangePath, code: 'MISSING_RANGE_BOUND', message: 'Cần có min hoặc max.' });
      continue;
    }

    const normalized = { unit: nutrient.unit };
    for (const bound of ['min', 'max']) {
      if (range[bound] === undefined) continue;
      const number = range[bound];
      if (typeof number !== 'number' || !Number.isFinite(number)) {
        issues.push({ path: `${rangePath}.${bound}`, code: 'INVALID_TYPE', message: 'Giá trị phải là số hữu hạn.' });
      } else if (number < 0 || number > nutrient.maximum) {
        issues.push({ path: `${rangePath}.${bound}`, code: 'OUT_OF_RANGE', message: 'Giá trị phải nằm trong miền cho phép.' });
      } else {
        normalized[bound] = number;
      }
    }
    if (normalized.min !== undefined && normalized.max !== undefined && normalized.min > normalized.max) {
      issues.push({ path: rangePath, code: 'INVALID_RANGE', message: 'Giới hạn min không được lớn hơn max.' });
    }
    result[key] = normalized;
  }
  return result;
}

function validateStringList(value, path, issues, { maxItems, maxLength }) {
  if (!Array.isArray(value)) {
    issues.push({ path, code: 'INVALID_TYPE', message: 'Trường phải là danh sách chuỗi.' });
    return [];
  }
  if (value.length > maxItems) issues.push({ path, code: 'TOO_MANY_ITEMS', message: `Danh sách không được vượt quá ${maxItems} mục.` });
  const result = [];
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (typeof item !== 'string') {
      issues.push({ path: itemPath, code: 'INVALID_TYPE', message: 'Giá trị phải là chuỗi.' });
      return;
    }
    const trimmed = item.trim();
    if (!trimmed) {
      issues.push({ path: itemPath, code: 'REQUIRED', message: 'Giá trị không được để trống.' });
    } else if (trimmed.length > maxLength) {
      issues.push({ path: itemPath, code: 'TOO_LONG', message: `Giá trị không được vượt quá ${maxLength} ký tự.` });
    } else if (!result.some(existing => normalizeLabel(existing) === normalizeLabel(trimmed))) {
      result.push(trimmed);
    }
  });
  return result;
}

function validateMealPlanRequest(input, { foods } = {}) {
  const issues = [];
  if (!isRecord(input)) {
    throw new MealPlanValidationError([{ path: '$', code: 'INVALID_TYPE', message: 'Request phải là object.' }]);
  }

  for (const field of Object.keys(input).filter(key => !ALLOWED_REQUEST_FIELDS.has(key)).sort()) {
    issues.push({ path: field, code: 'UNKNOWN_FIELD', message: 'Trường không được hỗ trợ.' });
  }
  if (input.contractVersion !== undefined && input.contractVersion !== 1) {
    issues.push({ path: 'contractVersion', code: 'UNSUPPORTED_VERSION', message: 'Chỉ hỗ trợ contractVersion 1.' });
  }

  let budgetVnd;
  if (input.budgetVnd !== undefined) {
    if (typeof input.budgetVnd !== 'number' || !Number.isFinite(input.budgetVnd)) {
      issues.push({ path: 'budgetVnd', code: 'INVALID_TYPE', message: 'Ngân sách phải là số hữu hạn tính bằng VND.' });
    } else if (!Number.isSafeInteger(input.budgetVnd) || input.budgetVnd < 0 || input.budgetVnd > 10000000) {
      issues.push({ path: 'budgetVnd', code: 'OUT_OF_RANGE', message: 'Ngân sách phải là số nguyên từ 0 đến 10000000 VND.' });
    } else {
      budgetVnd = input.budgetVnd;
    }
  }

  const allergies = input.allergies === undefined ? [] : validateStringList(input.allergies, 'allergies', issues, { maxItems: 20, maxLength: 80 });
  const excludedFoodIds = input.excludedFoodIds === undefined ? [] : validateStringList(input.excludedFoodIds, 'excludedFoodIds', issues, { maxItems: 100, maxLength: 100 });
  if (Array.isArray(foods)) {
    const knownIds = new Set(foods.map(food => food?.id).filter(id => typeof id === 'string'));
    excludedFoodIds.forEach((foodId, index) => {
      if (!knownIds.has(foodId)) issues.push({ path: `excludedFoodIds[${index}]`, code: 'UNKNOWN_FOOD', message: 'Mã thực phẩm không có trong catalog.' });
    });
  }

  let preferences = '';
  if (input.preferences !== undefined) {
    if (typeof input.preferences !== 'string') issues.push({ path: 'preferences', code: 'INVALID_TYPE', message: 'Sở thích phải là chuỗi.' });
    else if (input.preferences.length > 200) issues.push({ path: 'preferences', code: 'TOO_LONG', message: 'Sở thích không được vượt quá 200 ký tự.' });
    else preferences = input.preferences.trim();
  }

  const dietaryVariety = input.dietaryVariety === undefined ? 'balanced' : input.dietaryVariety;
  if (!DIETARY_VARIETY_VALUES.has(dietaryVariety)) {
    issues.push({ path: 'dietaryVariety', code: 'INVALID_ENUM', message: 'Mức độ phong phú thực đơn không hợp lệ.' });
  }

  const targets = input.targets === undefined ? {} : validateRanges(input.targets, 'targets', issues);
  const hardLimits = input.hardLimits === undefined ? {} : validateRanges(input.hardLimits, 'hardLimits', issues);
  if (issues.length) throw new MealPlanValidationError(issues);
  return { contractVersion: 1, ...(budgetVnd === undefined ? {} : { budgetVnd }), allergies, excludedFoodIds, preferences, dietaryVariety, targets, hardLimits };
}

function registeredProvenance(provenance, sources) {
  if (!provenance || typeof provenance.sourceId !== 'string' || typeof provenance.edition !== 'string' || !provenance.edition.trim() || typeof provenance.method !== 'string' || !provenance.method.trim()) return null;
  const source = sources.find(item => item.id === provenance.sourceId);
  if (!source) return null;
  return {
    sourceId: source.id,
    sourceName: source.name,
    sourceUrl: source.url || null,
    sourceRecordId: provenance.sourceRecordId || null,
    edition: provenance.edition,
    method: provenance.method
  };
}

function nutritionProvenance(food, sources) {
  const reference = registeredProvenance(food?.provenance?.groups?.nutrition, sources);
  if (!reference || typeof food.version !== 'string' || !food.version.trim()) return null;
  const servingReference = registeredProvenance(food?.provenance?.groups?.serving, sources);
  return {
    foodVersion: food.version,
    catalogVersion: null,
    sourceId: reference.sourceId,
    sourceName: reference.sourceName,
    sourceUrl: reference.sourceUrl,
    sourceRecordId: reference.sourceRecordId,
    edition: reference.edition,
    method: reference.method,
    reviewStatus: food.review?.status || 'unspecified',
    servingSource: servingReference
  };
}

function templateProvenance(template, sources) {
  const reference = registeredProvenance(template?.provenance, sources);
  if (!reference || typeof template.version !== 'string' || !template.version.trim()) return null;
  return { templateVersion: template.version, ...reference };
}

function templatePrice(template, sources, catalogStatus) {
  const price = template?.price;
  const provenance = registeredProvenance(price?.provenance, sources);
  const source = provenance && sources.find(item => item.id === provenance.sourceId);
  const usableSource = (source?.kind === 'external' && source.rights?.redistributionStatus === 'permitted') || (catalogStatus === 'synthetic-fixture' && source?.kind === 'synthetic-fixture');
  const traceableRecord = typeof provenance?.sourceRecordId === 'string' && provenance.sourceRecordId.trim() && !/unknown|not-recorded|uncaptured/i.test(provenance.edition);
  if (!price || price.status !== 'reported' || !Number.isSafeInteger(price.amountVnd) || price.amountVnd < 0 || price.unit !== 'VND' || price.basis !== 'template-1x' || typeof price.version !== 'string' || !price.version.trim() || !provenance || !usableSource || !traceableRecord) {
    return { value: null, unit: 'VND', status: 'missing', reason: 'Chưa có giá có nguồn và phiên bản để đánh giá chi phí.' };
  }
  return { value: price.amountVnd, unit: 'VND', status: 'reported', basis: price.basis, version: price.version, provenance };
}

function emptyTotals() {
  return Object.fromEntries(NUTRIENT_KEYS.map(key => [key, 0]));
}

function addTotals(target, values) {
  for (const key of NUTRIENT_KEYS) target[key] += values[key];
  return target;
}

function finishTotals(values) {
  return Object.fromEntries(NUTRIENT_KEYS.map(key => [key, round(values[key])]));
}

function totalsForPortions(portions, foodById) {
  const totals = emptyTotals();
  for (const portion of portions) {
    const food = foodById.get(portion.foodId);
    for (const key of NUTRIENT_KEYS) totals[key] += food.per100g[key] * portion.grams / 100;
  }
  return finishTotals(totals);
}

function compareLimits(totals, hardLimits) {
  return Object.entries(hardLimits).every(([key, range]) =>
    (range.min === undefined || totals[key] >= range.min) &&
    (range.max === undefined || totals[key] <= range.max));
}

function targetPenalty(totals, targets) {
  let score = 0;
  for (const [key, range] of Object.entries(targets)) {
    if (range.min !== undefined && totals[key] < range.min) score += ((range.min - totals[key]) / Math.max(range.min, 1)) ** 2;
    if (range.max !== undefined && totals[key] > range.max) score += ((totals[key] - range.max) / Math.max(range.max, 1)) ** 2;
  }
  return round(score);
}

function preferenceMatches(meals, preferences) {
  const words = normalizeLabel(preferences).split(/\s+/).filter(word => word.length > 1);
  const text = normalizeLabel(meals.flatMap(meal => [meal.name, ...meal.portions.flatMap(portion => [portion.food, ...(portion.aliases || [])])]).join(' '));
  return { words, matched: words.filter(word => text.includes(word)) };
}

function ingredientDiversity(meals) {
  const foodIds = meals.flatMap(meal => meal.portions.map(portion => portion.foodId));
  return { unique: new Set(foodIds).size, total: foodIds.length };
}

function dietaryVarietyPenalty(meals, dietaryVariety) {
  const diversity = ingredientDiversity(meals);
  if (dietaryVariety === 'simple') return diversity.unique;
  if (dietaryVariety === 'varied') return -diversity.unique;
  return Math.abs(diversity.unique - Math.ceil(diversity.total * 0.65));
}

function makeMeal(template, scale, foodById, sources, catalog) {
  const templateSource = templateProvenance(template, sources);
  if (!templateSource) return { unavailableCode: 'MEAL_TEMPLATE_PROVENANCE_UNAVAILABLE' };
  const nutrientUnits = catalog.nutrientUnits || Object.fromEntries(Object.entries(NUTRIENTS).map(([key, value]) => [key, value.unit]));
  const portions = [];
  for (const item of template.items) {
    const food = foodById.get(item.foodId);
    if (!food || !Number.isFinite(item.grams) || item.grams <= 0 || item.grams > 5000) return { unavailableCode: 'MEAL_TEMPLATE_INVALID' };
    if (NUTRIENT_KEYS.some(key => !Number.isFinite(food.per100g?.[key]))) return { unavailableCode: 'NUTRIENT_DATA_UNAVAILABLE' };
    if (!Array.isArray(food.allergens)) return { unavailableCode: 'ALLERGEN_DATA_UNAVAILABLE' };
    const provenance = nutritionProvenance(food, sources);
    if (!provenance) return { unavailableCode: 'NUTRIENT_PROVENANCE_UNAVAILABLE' };
    provenance.catalogVersion = catalog.version;
    portions.push({
      foodId: food.id,
      food: food.name,
      grams: round(item.grams * scale),
      unit: 'g',
      household: provenance.servingSource ? food.serving?.household || null : null,
      aliases: food.aliases || [],
      allergens: food.allergens,
      provenance
    });
  }
  const price = templatePrice(template, sources, catalog.status);
  const mealPrice = price.value === null ? { ...price } : { ...price, value: roundVnd(price.value * scale), basis: 'scaled-template-portion' };
  const sourceRefs = portions.map(portion => ({ foodId: portion.foodId, ...portion.provenance }));
  const warnings = [];
  if (mealPrice.status === 'missing') warnings.push({ code: 'PRICE_DATA_UNAVAILABLE', message: mealPrice.reason });
  if (sourceRefs.some(source => source.sourceRecordId === null || /unknown|not-recorded|uncaptured/i.test(source.edition) || source.reviewStatus === 'needs-source-verification')) {
    warnings.push({ code: 'NUTRIENT_SOURCE_LIMITATION', message: 'Một số giá trị đối chiếu chưa có mã nguồn/bản phát hành truy hồi được hoặc chưa được xác minh.' });
  }
  if (sourceRefs.some(source => source.servingSource === null)) {
    warnings.push({ code: 'SERVING_SOURCE_LIMITATION', message: 'Một số mô tả khẩu phần gia đình chưa có nguồn được ghi nhận nên chỉ hiển thị khối lượng gram.' });
  }
  const provenanceWarnings = warnings.map(warning => warning.code);
  return {
    meal: {
      id: template.id,
      slot: template.slot,
      name: template.name,
      instructions: Array.isArray(template.instructions) ? template.instructions : [],
      portions: portions.map(({ aliases, allergens, ...portion }) => portion),
      nutrients: totalsForPortions(portions, foodById),
      nutrientUnits,
      estimatedCostVnd: mealPrice.value,
      price: mealPrice,
      explanation: `Được chọn trong kế hoạch hoàn chỉnh có điểm lệch mục tiêu thấp nhất sau khi áp dụng dị ứng và giới hạn cứng; thành phần được tính theo khẩu phần gram đã hiển thị.`,
      warnings,
      provenance: { catalogVersion: catalog.version, template: templateSource, foods: sourceRefs },
      selectionReasons: [
        { code: 'COMPLETE_MEAL_SLOT', message: `Đáp ứng vị trí ${template.slot} trong kế hoạch hoàn chỉnh.` },
        { code: 'HARD_CONSTRAINTS_APPLIED', message: 'Không vi phạm dị ứng, thực phẩm loại trừ hoặc hardLimits đã gửi.' },
        ...(provenanceWarnings.length ? [{ code: 'SOURCE_LIMITATIONS', message: 'Xem cảnh báo nguồn và phiên bản của bữa ăn.' }] : [])
      ]
    },
    price: mealPrice,
    scoreScale: scale
  };
}

function infeasibleResult(base, code, message, details = []) {
  return { ...base, status: 'infeasible', planFeasible: false, infeasibility: { code, message, details } };
}

function unavailableResult(base, code, message, details = []) {
  return { ...base, status: 'unavailable', planFeasible: false, unavailability: { code, message, details } };
}

function buildBaseResult(request, catalog, blockedFoodIds) {
  const targets = Object.fromEntries(Object.entries(DEFAULT_TARGETS).map(([key, range]) => [key, { ...range, unit: NUTRIENTS[key].unit }]));
  for (const [key, range] of Object.entries(request.targets)) targets[key] = { ...range, unit: NUTRIENTS[key].unit };
  return {
    contractVersion: 1,
    status: 'unavailable',
    planFeasible: false,
    plan: [],
    dailyTotals: null,
    estimatedCostVnd: null,
    score: null,
    grocery: [],
    goals: targets,
    hardLimits: request.hardLimits,
    constraintsApplied: { allergies: request.allergies, excludedFoodIds: [...new Set([...request.excludedFoodIds, ...blockedFoodIds])].sort() },
    warnings: [],
    disclaimer: DISCLAIMER,
    limitations: [...LIMITATIONS],
    metadata: {
      catalogVersion: catalog?.version || null,
      algorithmVersion: ALGORITHM_VERSION,
      dietaryVariety: request.dietaryVariety,
      nutrientUnits: catalog?.nutrientUnits || Object.fromEntries(Object.entries(NUTRIENTS).map(([key, value]) => [key, value.unit]))
    }
  };
}

function generatePlan(input) {
  const foods = Array.isArray(input?.foods) ? input.foods : undefined;
  const rawRequest = input?.request || Object.fromEntries(
    [...ALLOWED_REQUEST_FIELDS].filter(field => Object.hasOwn(input || {}, field)).map(field => [field, input[field]])
  );
  const request = validateMealPlanRequest(rawRequest, { foods });
  const mealTemplates = input?.mealTemplates;
  const catalog = input?.catalog;
  const sources = Array.isArray(catalog?.sources) ? catalog.sources : [];
  const foodById = new Map((foods || []).filter(food => typeof food?.id === 'string').map(food => [food.id, food]));
  const normalizedAllergies = request.allergies.map(normalizeLabel);
  const recognizedAllergens = new Set((foods || []).flatMap(food => Array.isArray(food?.allergens) ? food.allergens.map(normalizeLabel) : []));
  const blockedFoodIds = (foods || []).filter(food => {
    const foodAllergens = Array.isArray(food?.allergens) ? food.allergens.map(normalizeLabel) : [];
    return request.excludedFoodIds.includes(food?.id) || foodAllergens.some(allergen => normalizedAllergies.includes(allergen));
  }).map(food => food.id);
  const base = buildBaseResult(request, catalog, blockedFoodIds);

  if (!foods?.length || !Array.isArray(mealTemplates) || mealTemplates.length === 0 || !sources.length || typeof catalog?.version !== 'string' || !catalog.version.trim()) {
    return unavailableResult(base, 'CATALOG_DATA_UNAVAILABLE', 'Chưa có đầy đủ catalog, công thức hoặc registry nguồn để tạo thực đơn.');
  }
  const unsupportedAllergies = request.allergies.filter(allergy => !recognizedAllergens.has(normalizeLabel(allergy)));
  if (unsupportedAllergies.length) {
    return unavailableResult(base, 'ALLERGEN_NOT_COVERED', 'Catalog không phân loại được một hoặc nhiều dị ứng đã khai báo; không tạo thực đơn.', unsupportedAllergies.map(allergen => ({ allergen })));
  }
  const slots = [...new Set(mealTemplates.map(meal => meal?.slot).filter(slot => typeof slot === 'string' && slot.trim()))];
  if (!slots.length) return unavailableResult(base, 'MEAL_SLOTS_UNAVAILABLE', 'Catalog chưa có vị trí bữa ăn hợp lệ.');

  const diagnostics = [];
  let optionsBySlot = slots.map(slot => {
    const options = [];
    for (const template of mealTemplates.filter(item => item?.slot === slot)) {
      if (!template || !Array.isArray(template.items) || template.items.length === 0) {
        diagnostics.push({ slot, code: 'MEAL_TEMPLATE_INVALID' });
        continue;
      }
      if (template.items.some(item => blockedFoodIds.includes(item?.foodId))) continue;
      if (request.allergies.length && template.items.some(item => !Array.isArray(foodById.get(item?.foodId)?.allergens))) {
        diagnostics.push({ slot, code: 'ALLERGEN_DATA_UNAVAILABLE' });
        continue;
      }
      for (const scale of PORTION_SCALES) {
        const candidate = makeMeal(template, scale, foodById, sources, catalog);
        if (candidate.unavailableCode) diagnostics.push({ slot, code: candidate.unavailableCode });
        else options.push(candidate);
      }
    }
    return { slot, options };
  });

  const emptySlots = optionsBySlot.filter(item => item.options.length === 0);
  if (emptySlots.length) {
    const dataCodes = new Set(diagnostics.map(item => item.code));
    const dataUnavailableCode = ['NUTRIENT_DATA_UNAVAILABLE', 'NUTRIENT_PROVENANCE_UNAVAILABLE', 'ALLERGEN_DATA_UNAVAILABLE', 'MEAL_TEMPLATE_PROVENANCE_UNAVAILABLE', 'MEAL_TEMPLATE_INVALID'].find(code => dataCodes.has(code));
    if (dataUnavailableCode) {
      return unavailableResult(base, dataUnavailableCode, 'Catalog thiếu dữ liệu thành phần, nguồn hoặc công thức để đánh giá đầy đủ.', emptySlots.map(item => ({ slot: item.slot })));
    }
    return infeasibleResult(base, 'NO_SAFE_MEAL_FOR_SLOT', 'Không có lựa chọn an toàn cho một hoặc nhiều vị trí bữa ăn; không trả thực đơn một phần.', emptySlots.map(item => ({ slot: item.slot })));
  }

  if (request.budgetVnd !== undefined) {
    optionsBySlot = optionsBySlot.map(({ slot, options }) => ({ slot, options: options.filter(option => option.price.value !== null) }));
    const unpricedSlots = optionsBySlot.filter(item => item.options.length === 0);
    if (unpricedSlots.length) {
      return unavailableResult(base, 'PRICE_DATA_UNAVAILABLE', 'Chưa có giá có nguồn và phiên bản cho mọi bữa cần xét ngân sách.', unpricedSlots.map(item => ({ slot: item.slot })));
    }
  }

  const hardFeasiblePlans = [];
  const budgetFeasiblePlans = [];
  function enumerate(index, chosen) {
    if (index === optionsBySlot.length) {
      const meals = chosen.map(option => option.meal);
      const dailyTotals = finishTotals(meals.reduce((totals, meal) => addTotals(totals, meal.nutrients), emptyTotals()));
      if (!compareLimits(dailyTotals, request.hardLimits)) return;
      const totalCost = meals.every(meal => Number.isFinite(meal.estimatedCostVnd))
        ? meals.reduce((total, meal) => total + meal.estimatedCostVnd, 0)
        : null;
      const candidate = {
        meals,
        dailyTotals,
        totalCost,
        score: targetPenalty(dailyTotals, base.goals),
        preference: preferenceMatches(meals, request.preferences),
        varietyPenalty: dietaryVarietyPenalty(meals, request.dietaryVariety),
        stableKey: chosen.map(option => `${option.meal.id}:${option.scoreScale}`).join('|')
      };
      hardFeasiblePlans.push(candidate);
      if (request.budgetVnd === undefined || totalCost <= request.budgetVnd) budgetFeasiblePlans.push(candidate);
      return;
    }
    for (const option of optionsBySlot[index].options) enumerate(index + 1, [...chosen, option]);
  }
  enumerate(0, []);

  if (!hardFeasiblePlans.length) {
    return infeasibleResult(base, 'HARD_LIMITS_UNSATISFIABLE', 'Không có tổ hợp đầy đủ nào đáp ứng mọi hardLimits đã gửi.', Object.entries(request.hardLimits).map(([nutrient, range]) => ({ nutrient, ...range })));
  }
  if (!budgetFeasiblePlans.length) {
    const minimumSourcedCost = Math.min(...hardFeasiblePlans.map(plan => plan.totalCost));
    return infeasibleResult(base, 'BUDGET_TOO_LOW', 'Không có tổ hợp đáp ứng đồng thời ngân sách và hardLimits.', [{ budgetVnd: request.budgetVnd, minimumSourcedCostVnd: minimumSourcedCost, unit: 'VND' }]);
  }

  budgetFeasiblePlans.sort((left, right) =>
    left.score - right.score ||
    right.preference.matched.length - left.preference.matched.length ||
    left.varietyPenalty - right.varietyPenalty ||
    (left.totalCost ?? Number.MAX_SAFE_INTEGER) - (right.totalCost ?? Number.MAX_SAFE_INTEGER) ||
    (left.stableKey < right.stableKey ? -1 : left.stableKey > right.stableKey ? 1 : 0));
  const best = budgetFeasiblePlans[0];
  const warnings = [];
  const missingPrice = best.meals.some(meal => meal.estimatedCostVnd === null);
  if (missingPrice) warnings.push({ code: 'PRICE_DATA_UNAVAILABLE', message: 'Chi phí chưa thể ước tính do chưa có nguồn giá; không áp dụng ngân sách.' });
  if (best.meals.some(meal => meal.warnings.some(warning => warning.code === 'NUTRIENT_SOURCE_LIMITATION'))) {
    warnings.push({ code: 'NUTRIENT_SOURCE_LIMITATION', message: 'Một số nguồn dinh dưỡng chưa có mã bản ghi/bản phát hành truy hồi được hoặc chưa được xác minh.' });
  }
  for (const [nutrient, range] of Object.entries(base.goals)) {
    const actual = best.dailyTotals[nutrient];
    if ((range.min !== undefined && actual < range.min) || (range.max !== undefined && actual > range.max)) {
      warnings.push({
        code: 'SOFT_TARGET_UNMET', nutrient, unit: range.unit,
        actual, min: range.min ?? null, max: range.max ?? null,
        message: `Mục tiêu mềm ${nutrient} chưa đạt: ${actual} ${range.unit}; khoảng mong muốn ${range.min ?? '—'}–${range.max ?? '—'} ${range.unit}.`
      });
    }
  }
  if (best.preference.words.length && best.preference.matched.length < best.preference.words.length) {
    const unmet = best.preference.words.filter(word => !best.preference.matched.includes(word));
    warnings.push({ code: 'PREFERENCE_UNMET', message: `Không thể áp dụng đầy đủ sở thích: ${unmet.join(', ')}.` });
  }
  const plan = best.meals.map(meal => ({
    ...meal,
    warnings: [...meal.warnings, ...warnings.filter(warning => ['SOFT_TARGET_UNMET', 'PREFERENCE_UNMET'].includes(warning.code))]
  }));
  const groceryTotals = new Map();
  for (const meal of plan) for (const portion of meal.portions) groceryTotals.set(portion.foodId, (groceryTotals.get(portion.foodId) || 0) + portion.grams);
  const grocery = [...groceryTotals.entries()].map(([foodId, grams]) => ({ foodId, name: foodById.get(foodId).name, grams: round(grams), unit: 'g' }));

  return {
    ...base,
    status: 'feasible',
    planFeasible: true,
    plan,
    dailyTotals: best.dailyTotals,
    estimatedCostVnd: best.totalCost,
    score: best.score,
    grocery,
    warnings,
    metadata: { ...base.metadata, templateVersions: [...new Set(plan.map(meal => meal.provenance.template.templateVersion))].sort() }
  };
}

module.exports = {
  ALGORITHM_VERSION,
  DEFAULT_TARGETS,
  NUTRIENT_KEYS,
  MealPlanValidationError,
  dietaryVarietyPenalty,
  generatePlan,
  validateMealPlanRequest,
};
