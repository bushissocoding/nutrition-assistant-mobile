const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCatalog } = require('../src/repositories/catalog');
const { createPendingInstituteFoodSource } = require('../src/services/food-source');

test('the active catalog waits for authorized Institute data instead of serving comparator values', () => {
  const { foods, mealTemplates, catalog } = loadCatalog();

  assert.equal(catalog.status, 'pending');
  assert.equal(foods.length, 0);
  assert.equal(mealTemplates.length, 0);
  assert.match(catalog.notice, /Viện Dinh dưỡng/);
  assert.match(catalog.notice, /quyền tái phân phối/);
  assert.ok(catalog.sources.some(source => source.id === 'vietnam-nin'));
  assert.deepEqual(catalog.sources.filter(source => source.kind === 'external').map(source => source.id), ['vietnam-nin']);
});

test('the food source reports a consistent unavailable state without making requests', async () => {
  const source = createPendingInstituteFoodSource();

  await assert.rejects(source.search('rau'), error => {
    assert.equal(error.code, 'FOOD_SOURCE_UNAVAILABLE');
    assert.match(error.message, /Viện Dinh dưỡng/);
    assert.match(error.message, /quyền tái phân phối/);
    return true;
  });
  await assert.rejects(source.getFood('record-123'), error => error.code === 'FOOD_SOURCE_UNAVAILABLE');
});
