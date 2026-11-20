const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCatalog } = require('../src/repositories/catalog');
const {
  ShoppingListValidationError,
  createShoppingList,
  normalizeShoppingListInput,
  normalizeShoppingListItemPatch,
  updateShoppingListItem,
} = require('../src/services/shopping-lists');

const { foods } = loadCatalog();
const validInput = { items: [
  { foodId: 'rice-steamed', amount: 300, unit: 'g' },
  { foodId: 'egg-boiled', amount: 2, unit: 'piece' },
] };

test('normalizes valid shopping list input in stable request order', () => {
  assert.deepEqual(normalizeShoppingListInput(validInput, foods), validInput.items);
});

test('rejects missing, unknown, duplicate, and out-of-catalog create items', () => {
  for (const input of [null, {}, { items: [] }, { items: [{ foodId: 'rice-steamed', amount: 1, unit: 'g' }, { foodId: 'rice-steamed', amount: 2, unit: 'g' }] }, { items: [{ foodId: 'unknown', amount: 1, unit: 'g' }] }]) {
    assert.throws(() => normalizeShoppingListInput(input, foods), ShoppingListValidationError);
  }
  assert.throws(() => normalizeShoppingListInput({ ...validInput, clientField: true }, foods), ShoppingListValidationError);
});

test('rejects invalid amount, unit, item fields, and list size', () => {
  for (const item of [
    { foodId: 'rice-steamed', amount: 0, unit: 'g' },
    { foodId: 'rice-steamed', amount: -1, unit: 'g' },
    { foodId: 'rice-steamed', amount: Infinity, unit: 'g' },
    { foodId: 'rice-steamed', amount: 1_000_001, unit: 'g' },
    { foodId: 'rice-steamed', amount: 1, unit: 'cup' },
    { foodId: 'rice-steamed', amount: 1, unit: 'g', purchased: true },
    { foodId: 'rice-steamed', amount: 1, unit: 'g', name: 'spoofed' },
  ]) assert.throws(() => normalizeShoppingListInput({ items: [item] }, foods), ShoppingListValidationError);
  assert.throws(() => normalizeShoppingListInput({ items: Array.from({ length: 101 }, (_, index) => ({ foodId: index ? 'egg-boiled' : 'rice-steamed', amount: index + 1, unit: 'g' })) }, foods), ShoppingListValidationError);
});

test('normalizes item patch fields and rejects empty or protected-field updates', () => {
  assert.deepEqual(normalizeShoppingListItemPatch({ amount: 1.5, unit: 'kg', purchased: true }), { amount: 1.5, unit: 'kg', purchased: true });
  for (const patch of [null, {}, { purchased: 'yes' }, { foodId: 'egg-boiled' }, { createdAt: '2026-01-01' }, { amount: 0 }, { unit: 'cup' }]) {
    assert.throws(() => normalizeShoppingListItemPatch(patch), ShoppingListValidationError);
  }
});

test('creates server-owned list and item IDs/names/timestamps and applies patches', () => {
  const normalized = normalizeShoppingListInput(validInput, foods);
  let itemNumber = 0;
  const created = createShoppingList(normalized, foods, 'list-1', () => `item-${++itemNumber}`, new Date('2026-11-16T05:16:00.000Z'));
  assert.equal(created.source, 'meal-plan');
  assert.equal(created.id, 'list-1');
  assert.equal(created.items[0].name, foods.find(food => food.id === 'rice-steamed').name);
  assert.equal(created.items[0].purchased, false);
  assert.equal(created.items[0].id, 'item-1');
  assert.equal(created.items[0].createdAt, '2026-11-16T05:16:00.000Z');

  const patch = normalizeShoppingListItemPatch({ amount: 400, purchased: true });
  const updated = updateShoppingListItem(created.items[0], patch, new Date('2026-11-16T06:00:00.000Z'));
  assert.equal(updated.amount, 400);
  assert.equal(updated.unit, 'g');
  assert.equal(updated.purchased, true);
  assert.equal(updated.updatedAt, '2026-11-16T06:00:00.000Z');
  assert.equal(created.items[0].amount, 300);
});
