const { randomUUID } = require('node:crypto');

const CREATE_FIELDS = new Set(['items']);
const ITEM_FIELDS = new Set(['foodId', 'amount', 'unit']);
const PATCH_FIELDS = new Set(['amount', 'unit', 'purchased']);
const UNITS = new Set(['g', 'kg', 'ml', 'l', 'piece', 'bunch', 'pack']);
const MAX_AMOUNT = 1_000_000;

class ShoppingListValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ShoppingListValidationError';
    this.status = 400;
    this.code = 'VALIDATION_ERROR';
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertAmount(amount) {
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    throw new ShoppingListValidationError(`amount phải lớn hơn 0 và không vượt quá ${MAX_AMOUNT}.`);
  }
}

function assertUnit(unit) {
  if (!UNITS.has(unit)) throw new ShoppingListValidationError('unit không được hỗ trợ.');
}

function normalizeShoppingListInput(input, foods) {
  if (!isRecord(input) || Object.keys(input).some(key => !CREATE_FIELDS.has(key))) {
    throw new ShoppingListValidationError('Nội dung danh sách không hợp lệ hoặc có trường không được hỗ trợ.');
  }
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) {
    throw new ShoppingListValidationError('items phải gồm 1–100 nguyên liệu.');
  }

  const seenFoodIds = new Set();
  return input.items.map(item => {
    if (!isRecord(item) || Object.keys(item).some(key => !ITEM_FIELDS.has(key))) {
      throw new ShoppingListValidationError('Mục đi chợ có trường không được hỗ trợ.');
    }
    if (typeof item.foodId !== 'string' || !foods.some(food => food.id === item.foodId)) {
      throw new ShoppingListValidationError('foodId không tồn tại trong danh mục thực phẩm demo.');
    }
    if (seenFoodIds.has(item.foodId)) throw new ShoppingListValidationError('Danh sách không được lặp foodId.');
    assertAmount(item.amount);
    assertUnit(item.unit);
    seenFoodIds.add(item.foodId);
    return { foodId: item.foodId, amount: item.amount, unit: item.unit };
  });
}

function normalizeShoppingListItemPatch(patch) {
  if (!isRecord(patch) || Object.keys(patch).length === 0 || Object.keys(patch).some(key => !PATCH_FIELDS.has(key))) {
    throw new ShoppingListValidationError('Cần cung cấp field cập nhật được hỗ trợ.');
  }
  const normalized = {};
  if ('amount' in patch) {
    assertAmount(patch.amount);
    normalized.amount = patch.amount;
  }
  if ('unit' in patch) {
    assertUnit(patch.unit);
    normalized.unit = patch.unit;
  }
  if ('purchased' in patch) {
    if (typeof patch.purchased !== 'boolean') throw new ShoppingListValidationError('purchased phải là boolean.');
    normalized.purchased = patch.purchased;
  }
  return normalized;
}

function createShoppingList(normalizedItems, foods, listId = randomUUID(), itemIdFactory = randomUUID, now = new Date()) {
  const timestamp = new Date(now).toISOString();
  return {
    id: listId,
    source: 'meal-plan',
    items: normalizedItems.map(item => {
      const food = foods.find(candidate => candidate.id === item.foodId);
      if (!food) throw new ShoppingListValidationError('foodId không tồn tại trong danh mục thực phẩm demo.');
      return {
        id: itemIdFactory(),
        foodId: food.id,
        name: food.name,
        amount: item.amount,
        unit: item.unit,
        purchased: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    }),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function updateShoppingListItem(current, patch, now = new Date()) {
  return { ...current, ...patch, updatedAt: new Date(now).toISOString() };
}

module.exports = {
  MAX_AMOUNT,
  ShoppingListValidationError,
  UNITS,
  createShoppingList,
  normalizeShoppingListInput,
  normalizeShoppingListItemPatch,
  updateShoppingListItem,
};
