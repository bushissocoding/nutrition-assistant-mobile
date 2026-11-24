const test = require('node:test');
const assert = require('node:assert/strict');
const {
  combineSavedPlanPortions,
  normalizeGroceryAmount,
  normalizePantryMutation,
  normalizePantryItemPatch,
  normalizeShoppingItemPatch,
} = require('../src/services/account-grocery');

test('grocery quantity accepts only bounded supported units', () => {
  assert.deepEqual(normalizeGroceryAmount({ amount: 1.25, unit: 'kg' }), { amount: 1.25, unit: 'kg' });
  for (const value of [{ amount: 0, unit: 'g' }, { amount: 1e7, unit: 'g' }, { amount: 1, unit: 'cup' }, { amount: '2', unit: 'g' }]) {
    assert.throws(() => normalizeGroceryAmount(value), error => error.code === 'VALIDATION_ERROR');
  }
});

test('plan ingredients combine repeated USDA food IDs from server snapshot only', () => {
  const result = combineSavedPlanPortions({
    status: 'feasible', plan: [
      { portions: [{ foodId: 'fdc:12345', food: 'Rice', grams: 100, provenance: { sourceId: 'USDA-FDC', sourceRecordId: '12345', edition: '2025-04-01', catalogVersion: 'USDA-FDC-live-v1' } }] },
      { portions: [{ foodId: 'fdc:12345', food: 'Rice', grams: 50, provenance: { sourceId: 'USDA-FDC', sourceRecordId: '12345', edition: '2025-04-01', catalogVersion: 'USDA-FDC-live-v1' } }] },
    ],
  });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], {
    foodId: 'fdc:12345', name: 'Rice', amount: 150, unit: 'g',
    source: { id: 'USDA-FDC', recordId: '12345', edition: '2025-04-01' },
    catalogVersion: 'USDA-FDC-live-v1',
  });
  assert.throws(() => combineSavedPlanPortions({ status: 'unavailable', plan: [] }), error => error.code === 'PLAN_NOT_FEASIBLE');
  assert.throws(() => combineSavedPlanPortions({ status: 'feasible', plan: [{ portions: [{ foodId: 'fake', food: 'x', grams: 2 }] }] }), error => error.code === 'PLAN_INVALID');
});

test('pantry create and update reject owner/source tampering and unsupported fields', () => {
  assert.deepEqual(normalizePantryMutation({ foodId: 'fdc:12345', amount: 300, unit: 'g' }), { foodId: 'fdc:12345', amount: 300, unit: 'g' });
  assert.throws(() => normalizePantryMutation({ foodId: 'fdc:12345', amount: 300, unit: 'g', userId: 'other' }), error => error.code === 'VALIDATION_ERROR');
  assert.throws(() => normalizePantryMutation({ name: 'Custom', amount: 1, unit: 'piece' }), error => error.code === 'VALIDATION_ERROR');
  assert.deepEqual(normalizePantryMutation({ customName: ' Rau   muống ', amount: 2, unit: 'bunch' }), { customName: 'Rau muống', amount: 2, unit: 'bunch' });
  assert.deepEqual(normalizeShoppingItemPatch({ amount: 2, unit: 'g', purchased: true }), { amount: 2, unit: 'g', purchased: true });
  assert.throws(() => normalizeShoppingItemPatch({ source: { id: 'fake' } }), error => error.code === 'VALIDATION_ERROR');
  assert.deepEqual(normalizePantryItemPatch({ amount: 4, unit: 'piece' }), { amount: 4, unit: 'piece' });
});
