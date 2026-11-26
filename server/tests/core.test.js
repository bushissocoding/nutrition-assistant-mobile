const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateFood, calculateTotals } = require('../src/services/nutrition');
const { dietaryVarietyPenalty, generatePlan, validateMealPlanRequest } = require('../src/services/meal-planner');
const { createSyntheticPlannerFixture } = require('./helpers/synthetic-planner-data');

const { foods, mealTemplates, catalog } = createSyntheticPlannerFixture();
const nutrientKeys = ['energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fiberG', 'sodiumMg'];

function addSourcedPrices(templates = mealTemplates) {
  return templates.map(template => ({
    ...template,
    price: {
      amountVnd: 100,
      unit: 'VND',
      basis: 'template-1x',
      status: 'reported',
      version: 'synthetic-price-1',
      provenance: {
        sourceId: 'synthetic-fixture',
        sourceRecordId: `test-price-${template.id}`,
        edition: 'synthetic-fixture-1',
        method: 'Synthetic test value; never served as a real price.'
      }
    }
  }));
}

test('nutrition calculation scales a food from 100g to the requested portion', () => {
  const rice = foods.find(food => food.id === 'rice-steamed');
  assert.equal(calculateFood(rice, 100).energyKcal, 100);
  assert.equal(calculateFood(rice, 50).energyKcal, 50);
  assert.equal(calculateTotals([{ foodId: rice.id, grams: 100 }], foods).sodiumMg, 10);
});

test('meal planner returns complete portions, daily totals and traceable source versions without inventing a price', () => {
  const result = generatePlan({ foods, mealTemplates, catalog });
  assert.equal(result.status, 'feasible');
  assert.equal(result.planFeasible, true);
  assert.equal(result.plan.length, new Set(mealTemplates.map(meal => meal.slot)).size);
  assert.ok(result.grocery.length > 0);
  assert.equal(result.metadata.dietaryVariety, 'balanced');
  assert.equal(result.estimatedCostVnd, null);
  assert.ok(result.warnings.some(warning => warning.code === 'PRICE_DATA_UNAVAILABLE'));
  assert.equal(result.metadata.catalogVersion, catalog.version);
  assert.equal(result.metadata.algorithmVersion, 'meal-planner-v2');
  assert.equal(result.metadata.nutrientUnits.sodiumMg, 'mg');
  assert.ok(mealTemplates.every(template => !Object.hasOwn(template, 'estimatedCostVnd') && template.price.status === 'missing'));

  for (const meal of result.plan) {
    assert.ok(meal.portions.length > 0);
    assert.ok(meal.portions.every(portion => portion.grams > 0 && portion.unit === 'g'));
    assert.ok(meal.portions.every(portion => portion.provenance.foodVersion && portion.provenance.sourceId && portion.provenance.edition));
    assert.equal(meal.estimatedCostVnd, null);
    assert.ok(meal.explanation.length > 0);
    assert.ok(meal.instructions.length > 0);
    assert.equal(meal.nutrientUnits.energyKcal, 'kcal');
  }

  const summedMeals = Object.fromEntries(nutrientKeys.map(key => [key, Math.round(result.plan.reduce((sum, meal) => sum + meal.nutrients[key], 0) * 10) / 10]));
  assert.deepEqual(result.dailyTotals, summedMeals);
});

test('meal variety remains a deterministic ranking hint rather than a hard constraint', () => {
  const simplePlan = [{ portions: [{ foodId: 'rice' }, { foodId: 'rice' }, { foodId: 'egg' }] }];
  const variedPlan = [{ portions: [{ foodId: 'rice' }, { foodId: 'egg' }, { foodId: 'cabbage' }] }];
  assert.ok(dietaryVarietyPenalty(simplePlan, 'simple') < dietaryVarietyPenalty(variedPlan, 'simple'));
  assert.ok(dietaryVarietyPenalty(variedPlan, 'varied') < dietaryVarietyPenalty(simplePlan, 'varied'));
  assert.equal(validateMealPlanRequest({ dietaryVariety: 'varied' }).dietaryVariety, 'varied');
  assert.throws(() => validateMealPlanRequest({ dietaryVariety: 'medical' }), error => error.issues[0].path === 'dietaryVariety');
});

