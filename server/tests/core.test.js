const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadCatalog } = require('../src/repositories/catalog');
const { calculateFood, calculateTotals } = require('../src/services/nutrition');
const { CONTRACT_VERSION, generatePlan, validateGenerateRequest } = require('../src/services/meal-planner');

const { foods, mealTemplates, metadata } = loadCatalog();

test('nutrition calculation scales a food from 100g to the requested portion', () => {
  const rice = foods.find(food => food.id === 'rice-steamed');
  assert.equal(calculateFood(rice, 100).energyKcal, 130);
  assert.equal(calculateFood(rice, 50).energyKcal, 65);
  assert.equal(calculateTotals([{ foodId: rice.id, grams: 100 }], foods).sodiumMg, 1);
});

test('meal planner returns an attributed full-day plan with coherent totals and groceries', () => {
  const result = generatePlan({ foods, mealTemplates, catalog: metadata, budgetVnd: 120000, allergies: [] });
  assert.equal(result.contractVersion, CONTRACT_VERSION);
  assert.equal(result.feasibility.status, 'feasible');
  assert.equal(result.plan.length, 3);
  assert.ok(result.grocery.length > 0);
  assert.ok(result.plan.every(meal => meal.nutrients.energyKcal > 0));
  assert.ok(result.plan.every(meal => meal.portions.every(portion => portion.source.name && portion.source.sourceVersion === null && portion.provenance.reuseRights)));
  assert.ok(result.plan.every(meal => meal.provenance.priceSource && meal.provenance.pricingVersion));
  assert.equal(result.dailyTotals.energyKcal, Math.round(result.plan.reduce((sum, meal) => sum + meal.nutrients.energyKcal, 0) * 10) / 10);
  assert.equal(result.estimatedCostVnd, result.plan.reduce((sum, meal) => sum + meal.estimatedCostVnd, 0));
  assert.ok(result.plan.every(meal => meal.explanation.includes('phương án toàn ngày')));
});

test('allergy constraints remain hard and return structured infeasibility rather than a partial plan', () => {
  const result = generatePlan({ foods, mealTemplates, budgetVnd: 120000, allergies: ['cá'] });
  assert.equal(result.plan.length, 0);
  assert.equal(result.feasibility.status, 'infeasible');
  assert.equal(result.feasibility.code, 'NO_SAFE_RECIPE_FOR_EACH_MEAL');
  assert.ok(result.constraintsApplied.excludedFoodIds.includes('tilapia'));
  assert.equal(result.warnings.some(warning => warning.includes('nhiễm chéo')), false);
  assert.match(result.disclaimer, /không bảo đảm tránh nhiễm chéo/);
});

test('meal planner treats minimum and maximum hard limits as non-relaxable', () => {
  const feasible = generatePlan({ foods, mealTemplates, budgetVnd: 120000, hardLimits: { sodiumMg: { min: 1, max: 500 } } });
  assert.ok(feasible.plan.length > 0);
  assert.ok(feasible.dailyTotals.sodiumMg >= 1 && feasible.dailyTotals.sodiumMg <= 500);
  const impossible = generatePlan({ foods, mealTemplates, budgetVnd: 120000, hardLimits: { sodiumMg: { max: 0 } } });
  assert.equal(impossible.plan.length, 0);
  assert.equal(impossible.planFeasible, false);
  assert.equal(impossible.feasibility.status, 'infeasible');
  assert.equal(impossible.feasibility.code, 'HARD_LIMITS_UNSATISFIABLE');
  assert.deepEqual(impossible.feasibility.unmet, ['hardLimits']);
});

test('planner validates versioned inputs, units, finite values, ranges and unknown fields', () => {
  assert.deepEqual(validateGenerateRequest({ contractVersion: CONTRACT_VERSION, budgetVnd: 1000 }).targets, {});
  for (const input of [
    { budgetVnd: 1000 },
    { contractVersion: '2', budgetVnd: 1000 },
    { contractVersion: CONTRACT_VERSION },
    { contractVersion: CONTRACT_VERSION, budgetVnd: 1000.5 },
    { contractVersion: CONTRACT_VERSION, budgetVnd: -1 },
    { contractVersion: CONTRACT_VERSION, budgetVnd: 1000, targets: { energyKcal: { min: '10' } } },
    { contractVersion: CONTRACT_VERSION, budgetVnd: 1000, targets: { energyKcal: { min: 20, max: 10 } } },
    { contractVersion: CONTRACT_VERSION, budgetVnd: 1000, targets: { energyKcal: { min: 10, unit: 'g' } } },
    { contractVersion: CONTRACT_VERSION, budgetVnd: 1000, allergies: [''] },
    { contractVersion: CONTRACT_VERSION, budgetVnd: 1000, allergies: 'cá' },
    { contractVersion: CONTRACT_VERSION, budgetVnd: 1000, unknown: true },
  ]) assert.throws(() => validateGenerateRequest(input), error => Boolean(error.code && error.field));
});

