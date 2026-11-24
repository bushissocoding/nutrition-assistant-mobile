const test = require('node:test');
const assert = require('node:assert/strict');
const { createSourcedMealPlan } = require('../src/services/sourced-meal-plans');

const keys = ['energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fiberG', 'sodiumMg'];
const source = { id: 'project-curated-meal-templates', name: 'Project meal templates', kind: 'internal', url: null };
const food = {
  id: 'rice-steamed', name: 'Cơm trắng', category: 'Grain', tags: [],
  preparation: { state: 'cooked', maturity: 'not-applicable', description: 'Mục đối chiếu: rice, white, long-grain, regular, cooked. Prototype comparator.' },
};
const template = { id: 'rice-meal', version: 'meal-template-1', name: 'Bữa cơm', slot: 'Bữa sáng', provenance: { sourceId: source.id, sourceRecordId: 'rice-meal', edition: 'prototype-v1', method: 'Project authored sample.' }, price: { amountVnd: null, unit: 'VND', status: 'missing' }, items: [{ foodId: food.id, grams: 100 }] };
const catalog = { version: 'legacy', status: 'prototype', sources: [source], nutrientUnits: { energyKcal: 'kcal', proteinG: 'g', carbohydrateG: 'g', fatG: 'g', fiberG: 'g', sodiumMg: 'mg' } };
const profile = { mode: 'healthy', allergies: [], red_flags: [], hard_limits: {}, updated_at: '2026-11-24T00:00:00.000Z' };
const values = Object.fromEntries(keys.map((key, index) => [key, { value: (index + 1) * 2, unit: key === 'energyKcal' ? 'kcal' : key === 'sodiumMg' ? 'mg' : 'g', status: 'reported' }]));

function exactFoodSource({ matching = true } = {}) {
  const calls = [];
  return {
    calls,
    async search(query) {
      calls.push(['search', query]);
      return { items: matching ? [{ id: 'fdc:12345', fdcId: '12345', name: query }] : [{ id: 'fdc:12345', fdcId: '12345', name: 'different food' }] };
    },
    async getFood(id) {
      calls.push(['detail', id]);
      return { id: 'fdc:12345', fdcId: '12345', name: 'Rice, white, long-grain, regular, cooked', catalogVersion: 'USDA-FDC-live-v1', source: { id: 'USDA-FDC', recordId: '12345', edition: '2025-01-01' }, nutrition: { values } };
    },
  };
}

test('generates sourced plans from exact FDC records and preserves source IDs in portions', async () => {
  const foodSource = exactFoodSource();
  const result = await createSourcedMealPlan({ foods: [food], mealTemplates: [template], catalog, profile, foodSource, input: { contractVersion: 1, preferences: '' } });
  assert.equal(result.status, 'feasible');
  assert.equal(result.metadata.catalogVersion, 'USDA-FDC-live-v1');
  assert.equal(result.metadata.profileUpdatedAt, profile.updated_at);
  assert.equal(result.plan[0].portions[0].foodId, 'fdc:12345');
  assert.equal(result.plan[0].provenance.foods[0].sourceId, 'USDA-FDC');
  assert.deepEqual(foodSource.calls, [['search', 'rice, white, long-grain, regular, cooked'], ['detail', '12345']]);
});

test('does not query USDA or generate a plan if allergy coverage is unavailable', async () => {
  const foodSource = exactFoodSource();
  const result = await createSourcedMealPlan({ foods: [food], mealTemplates: [template], catalog, profile: { ...profile, allergies: ['peanut'] }, foodSource, input: {} });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.unavailability.code, 'ALLERGEN_COVERAGE_UNAVAILABLE');
  assert.deepEqual(foodSource.calls, []);
});

test('does not use an inexact FDC record as a recipe ingredient', async () => {
  const result = await createSourcedMealPlan({ foods: [food], mealTemplates: [template], catalog, profile, foodSource: exactFoodSource({ matching: false }), input: {} });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.unavailability.code, 'FOOD_MATCH_UNVERIFIED');
  assert.deepEqual(result.plan, []);
});

test('takes patient hard limits from server profile and never relaxes them', async () => {
  const result = await createSourcedMealPlan({
    foods: [food], mealTemplates: [template], catalog,
    profile: { ...profile, mode: 'patient', hard_limits: { sodiumMg: { max: 1 } } },
    foodSource: exactFoodSource(), input: { preferences: '' },
  });
  assert.equal(result.status, 'infeasible');
  assert.equal(result.hardLimits.sodiumMg.max, 1);
  assert.equal(result.constraintsApplied.profileUpdatedAt, profile.updated_at);
});
