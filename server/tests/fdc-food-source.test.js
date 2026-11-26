const test = require('node:test');
const assert = require('node:assert/strict');
const { createFdcFoodSource } = require('../src/services/fdc-food-source');

function response(status, value, { contentLength } = {}) {
  const body = JSON.stringify(value);
  const bytes = Buffer.from(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get(name) { return name.toLowerCase() === 'content-length' ? contentLength === undefined ? String(Buffer.byteLength(body)) : contentLength : null; } },
    body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }),
  };
}

const detail = {
  fdcId: 12345,
  description: 'Beans, cooked',
  dataType: 'Foundation',
  publicationDate: '2025-04-01',
  foodNutrients: [
    { nutrient: { id: 1008, unitName: 'kcal' }, amount: 127 },
    { nutrient: { id: 1003, unitName: 'g' }, amount: 8.7 },
    { nutrient: { id: 1005, unitName: 'g' }, amount: 22.8 },
    { nutrient: { id: 1004, unitName: 'g' }, amount: 0.5 },
    { nutrient: { id: 1079, unitName: 'g' }, amount: 6.4 },
    { nutrient: { id: 1093, unitName: 'mg' }, amount: 2 },
  ],
};

test('search maps FDC summaries into attributed stable IDs and bounds provider paging', async () => {
  let requested;
  const source = createFdcFoodSource({ apiKey: 'synthetic-key', fetchImpl: async (url, options) => {
    requested = { url: new URL(url), options, body: options.body ? JSON.parse(options.body) : null };
    return response(200, { foods: [{ fdcId: 12345, description: 'Beans, cooked', dataType: 'Foundation', publicationDate: '2025-04-01', foodNutrients: detail.foodNutrients }] });
  } });
  const result = await source.search('beans', { page: 2 });
  assert.equal(requested.url.pathname, '/fdc/v1/foods/search');
  assert.equal(requested.body.pageSize, 25);
  assert.equal(requested.body.pageNumber, 2);
  assert.deepEqual(requested.body.dataType, ['Foundation', 'SR Legacy', 'Survey (FNDDS)']);
  assert.equal(requested.url.searchParams.get('api_key'), 'synthetic-key');
  assert.equal(requested.options.method, 'POST');
  assert.equal(JSON.stringify(result).includes('synthetic-key'), false);
  assert.equal(result.items[0].id, 'fdc:12345');
  assert.equal(result.items[0].source.recordId, '12345');
  assert.equal(result.items[0].nutrition.values.energyKcal.value, 127);
});

test('detail normalizes nutrient IDs and units while preserving missing values and provenance', async () => {
  const source = createFdcFoodSource({ apiKey: 'synthetic-key', fetchImpl: async () => response(200, { ...detail, foodNutrients: detail.foodNutrients.filter(item => item.nutrient.id !== 1079) }) });
  const food = await source.getFood('12345');
  assert.equal(food.id, 'fdc:12345');
  assert.equal(food.basis.amount, 100);
  assert.equal(food.nutrition.values.proteinG.value, 8.7);
  assert.equal(food.nutrition.values.fiberG.value, null);
  assert.equal(food.nutrition.values.fiberG.status, 'missing');
  assert.equal(food.source.id, 'USDA-FDC');
  assert.equal(food.source.edition, '2025-04-01');
  assert.equal(food.catalogVersion, 'USDA-FDC-live-v1');
});

test('ambiguous duplicate nutrients remain unknown rather than selecting an arbitrary amount', async () => {
  const source = createFdcFoodSource({ apiKey: 'synthetic-key', fetchImpl: async () => response(200, { ...detail, foodNutrients: [...detail.foodNutrients, { nutrient: { id: 1003, unitName: 'g' }, amount: 100 }] }) });
  const food = await source.getFood('12345');
  assert.equal(food.nutrition.values.proteinG.value, null);
  assert.match(food.nutrition.values.proteinG.reason, /duplicate/i);
});

test('detail requests are coalesced and returned cached records cannot mutate the cache', async () => {
  let requests = 0;
  const source = createFdcFoodSource({ apiKey: 'synthetic-key', fetchImpl: async () => { requests += 1; return response(200, detail); } });
  const [first, concurrent] = await Promise.all([source.getFood('12345'), source.getFood('12345')]);
  first.name = 'mutated caller value';
  assert.equal(concurrent.name, 'Beans, cooked');
  assert.equal((await source.getFood('12345')).name, 'Beans, cooked');
  assert.equal(requests, 1);
});

test('source fails closed for missing key, rate limits, malformed records and oversized responses', async () => {
  await assert.rejects(createFdcFoodSource({}).search('beans'), error => error.code === 'FOOD_SOURCE_UNAVAILABLE');
  await assert.rejects(createFdcFoodSource({ apiKey: 'synthetic-key', fetchImpl: async () => response(429, {}) }).search('beans'), error => error.code === 'FOOD_SOURCE_RATE_LIMITED');
  await assert.rejects(createFdcFoodSource({ apiKey: 'synthetic-key', fetchImpl: async () => response(200, detail, { contentLength: '99999999' }), maxResponseBytes: 1024 }).getFood('12345'), error => error.code === 'FOOD_SOURCE_UNAVAILABLE');
  await assert.rejects(createFdcFoodSource({ apiKey: 'synthetic-key', maxResponseBytes: 1024, fetchImpl: async () => response(200, { ...detail, extra: 'x'.repeat(2048) }, { contentLength: null }) }).getFood('12345'), error => error.code === 'FOOD_SOURCE_UNAVAILABLE');
  await assert.rejects(createFdcFoodSource({ apiKey: 'synthetic-key', fetchImpl: async () => response(200, { fdcId: 12345 }) }).getFood('12345'), error => error.code === 'FOOD_SOURCE_UNAVAILABLE');
});

test('provider timeout maps to a safe unavailable result without revealing the key', async () => {
  const source = createFdcFoodSource({
    apiKey: 'private-synthetic-key', timeoutMs: 10,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('network timeout')), { once: true })),
  });
  await assert.rejects(source.search('beans'), error => error.code === 'FOOD_SOURCE_UNAVAILABLE' && !error.message.includes('private-synthetic-key'));
});