test('planner excludes incomplete food composition instead of treating missing nutrients as zero', () => {
  const incompleteFoods = foods.map(food => food.id === 'rice-steamed' ? { ...food, per100g: { ...food.per100g, sodiumMg: undefined } } : food);
  const result = generatePlan({ foods: incompleteFoods, mealTemplates, budgetVnd: 120000 });
  assert.equal(result.plan.length, 0);
  assert.ok(result.warnings.some(warning => warning.includes('thiếu giá trị dinh dưỡng')));
});

test('allergy filter fails safe when recipe food has malformed allergen metadata', () => {
  const malformedFoods = foods.map(food => food.id === 'tilapia' ? { ...food, allergens: null } : food);
  const result = generatePlan({ foods: malformedFoods, mealTemplates, budgetVnd: 120000, allergies: ['cá'] });
  assert.equal(result.plan.length, 0);
  assert.equal(result.feasibility.code, 'NO_SAFE_RECIPE_FOR_EACH_MEAL');
});

test('budget-infeasible full-day plans do not return over-budget or partial recommendations and exact budget is allowed', () => {
  const result = generatePlan({ foods, mealTemplates, budgetVnd: 10000 });
  assert.equal(result.plan.length, 0);
  assert.equal(result.feasibility.status, 'infeasible');
  assert.equal(result.feasibility.code, 'BUDGET_UNSATISFIABLE');
  assert.deepEqual(result.feasibility.unmet, ['budgetVnd']);
  const lowestFullDayCost = 18000 * 0.75 + 42000 * 0.75 + 45000 * 0.75;
  const exactBudget = generatePlan({ foods, mealTemplates, budgetVnd: Math.round(lowestFullDayCost) });
  assert.equal(exactBudget.feasibility.status, 'feasible');
  assert.ok(exactBudget.estimatedCostVnd <= Math.round(lowestFullDayCost));
});

test('unmet soft target appears consistently in structured feasibility and user warning', () => {
  const result = generatePlan({ foods, mealTemplates, budgetVnd: 120000, targets: { fiberG: { min: 1000 } } });
  assert.equal(result.feasibility.status, 'feasible');
  const unmetFiber = result.feasibility.unmetSoftTargets.find(target => target.nutrient === 'fiberG');
  assert.ok(unmetFiber);
  assert.equal(unmetFiber.unit, 'g');
  assert.ok(result.warnings.some(warning => warning.includes('fiberG')));
});

test('planner ranks soft nutrient fit before preferences and price while preferences break fit ties', () => {
  const makeFood = (id, fiberG) => ({ id, name: id, allergens: [], per100g: { energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fiberG, sodiumMg: 0 }, serving: { amount: 100, unit: 'g', household: '1 phần' }, source: { name: 'test', url: 'https://example.invalid', note: 'synthetic fixture' } });
  const foodsForRank = [makeFood('better', 25), makeFood('worse', 0), makeFood('equal-a', 0), makeFood('equal-b', 0)];
  const templates = [
    { id: 'fit-cheap', name: 'Món rau', slot: 'Bữa', estimatedCostVnd: 1000, items: [{ foodId: 'better', grams: 100 }] },
    { id: 'worse', name: 'Món gà', slot: 'Bữa', estimatedCostVnd: 100, items: [{ foodId: 'worse', grams: 100 }] },
    { id: 'fit-expensive', name: 'Món cá', slot: 'Bữa', estimatedCostVnd: 5000, items: [{ foodId: 'equal-a', grams: 100 }] },
    { id: 'fit-cheap-tie', name: 'Món cá rẻ', slot: 'Bữa', estimatedCostVnd: 1000, items: [{ foodId: 'equal-b', grams: 100 }] },
  ];
  const fit = generatePlan({ foods: foodsForRank, mealTemplates: templates.slice(0, 2), budgetVnd: 10000, preferences: 'gà', targets: { fiberG: { min: 25 } } });
  assert.equal(fit.plan[0].name, 'Món rau', 'a soft-goal fit ranks ahead of a preference match');
  const tied = generatePlan({ foods: foodsForRank.slice(2), mealTemplates: templates.slice(2), budgetVnd: 10000, preferences: 'cá', targets: { fiberG: { min: 0 } } });
  assert.equal(tied.plan[0].name, 'Món cá rẻ', 'equal goal score and preference match are resolved by lower cost');
});

test('meal planner validates invalid nutrition targets', () => {
  assert.throws(() => generatePlan({ foods, mealTemplates, targets: { energyKcal: { min: -1 } } }), /không hợp lệ/);
});

test('demo catalog declares non-clinical provenance', () => {
  const sources = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'sources.json'), 'utf8'));
  assert.match(sources.note, /demonstration set/i);
  assert.equal(sources.records[0].name, 'USDA FoodData Central');
});
