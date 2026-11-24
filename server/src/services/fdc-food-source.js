const BASE_URL = 'https://api.nal.usda.gov/fdc/v1';
const MAX_SEARCH_RESULTS = 25;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const SOURCE = Object.freeze({
  id: 'USDA-FDC',
  label: 'USDA FoodData Central',
  url: 'https://fdc.nal.usda.gov/',
});
const NUTRIENTS = Object.freeze({
  1008: { key: 'energyKcal', unit: 'kcal', acceptedUnits: ['kcal'] },
  1003: { key: 'proteinG', unit: 'g', acceptedUnits: ['g'] },
  1005: { key: 'carbohydrateG', unit: 'g', acceptedUnits: ['g'] },
  1004: { key: 'fatG', unit: 'g', acceptedUnits: ['g'] },
  1079: { key: 'fiberG', unit: 'g', acceptedUnits: ['g'] },
  1093: { key: 'sodiumMg', unit: 'mg', acceptedUnits: ['mg'] },
});

class FoodSourceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FoodSourceError';
    this.code = code;
  }
}

function missingNutrients(reason) {
  return Object.fromEntries(Object.values(NUTRIENTS).map(({ key, unit }) => [key, { value: null, unit, status: 'missing', reason }]));
}

function normalizeUnit(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, '') : '';
}

function nutrientId(item) {
  const raw = item?.nutrient?.id ?? item?.nutrientId ?? item?.nutrient?.number ?? item?.nutrientNumber;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

function normalizeNutrients(items) {
  const byKey = new Map(Object.values(NUTRIENTS).map(({ key }) => [key, []]));
  for (const item of Array.isArray(items) ? items : []) {
    const spec = NUTRIENTS[nutrientId(item)];
    if (!spec) continue;
    const raw = item.amount ?? item.value;
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
    const unit = normalizeUnit(item.nutrient?.unitName ?? item.unitName ?? item.unit);
    byKey.get(spec.key).push({ value, unit });
  }
  const output = {};
  for (const [key, candidates] of byKey) {
    if (candidates.length !== 1) {
      const reason = candidates.length > 1 ? 'FoodData Central returned duplicate nutrient records; value is ambiguous.' : 'FoodData Central did not report this nutrient.';
      output[key] = { ...missingNutrients(reason)[key] };
      continue;
    }
    const candidate = candidates[0];
    const spec = Object.values(NUTRIENTS).find(row => row.key === key);
    if (!Number.isFinite(candidate.value) || candidate.value < 0 || !spec.acceptedUnits.includes(candidate.unit)) {
      output[key] = { ...missingNutrients(`FoodData Central returned an unsupported or invalid unit for ${key}.`)[key] };
      continue;
    }
    output[key] = { value: candidate.value, unit: spec.unit, status: 'reported' };
  }
  return output;
}

function safeFoodId(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? String(value)
    : typeof value === 'string' && /^\d{1,12}$/.test(value) && Number(value) > 0 ? String(Number(value)) : null;
}

function recordEdition(record) {
  for (const value of [record?.publicationDate, record?.endDate, record?.startDate]) {
    if (typeof value === 'string' && /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value)) return value;
  }
  return `live-record-${record.fdcId}`;
}

