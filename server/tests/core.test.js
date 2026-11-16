const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadCatalog } = require('../src/repositories/catalog');
const { calculateFood, calculateTotals } = require('../src/services/nutrition');
const { generatePlan } = require('../src/services/meal-planner');

const { foods, mealTemplates } = loadCatalog();

test('nutrition calculation scales a food from 100g to the requested portion', () => {
  const rice = foods.find(food => food.id === 'rice-steamed');
  assert.equal(calculateFood(rice, 100).energyKcal, 130);
  assert.equal(calculateFood(rice, 50).energyKcal, 65);
  assert.equal(calculateTotals([{ foodId: rice.id, grams: 100 }], foods).sodiumMg, 1);
});

test('meal planner returns a grocery list aggregated from generated meals', () => {
  const result = generatePlan({ foods, mealTemplates, budgetVnd: 120000, allergies: [] });
  assert.ok(result.plan.length > 0);
  assert.ok(result.grocery.length > 0);
  assert.ok(result.plan.every(meal => meal.nutrients.energyKcal > 0));
});

test('meal planner excludes allergenic foods from a plan', () => {
  const result = generatePlan({ foods, mealTemplates, budgetVnd: 120000, allergies: ['cá'] });
  assert.equal(result.plan.some(meal => meal.name.includes('Cá')), false);
  assert.ok(result.constraintsApplied.excludedFoodIds.includes('tilapia'));
});

test('meal planner treats minimum and maximum hard limits as non-relaxable', () => {
  const feasible = generatePlan({ foods, mealTemplates, budgetVnd: 120000, hardLimits: { sodiumMg: { min: 1, max: 500 } } });
  assert.ok(feasible.plan.length > 0);
  assert.ok(feasible.dailyTotals.sodiumMg >= 1 && feasible.dailyTotals.sodiumMg <= 500);
  const impossible = generatePlan({ foods, mealTemplates, budgetVnd: 120000, hardLimits: { sodiumMg: { max: 0 } } });
  assert.equal(impossible.plan.length, 0);
  assert.equal(impossible.planFeasible, false);
});

test('meal planner validates invalid nutrition targets', () => {
  assert.throws(() => generatePlan({ foods, mealTemplates, targets: { energyKcal: { min: -1 } } }), /không hợp lệ/);
});

test('demo catalog declares non-clinical provenance', () => {
  const sources = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'sources.json'), 'utf8'));
  assert.match(sources.note, /demonstration set/i);
  assert.equal(sources.records[0].name, 'USDA FoodData Central');
});
