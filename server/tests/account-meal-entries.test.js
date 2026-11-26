const test = require('node:test');
const assert = require('node:assert/strict');
const {
  aggregateMealEntries,
  buildNutritionReport,
  createAccountMealEntry,
  normalizeAccountMealEntryInput,
  updateAccountMealEntry,
} = require('../src/services/account-meal-entries');

const food = {
  id: 'fdc:12345',
  fdcId: '12345',
  name: 'Beans, cooked',
  basis: { amount: 100, unit: 'g' },
  nutrition: { values: {
    energyKcal: { value: 127, unit: 'kcal', status: 'reported' },
    proteinG: { value: 8.7, unit: 'g', status: 'reported' },
    carbohydrateG: { value: 22.8, unit: 'g', status: 'reported' },
    fatG: { value: 0.5, unit: 'g', status: 'reported' },
    fiberG: { value: null, unit: 'g', status: 'missing' },
    sodiumMg: { value: 2, unit: 'mg', status: 'reported' },
  } },
  source: { id: 'USDA-FDC', label: 'USDA FoodData Central', recordId: '12345', edition: '2025-04-01' },
  catalogVersion: 'USDA-FDC-live-v1',
};

const input = {
  foodId: food.id,
  portion: { amount: 150, unit: 'g' },
  mealType: 'LUNCH',
  consumedAt: '2026-11-24T12:15:00+07:00',
  timeZone: 'Asia/Saigon',
  notes: '  synthetic note  ',
};

test('account diary input validates and normalizes fields without accepting client snapshots', () => {
  const normalized = normalizeAccountMealEntryInput(input);
  assert.deepEqual(normalized, { ...input, consumedAt: '2026-11-24T05:15:00.000Z', notes: 'synthetic note' });
  assert.throws(() => normalizeAccountMealEntryInput({ ...input, nutrients: { energyKcal: 1 } }), error => error.code === 'VALIDATION_ERROR');
  assert.throws(() => normalizeAccountMealEntryInput({ ...input, portion: { amount: 1, unit: 'cup' } }), error => error.code === 'VALIDATION_ERROR');
  assert.throws(() => normalizeAccountMealEntryInput({ ...input, timeZone: 'Not/AZone' }), error => error.code === 'VALIDATION_ERROR');
  assert.throws(() => normalizeAccountMealEntryInput({ ...input, consumedAt: '2026-11-24T23:30:00-08:00' }), error => error.code === 'VALIDATION_ERROR');
});

test('account diary snapshots source attribution and computes portion nutrients on the server', () => {
  const item = createAccountMealEntry(normalizeAccountMealEntryInput(input), food, 'entry-1', new Date('2026-11-24T06:00:00Z'));
  assert.equal(item.foodName, 'Beans, cooked');
  assert.equal(item.foodId, 'fdc:12345');
  assert.equal(item.nutrients.energyKcal, 190.5);
  assert.equal(item.nutrients.fiberG, null);
  assert.equal(item.source.recordId, '12345');
  assert.equal(item.catalogVersion, 'USDA-FDC-live-v1');
  assert.equal(item.createdAt, '2026-11-24T06:00:00.000Z');
});

test('entry edits recalculate from the new server source record and ignore any supplied totals', () => {
  const original = createAccountMealEntry(normalizeAccountMealEntryInput(input), food, 'entry-1');
  const changed = { ...input, portion: { amount: 50, unit: 'g' }, notes: null };
  const updated = updateAccountMealEntry(original, normalizeAccountMealEntryInput(changed), { ...food, name: 'Beans, retested', catalogVersion: 'USDA-FDC-live-v2' }, new Date('2026-11-25T00:00:00Z'));
  assert.equal(updated.foodName, 'Beans, retested');
  assert.equal(updated.nutrients.energyKcal, 63.5);
  assert.equal(updated.catalogVersion, 'USDA-FDC-live-v2');
  assert.equal(updated.notes, null);
});

test('daily aggregates distinguish no entries from unknown nutrient totals', () => {
  assert.deepEqual(aggregateMealEntries([]), { hasEntries: false, totals: null });
  const item = createAccountMealEntry(normalizeAccountMealEntryInput(input), food, 'entry-1');
  const result = aggregateMealEntries([item]);
  assert.equal(result.hasEntries, true);
  assert.equal(result.totals.energyKcal, 190.5);
  assert.equal(result.totals.fiberG, null);
  const smallPortions = aggregateMealEntries(Array.from({ length: 3 }, () => ({ nutrients: { energyKcal: 0.06, proteinG: 0, carbohydrateG: 0, fatG: 0, fiberG: 0, sodiumMg: 0 } })));
  assert.equal(smallPortions.totals.energyKcal, 0.2, 'round after summing all unrounded entries');
});

test('nutrition report groups only requested local days and retains empty versus unknown states', () => {
  const first = createAccountMealEntry(normalizeAccountMealEntryInput(input), food, 'entry-1');
  const otherDay = createAccountMealEntry(normalizeAccountMealEntryInput({ ...input, consumedAt: '2026-11-23T20:00:00+07:00' }), food, 'entry-2');
  const report = buildNutritionReport({ entries: [first, otherDay], dates: ['2026-11-23', '2026-11-24'], timeZone: 'Asia/Saigon' });
  assert.equal(report.days[0].hasEntries, true);
  assert.equal(report.days[0].totals.fiberG, null);
  assert.equal(report.days[1].hasEntries, true);
  assert.equal(report.days[1].totals.energyKcal, 190.5);
  assert.deepEqual(report.sources.map(source => source.catalogVersion), ['USDA-FDC-live-v1']);
});
