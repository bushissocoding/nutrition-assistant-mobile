const { PENDING_DATASET_MESSAGE } = require('./food-source');
const { generatePlan, validateMealPlanRequest } = require('./meal-planner');

function normalizeMatch(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function foodSearchTerm(food) {
  if (typeof food?.sourceSearchTerm === 'string' && food.sourceSearchTerm.trim()) return food.sourceSearchTerm.trim();
  const description = food?.preparation?.description;
  const match = typeof description === 'string' && /Source query:\s*([^.]*)/i.exec(description);
  return match?.[1]?.trim() || '';
}

function unavailable(code, message, catalogVersion = null) {
  return {
    contractVersion: 1,
    status: 'unavailable',
    planFeasible: false,
    plan: [],
    dailyTotals: null,
    estimatedCostVnd: null,
    grocery: [],
    warnings: [],
    unavailability: { code, message },
    disclaimer: 'Không tạo được kế hoạch từ dữ liệu có nguồn đầy đủ. Nội dung không phải tư vấn y khoa.',
    metadata: { catalogVersion, algorithmVersion: 'meal-planner-v2', nutrientUnits: {} },
  };
}

function toPlannerFood(templateFood, sourcedFood) {
  const values = sourcedFood?.nutrition?.values;
  const source = sourcedFood?.source;
  const sourceRecordId = source?.recordId;
  if (!values || typeof values !== 'object' || !source?.id || !sourceRecordId || !source.edition) return null;
  const per100g = Object.fromEntries(Object.entries(values).map(([key, nutrient]) => [key, nutrient?.value ?? null]));
  return {
    id: sourcedFood.id,
    version: `${sourceRecordId}-${source.edition}`,
    name: sourcedFood.name,
    aliases: [],
    category: templateFood.category,
    allergens: [],
    tags: templateFood.tags || [],
    preparation: templateFood.preparation,
    serving: { amount: 100, unit: 'g', household: '', conversions: [] },
    nutrition: { basis: { amount: 100, unit: 'g', ediblePortion: true }, values },
    per100g,
    provenance: { groups: {
      nutrition: {
        sourceId: source.id,
        sourceRecordId,
        edition: source.edition,
        method: 'Nutrient values mapped from the licensed food-detail record by nutrient ID and unit.',
      },
      serving: null,
    } },
    source,
    review: { status: 'needs-source-verification' },
  };
}

async function createSourcedMealPlan({ foods, mealTemplates, catalog, profile, foodSource, input } = {}) {
  const currentCatalogVersion = catalog?.version || null;
  if (!profile) return unavailable('PROFILE_REQUIRED', 'Hãy hoàn tất hồ sơ trước khi tạo kế hoạch.', currentCatalogVersion);
  if (Array.isArray(profile.red_flags) && profile.red_flags.length) return unavailable('HEALTH_REVIEW_REQUIRED', 'Hồ sơ có dấu hiệu cần được nhân viên y tế đánh giá; chưa tạo kế hoạch.', currentCatalogVersion);
  if (catalog?.status === 'pending' || !foodSource) {
    return unavailable('FOOD_SOURCE_UNAVAILABLE', PENDING_DATASET_MESSAGE, currentCatalogVersion);
  }
  const allergies = Array.isArray(profile.allergies) ? profile.allergies : [];
  if (allergies.length) return unavailable('ALLERGEN_COVERAGE_UNAVAILABLE', 'Nguồn thực phẩm chưa xác minh đầy đủ thành phần gây dị ứng hoặc nhiễm chéo; chưa tạo kế hoạch.', currentCatalogVersion);

  let request;
  try {
    const allowedFields = ['contractVersion', 'preferences', 'dietaryVariety'];
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowedFields.includes(key))) {
      return unavailable('INVALID_MEAL_PLAN_REQUEST', 'Kế hoạch chỉ nhận sở thích và phiên bản yêu cầu; chỉ tiêu được lấy từ hồ sơ tài khoản.', currentCatalogVersion);
    }
    request = validateMealPlanRequest({
      contractVersion: input.contractVersion,
      preferences: input.preferences,
      dietaryVariety: input.dietaryVariety,
      allergies,
      hardLimits: profile.mode === 'patient' ? profile.hard_limits : {},
    }, { foods: [] });
  } catch (error) {
    if (error?.code === 'INVALID_MEAL_PLAN_REQUEST') return unavailable(error.code, error.message, currentCatalogVersion);
    throw error;
  }

  const templateFoodById = new Map((foods || []).map(food => [food.id, food]));
  const referencedIds = [...new Set((mealTemplates || []).flatMap(template => (template.items || []).map(item => item.foodId)))].sort();
  if (!referencedIds.length || referencedIds.some(id => !templateFoodById.has(id))) return unavailable('MEAL_TEMPLATE_INVALID', 'Không có đủ thành phần để tạo kế hoạch.', currentCatalogVersion);

  const sourcedFoods = [];
  const mappedIds = new Map();
  for (const templateFoodId of referencedIds) {
    const templateFood = templateFoodById.get(templateFoodId);
    const query = foodSearchTerm(templateFood);
    if (!query) return unavailable('FOOD_MATCH_UNVERIFIED', 'Thành phần mẫu chưa được ánh xạ tới một bản ghi của Viện Dinh dưỡng.', currentCatalogVersion);
    let search;
    try { search = await foodSource.search(query, { page: 1 }); }
    catch { return unavailable('FOOD_SOURCE_UNAVAILABLE', PENDING_DATASET_MESSAGE, currentCatalogVersion); }
    const exact = (search.items || []).filter(item => normalizeMatch(item.name) === normalizeMatch(query));
    if (exact.length !== 1) return unavailable('FOOD_MATCH_UNVERIFIED', 'Không tìm thấy một bản ghi duy nhất khớp với thành phần mẫu.', currentCatalogVersion);
    let detail;
    try { detail = await foodSource.getFood(exact[0].recordId); }
    catch { return unavailable('FOOD_SOURCE_UNAVAILABLE', PENDING_DATASET_MESSAGE, currentCatalogVersion); }
    if (detail.id !== exact[0].id || detail.catalogVersion !== currentCatalogVersion) return unavailable('FOOD_SOURCE_UNAVAILABLE', 'Chi tiết thực phẩm không khớp với bản ghi đã tìm thấy.', currentCatalogVersion);
    const food = toPlannerFood(templateFood, detail);
    if (!food) return unavailable('NUTRIENT_DATA_UNAVAILABLE', 'Bản ghi nguồn chưa có bảng dưỡng chất hợp lệ.', currentCatalogVersion);
    sourcedFoods.push(food);
    mappedIds.set(templateFoodId, detail.id);
  }

  const sourceIds = new Set(sourcedFoods.map(food => food.source.id));
  if (sourceIds.size !== 1) return unavailable('FOOD_SOURCE_UNAVAILABLE', 'Các thành phần không thuộc cùng một nguồn dữ liệu.', currentCatalogVersion);
  const sourceId = [...sourceIds][0];
  const registeredSource = (catalog?.sources || []).find(source => source.id === sourceId);
  if (!registeredSource || registeredSource.kind === 'external' && registeredSource.rights?.redistributionStatus !== 'permitted') {
    return unavailable('FOOD_SOURCE_UNAVAILABLE', PENDING_DATASET_MESSAGE, currentCatalogVersion);
  }

  const remappedTemplates = mealTemplates.map(template => ({
    ...template,
    items: (template.items || []).map(item => ({ ...item, foodId: mappedIds.get(item.foodId) })),
  }));
  const liveCatalog = { ...catalog, status: 'licensed' };
  const result = generatePlan({ foods: sourcedFoods, mealTemplates: remappedTemplates, catalog: liveCatalog, request });
  result.constraintsApplied.profileUpdatedAt = profile.updated_at || null;
  result.metadata.catalogVersion = currentCatalogVersion;
  result.metadata.profileUpdatedAt = profile.updated_at || null;
  result.limitations = [...(result.limitations || []), 'Nguồn dữ liệu không xác nhận nhiễm chéo dị ứng; không dùng kế hoạch này để điều trị bệnh.', 'Mẫu bữa do dự án biên soạn; khẩu phần và mô tả chưa được chuyên gia dinh dưỡng thẩm định.'];
  return result;
}

module.exports = { createSourcedMealPlan, foodSearchTerm, normalizeMatch, toPlannerFood, unavailable };
