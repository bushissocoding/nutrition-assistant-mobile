const { generatePlan, validateMealPlanRequest } = require('./meal-planner');

function normalizeMatch(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function foodSearchTerm(food) {
  const description = food?.preparation?.description;
  const match = typeof description === 'string' && /(?:Mục đối chiếu|Comparator):\s*([^.]*)/i.exec(description);
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
  if (!values || typeof values !== 'object') return null;
  const per100g = Object.fromEntries(Object.entries(values).map(([key, nutrient]) => [key, nutrient?.value ?? null]));
  return {
    id: sourcedFood.id,
    version: `${sourcedFood.source?.recordId || sourcedFood.fdcId}-${sourcedFood.source?.edition || 'live'}`,
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
        sourceId: 'USDA-FDC',
        sourceRecordId: sourcedFood.source?.recordId || sourcedFood.fdcId,
        edition: sourcedFood.source?.edition || `live-record-${sourcedFood.fdcId}`,
        method: 'Nutrient values mapped from the USDA FoodData Central food-detail record by nutrient ID and unit.',
      },
      serving: null,
    } },
    source: sourcedFood.source,
    review: { status: 'needs-source-verification' },
  };
}

async function createSourcedMealPlan({ foods, mealTemplates, catalog, profile, foodSource, input } = {}) {
  const currentCatalogVersion = 'USDA-FDC-live-v1';
  if (!profile) return unavailable('PROFILE_REQUIRED', 'Hãy hoàn tất hồ sơ trước khi tạo kế hoạch.', currentCatalogVersion);
  if (Array.isArray(profile.red_flags) && profile.red_flags.length) return unavailable('HEALTH_REVIEW_REQUIRED', 'Hồ sơ có dấu hiệu cần được nhân viên y tế đánh giá; chưa tạo kế hoạch.', currentCatalogVersion);
  const allergies = Array.isArray(profile.allergies) ? profile.allergies : [];
  if (allergies.length) return unavailable('ALLERGEN_COVERAGE_UNAVAILABLE', 'USDA FoodData Central không xác minh đầy đủ thành phần gây dị ứng hoặc nhiễm chéo; chưa tạo kế hoạch.', currentCatalogVersion);

  let request;
  try {
    const allowedFields = ['contractVersion', 'preferences'];
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowedFields.includes(key))) {
      return unavailable('INVALID_MEAL_PLAN_REQUEST', 'Kế hoạch chỉ nhận sở thích và phiên bản yêu cầu; chỉ tiêu được lấy từ hồ sơ tài khoản.', currentCatalogVersion);
    }
    request = validateMealPlanRequest({
      contractVersion: input.contractVersion,
      preferences: input.preferences,
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
    if (!query || !foodSource) return unavailable('FOOD_SOURCE_UNAVAILABLE', 'Nguồn thực phẩm có nguồn chưa sẵn sàng.', currentCatalogVersion);
    let search;
    try { search = await foodSource.search(query, { page: 1 }); }
    catch { return unavailable('FOOD_SOURCE_UNAVAILABLE', 'Không thể đối chiếu một thành phần với nguồn thực phẩm USDA.', currentCatalogVersion); }
    const exact = (search.items || []).filter(item => normalizeMatch(item.name) === normalizeMatch(query));
    if (exact.length !== 1) return unavailable('FOOD_MATCH_UNVERIFIED', 'Nguồn USDA không có một bản ghi khớp duy nhất cho thành phần kế hoạch.', currentCatalogVersion);
    let detail;
    try { detail = await foodSource.getFood(exact[0].fdcId); }
    catch { return unavailable('FOOD_SOURCE_UNAVAILABLE', 'Không thể tải chi tiết dinh dưỡng từ nguồn USDA.', currentCatalogVersion); }
    if (detail.id !== exact[0].id || detail.catalogVersion !== currentCatalogVersion) return unavailable('FOOD_SOURCE_UNAVAILABLE', 'Bản ghi chi tiết không khớp kết quả tìm kiếm.', currentCatalogVersion);
    const food = toPlannerFood(templateFood, detail);
    if (!food) return unavailable('NUTRIENT_DATA_UNAVAILABLE', 'Nguồn USDA không trả về bảng dưỡng chất hợp lệ.', currentCatalogVersion);
    sourcedFoods.push(food);
    mappedIds.set(templateFoodId, detail.id);
  }

  const remappedTemplates = mealTemplates.map(template => ({
    ...template,
    items: (template.items || []).map(item => ({ ...item, foodId: mappedIds.get(item.foodId) })),
  }));
  const fdcRegistry = {
    id: 'USDA-FDC',
    kind: 'external',
    name: 'USDA FoodData Central',
    url: 'https://fdc.nal.usda.gov/',
    rights: { redistributionStatus: 'permitted', license: { name: 'CC0 1.0 Universal', url: 'https://creativecommons.org/publicdomain/zero/1.0/' } },
  };
  const liveCatalog = {
    ...catalog,
    version: currentCatalogVersion,
    status: 'live',
    sources: [...(catalog?.sources || []).filter(source => source.id !== fdcRegistry.id), fdcRegistry],
  };
  const result = generatePlan({ foods: sourcedFoods, mealTemplates: remappedTemplates, catalog: liveCatalog, request });
  result.constraintsApplied.profileUpdatedAt = profile.updated_at || null;
  result.metadata.catalogVersion = currentCatalogVersion;
  result.metadata.profileUpdatedAt = profile.updated_at || null;
  result.limitations = [...(result.limitations || []), 'Dữ liệu USDA không cung cấp xác nhận nhiễm chéo dị ứng; không dùng kế hoạch này để điều trị bệnh.', 'Mẫu bữa do dự án biên soạn; khẩu phần và mô tả chưa được chuyên gia dinh dưỡng thẩm định.'];
  return result;
}

module.exports = { createSourcedMealPlan, foodSearchTerm, normalizeMatch, toPlannerFood, unavailable };