test('meal planner excludes declared allergens and can choose a safe alternative for the same slot', () => {
  const dinnerAlternative = {
    ...mealTemplates.find(meal => meal.slot === 'Bữa tối'),
    id: 'test-safe-dinner',
    name: 'Bữa tối thử nghiệm không cá',
    provenance: {
      ...mealTemplates.find(meal => meal.slot === 'Bữa tối').provenance,
      sourceRecordId: 'synthetic-safe-dinner'
    },
    items: [
      { foodId: 'rice-steamed', grams: 100 },
      { foodId: 'tofu-firm', grams: 60 },
      { foodId: 'pumpkin', grams: 100 }
    ]
  };
  const result = generatePlan({ foods, mealTemplates: [...mealTemplates, dinnerAlternative], catalog, allergies: ['CÁ'] });
  assert.equal(result.status, 'feasible');
  assert.ok(result.plan.every(meal => meal.portions.every(portion => !foods.find(food => food.id === portion.foodId).allergens.some(allergen => allergen.toLocaleLowerCase('vi') === 'cá'))));
  assert.ok(result.constraintsApplied.excludedFoodIds.includes('tilapia'));
});

test('planner fails closed when the declared allergen is not covered by the catalog', () => {
  const result = generatePlan({ foods, mealTemplates, catalog, allergies: ['đậu phộng'] });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.unavailability.code, 'ALLERGEN_NOT_COVERED');
  assert.deepEqual(result.plan, []);
});

test('budget cannot be evaluated using unproven template estimates', () => {
  const result = generatePlan({ foods, mealTemplates, catalog, budgetVnd: 120000 });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.unavailability.code, 'PRICE_DATA_UNAVAILABLE');
  assert.deepEqual(result.plan, []);
});

test('budget is a hard constraint when every selected template has a registered source', () => {
  const pricedMeals = addSourcedPrices();
  const untrustedActiveCatalog = generatePlan({ foods, mealTemplates: pricedMeals, catalog, budgetVnd: 1000 });
  assert.equal(untrustedActiveCatalog.status, 'unavailable', 'synthetic test prices are never accepted for the active catalog');
  const testCatalog = { ...catalog, status: 'synthetic-fixture' };
  const underBudget = generatePlan({ foods, mealTemplates: pricedMeals, catalog: testCatalog, budgetVnd: 1000 });
  assert.equal(underBudget.status, 'feasible');
  assert.equal(underBudget.estimatedCostVnd, underBudget.plan.reduce((total, meal) => total + meal.estimatedCostVnd, 0));
  assert.ok(underBudget.estimatedCostVnd <= 1000);

  const overBudget = generatePlan({ foods, mealTemplates: pricedMeals, catalog: testCatalog, budgetVnd: 224 });
  assert.equal(overBudget.status, 'infeasible');
  assert.equal(overBudget.infeasibility.code, 'BUDGET_TOO_LOW');
  assert.deepEqual(overBudget.plan, []);
});

test('planner treats hard minima and maxima as non-relaxable and returns no partial plan', () => {
  const feasible = generatePlan({ foods, mealTemplates, catalog, hardLimits: { sodiumMg: { min: 1, max: 500 } } });
  assert.equal(feasible.status, 'feasible');
  assert.ok(feasible.dailyTotals.sodiumMg >= 1 && feasible.dailyTotals.sodiumMg <= 500);

  const impossible = generatePlan({ foods, mealTemplates, catalog, hardLimits: { sodiumMg: { max: 0 } } });
  assert.equal(impossible.status, 'infeasible');
  assert.equal(impossible.infeasibility.code, 'HARD_LIMITS_UNSATISFIABLE');
  assert.deepEqual(impossible.plan, []);
  assert.equal(impossible.planFeasible, false);
});

