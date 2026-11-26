const test = require('node:test');
const assert = require('node:assert/strict');
const { createSourcedMealPlan } = require('../src/services/sourced-meal-plans');

const profile = { mode: 'healthy', allergies: [], red_flags: [], hard_limits: {}, updated_at: '2026-11-24T00:00:00.000Z' };

test('does not query a provider or create a plan while the Institute catalog is pending', async () => {
  let calls = 0;
  const result = await createSourcedMealPlan({
    foods: [],
    mealTemplates: [],
    catalog: { version: 'vietnam-nin-pending-v1', status: 'pending', sources: [] },
    profile,
    foodSource: {
      async search() { calls += 1; return { items: [] }; },
      async getFood() { calls += 1; return null; },
    },
    input: { contractVersion: 1, preferences: '' },
  });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.unavailability.code, 'FOOD_SOURCE_UNAVAILABLE');
  assert.match(result.unavailability.message, /Viện Dinh dưỡng/);
  assert.equal(result.metadata.catalogVersion, 'vietnam-nin-pending-v1');
  assert.deepEqual(result.plan, []);
  assert.equal(calls, 0);
});