async function readBoundedJson(response, maxBytes) {
  const reader = response.body?.getReader?.();
  if (!reader) throw new FoodSourceError('FOOD_SOURCE_UNAVAILABLE', 'Nguồn thực phẩm trả về dữ liệu không hợp lệ.');
  const chunks = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new FoodSourceError('FOOD_SOURCE_UNAVAILABLE', 'Nguồn thực phẩm trả về dữ liệu không hợp lệ.');
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new FoodSourceError('FOOD_SOURCE_UNAVAILABLE', 'Nguồn thực phẩm trả về dữ liệu vượt giới hạn.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new FoodSourceError('FOOD_SOURCE_UNAVAILABLE', 'Nguồn thực phẩm trả về dữ liệu không hợp lệ.'); }
}

function toFoodDto(record) {
  const fdcId = safeFoodId(record?.fdcId);
  const description = typeof record?.description === 'string' ? record.description.trim() : '';
  if (!fdcId || !description || description.length > 500 || typeof record?.dataType !== 'string') {
    throw new FoodSourceError('FOOD_SOURCE_UNAVAILABLE', 'FoodData Central returned an invalid food record.');
  }
  const edition = recordEdition(record);
  return {
    id: `fdc:${fdcId}`,
    fdcId,
    name: description,
    dataType: record.dataType,
    basis: { amount: 100, unit: 'g' },
    nutrition: { values: normalizeNutrients(record.foodNutrients) },
    allergens: null,
    source: { ...SOURCE, recordId: fdcId, edition },
    catalogVersion: 'USDA-FDC-live-v1',
    detailUrl: `https://fdc.nal.usda.gov/food-details/${fdcId}/nutrients`,
    limitations: ['Giá trị theo 100 g nếu FoodData Central cung cấp đơn vị tương thích.', 'Nguồn này không xác nhận dị ứng, nhiễm chéo hoặc sự phù hợp cho điều trị.'],
  };
}

function createFdcFoodSource({ apiKey, fetchImpl = globalThis.fetch, baseUrl = BASE_URL, timeoutMs = 8000, maxResponseBytes = MAX_RESPONSE_BYTES, cacheTtlMs = 5 * 60 * 1000, now = Date.now } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Food source requires fetch.');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('Food source timeout must be positive.');
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1024) throw new TypeError('Food source response limit is invalid.');
  if (!Number.isFinite(cacheTtlMs) || cacheTtlMs < 0 || typeof now !== 'function') throw new TypeError('Food source cache settings are invalid.');
  const detailCache = new Map();
  const detailRequests = new Map();

  async function request(path, query = {}, { method = 'GET', body: requestBody } = {}) {
    if (typeof apiKey !== 'string' || !apiKey.trim()) throw new FoodSourceError('FOOD_SOURCE_UNAVAILABLE', 'Nguồn thực phẩm USDA chưa được cấu hình.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const url = new URL(`${baseUrl}${path}`);
    url.searchParams.set('api_key', apiKey.trim());
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    try {
      const response = await fetchImpl(url.toString(), {
        method,
        headers: { Accept: 'application/json', ...(requestBody ? { 'Content-Type': 'application/json' } : {}) },
        ...(requestBody ? { body: JSON.stringify(requestBody) } : {}),
        signal: controller.signal,
      });
      if (response.status === 429) throw new FoodSourceError('FOOD_SOURCE_RATE_LIMITED', 'Nguồn thực phẩm đang giới hạn yêu cầu. Hãy thử lại sau.');
      if (!response.ok) throw new FoodSourceError('FOOD_SOURCE_UNAVAILABLE', 'Nguồn thực phẩm tạm thời không khả dụng.');
      const size = Number(response.headers?.get?.('content-length'));
      if (Number.isFinite(size) && size > maxResponseBytes) throw new FoodSourceError('FOOD_SOURCE_UNAVAILABLE', 'Nguồn thực phẩm trả về dữ liệu vượt giới hạn.');
      return await readBoundedJson(response, maxResponseBytes);
    } catch (error) {
      if (error instanceof FoodSourceError) throw error;
      if (controller.signal.aborted) throw new FoodSourceError('FOOD_SOURCE_UNAVAILABLE', 'Nguồn thực phẩm phản hồi quá lâu. Hãy thử lại sau.');
      throw new FoodSourceError('FOOD_SOURCE_UNAVAILABLE', 'Nguồn thực phẩm tạm thời không khả dụng.');
    } finally { clearTimeout(timer); }
  }

  return {
    async search(query, { page = 1 } = {}) {
      const text = typeof query === 'string' ? query.trim() : '';
      if (text.length < 2 || text.length > 100) throw new FoodSourceError('INVALID_FOOD_QUERY', 'Từ khóa tìm kiếm cần từ 2 đến 100 ký tự.');
      if (!Number.isSafeInteger(page) || page < 1 || page > 100) throw new FoodSourceError('INVALID_FOOD_PAGE', 'Trang tìm kiếm không hợp lệ.');
      const body = await request('/foods/search', {}, {
        method: 'POST',
        body: { query: text, pageSize: MAX_SEARCH_RESULTS, pageNumber: page, dataType: ['Foundation', 'SR Legacy', 'Survey (FNDDS)'] },
      });
      if (!Array.isArray(body?.foods)) throw new FoodSourceError('FOOD_SOURCE_UNAVAILABLE', 'Nguồn thực phẩm trả về danh sách không hợp lệ.');
      return {
        items: body.foods.slice(0, MAX_SEARCH_RESULTS).map(toFoodDto),
        page,
        pageSize: MAX_SEARCH_RESULTS,
        totalHits: Number.isSafeInteger(body.totalHits) && body.totalHits >= 0 ? body.totalHits : null,
        source: SOURCE,
        catalogVersion: 'USDA-FDC-live-v1',
      };
    },
    async getFood(id) {
      const fdcId = safeFoodId(id);
      if (!fdcId) throw new FoodSourceError('INVALID_FOOD_ID', 'Mã FoodData Central không hợp lệ.');
      const cached = detailCache.get(fdcId);
      if (cached && cached.expiresAt > now()) return structuredClone(cached.food);
      if (detailRequests.has(fdcId)) return structuredClone(await detailRequests.get(fdcId));
      const pending = (async () => {
        const body = await request(`/food/${fdcId}`);
        if (String(body?.fdcId) !== fdcId) throw new FoodSourceError('FOOD_SOURCE_UNAVAILABLE', 'Nguồn thực phẩm trả về bản ghi không khớp.');
        const food = toFoodDto(body);
        if (cacheTtlMs > 0) {
          if (detailCache.size >= 500) detailCache.delete(detailCache.keys().next().value);
          detailCache.set(fdcId, { food, expiresAt: now() + cacheTtlMs });
        }
        return food;
      })();
      detailRequests.set(fdcId, pending);
      try { return structuredClone(await pending); }
      finally { detailRequests.delete(fdcId); }
    },
  };
}

module.exports = { BASE_URL, MAX_RESPONSE_BYTES, FoodSourceError, createFdcFoodSource, normalizeNutrients, readBoundedJson, toFoodDto };