test('soft targets can be met without warning and unmet targets remain warnings', () => {
  const allTargets = Object.fromEntries(nutrientKeys.map(key => [key, { min: 0 }]));
  const reached = generatePlan({ foods, mealTemplates, catalog, targets: allTargets });
  assert.equal(reached.status, 'feasible');
  assert.equal(reached.warnings.some(warning => warning.code === 'SOFT_TARGET_UNMET'), false);

  const unmet = generatePlan({ foods, mealTemplates, catalog, targets: { fiberG: { min: 5000, unit: 'g' } } });
  assert.equal(unmet.status, 'feasible');
  assert.ok(unmet.warnings.some(warning => warning.code === 'SOFT_TARGET_UNMET' && warning.nutrient === 'fiberG'));
  assert.ok(unmet.dailyTotals.fiberG < 5000);
});

test('planner scales template portions in grams and reports the exact daily sum', () => {
  const result = generatePlan({ foods, mealTemplates, catalog, targets: Object.fromEntries(nutrientKeys.map(key => [key, { min: 0 }])) });
  for (const meal of result.plan) {
    const template = mealTemplates.find(item => item.id === meal.id);
    for (const portion of meal.portions) {
      const base = template.items.find(item => item.foodId === portion.foodId).grams;
      assert.ok([0.75, 1, 1.25].includes(Math.round((portion.grams / base) * 100) / 100));
    }
  }
  for (const key of nutrientKeys) assert.equal(result.dailyTotals[key], Math.round(result.plan.reduce((sum, meal) => sum + meal.nutrients[key], 0) * 10) / 10);
});

test('planner returns unavailable rather than treating missing nutrients as zero', () => {
  const incompleteFoods = foods.map(food => food.id === 'rice-steamed'
    ? { ...food, per100g: { ...food.per100g, fiberG: undefined } }
    : food);
  const result = generatePlan({ foods: incompleteFoods, mealTemplates, catalog });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.unavailability.code, 'NUTRIENT_DATA_UNAVAILABLE');
  assert.deepEqual(result.plan, []);
});

test('planner returns unavailable when nutrition source provenance is absent', () => {
  const untraceableFoods = foods.map(food => food.id === 'rice-steamed'
    ? { ...food, provenance: { groups: {} } }
    : food);
  const result = generatePlan({ foods: untraceableFoods, mealTemplates, catalog });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.unavailability.code, 'NUTRIENT_PROVENANCE_UNAVAILABLE');
  assert.deepEqual(result.plan, []);
});

test('request validation rejects wrong types, unsupported units, incomplete ranges and non-finite values with stable issues', () => {
  const invalidRequests = [
    [{ budgetVnd: '1000' }, 'budgetVnd'],
    [{ budgetVnd: -1 }, 'budgetVnd'],
    [{ budgetVnd: Infinity }, 'budgetVnd'],
    [{ allergies: 'cá' }, 'allergies'],
    [{ excludedFoodIds: [3] }, 'excludedFoodIds[0]'],
    [{ preferences: 5 }, 'preferences'],
    [{ targets: { fiberG: {} } }, 'targets.fiberG'],
    [{ targets: { fiberG: { min: 1, unit: 'mg' } } }, 'targets.fiberG.unit'],
    [{ hardLimits: [] }, 'hardLimits'],
    [{ hardLimits: { sodiumMg: { max: NaN } } }, 'hardLimits.sodiumMg.max'],
    [{ extra: true }, 'extra']
  ];

  for (const [input, expectedPath] of invalidRequests) {
    assert.throws(() => validateMealPlanRequest(input), error => {
      assert.equal(error.code, 'INVALID_MEAL_PLAN_REQUEST');
      assert.equal(error.issues[0].path, expectedPath);
      assert.ok(error.issues[0].code);
      return true;
    });
  }
  assert.throws(() => validateMealPlanRequest(undefined), error => error.issues[0].path === '$');
  assert.equal(validateMealPlanRequest({}).budgetVnd, undefined, 'budget is optional because no sourced price exists yet');
});

test('meal planner unit tests use only synthetic source records', () => {
  assert.equal(catalog.status, 'prototype');
  assert.equal(catalog.version, 'synthetic-test-catalog-v1');
  assert.ok(foods.every(food => food.source.id === 'synthetic-fixture'));
});
