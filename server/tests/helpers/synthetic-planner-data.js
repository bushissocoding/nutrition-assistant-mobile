const NUTRIENTS = ['energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fiberG', 'sodiumMg'];
const UNITS = { energyKcal: 'kcal', proteinG: 'g', carbohydrateG: 'g', fatG: 'g', fiberG: 'g', sodiumMg: 'mg' };
const SOURCE = { id: 'synthetic-fixture', name: 'Synthetic test fixture', kind: 'synthetic-fixture', url: null };
const TEMPLATE_SOURCE = { id: 'project-curated-meal-templates', name: 'Synthetic project test templates', kind: 'internal', url: null };

function makeFood(id, index, allergens = []) {
  const values = Object.fromEntries(NUTRIENTS.map((key, nutrientIndex) => [key, 10 + index * 5 + nutrientIndex]));
  values.energyKcal = 100 + index * 11;
  values.sodiumMg = 10 + index * 3;
  const nutritionValues = Object.fromEntries(NUTRIENTS.map(key => [key, {
    value: values[key],
    unit: UNITS[key],
    status: 'reported',
  }]));
  return {
    id,
    version: 'synthetic-food-v1-' + index,
    name: 'Synthetic test food ' + (index + 1),
    aliases: [],
    category: 'test-category-' + (index + 1),
    allergens,
    tags: ['synthetic-test'],
    preparation: { state: 'cooked', maturity: 'not-applicable', description: 'Synthetic test fixture only.' },
    serving: { amount: 100, unit: 'g', household: 'synthetic test amount', conversions: [] },
    nutrition: { basis: { amount: 100, unit: 'g', ediblePortion: true }, values: nutritionValues },
    per100g: values,
    source: { ...SOURCE, recordId: 'synthetic-record-' + (index + 1), edition: 'synthetic-test-v1' },
    provenance: { groups: {
      nutrition: { sourceId: SOURCE.id, sourceRecordId: 'synthetic-record-' + (index + 1), edition: 'synthetic-test-v1', method: 'Synthetic test-only nutrient values.' },
      serving: { sourceId: SOURCE.id, sourceRecordId: 'synthetic-record-' + (index + 1), edition: 'synthetic-test-v1', method: 'Synthetic test-only serving.' },
    } },
    review: { status: 'fixture-only' },
  };
}

function makeTemplate(id, slot, itemIds) {
  return {
    id,
    version: 'synthetic-template-v1',
    name: 'Synthetic ' + slot + ' test',
    slot,
    tags: ['synthetic-test'],
    instructions: ['Synthetic test instructions.'],
    provenance: { sourceId: TEMPLATE_SOURCE.id, sourceRecordId: id, edition: 'synthetic-template-v1', method: 'Synthetic test-only meal template.' },
    price: { amountVnd: null, unit: 'VND', basis: 'template-1x', status: 'missing', reason: 'Synthetic fixture has no real price.' },
    items: itemIds.map(([foodId, grams]) => ({ foodId, grams })),
  };
}

function createSyntheticPlannerFixture() {
  const foods = [
    makeFood('rice-steamed', 0),
    makeFood('egg-boiled', 1, ['trứng']),
    makeFood('tofu-firm', 2, ['đậu nành']),
    makeFood('pumpkin', 3),
    makeFood('cabbage', 4),
    makeFood('chicken-breast', 5),
    makeFood('tilapia', 6, ['cá']),
  ];
  const mealTemplates = [
    makeTemplate('test-breakfast', 'Bữa sáng', [['rice-steamed', 150], ['egg-boiled', 50]]),
    makeTemplate('test-lunch', 'Bữa trưa', [['rice-steamed', 150], ['tofu-firm', 100], ['pumpkin', 100]]),
    makeTemplate('test-dinner-fish', 'Bữa tối', [['rice-steamed', 150], ['tilapia', 100], ['cabbage', 100]]),
  ];
  const catalog = {
    version: 'synthetic-test-catalog-v1',
    status: 'prototype',
    sources: [
      SOURCE,
      TEMPLATE_SOURCE,
      {
        id: 'synthetic-fixture-price',
        name: 'Synthetic test price fixture',
        kind: 'synthetic-fixture',
        rights: { redistributionStatus: 'permitted-for-tests' },
      },
    ],
    nutrientUnits: UNITS,
  };
  return { foods, mealTemplates, catalog };
}

module.exports = { createSyntheticPlannerFixture };
