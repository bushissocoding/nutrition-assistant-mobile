const { calculateFood } = require('./nutrition');
const { createDateFormatter, localDateKey, normalizeConsumedAt } = require('./meal-entries');
const { parseFoodId } = require('./food-source');

const NUTRIENT_KEYS = ['energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fiberG', 'sodiumMg'];
const MEAL_TYPES = new Set(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']);
const ENTRY_FIELDS = new Set(['foodId', 'portion', 'mealType', 'consumedAt', 'timeZone', 'notes']);

class AccountMealEntryValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AccountMealEntryValidationError';
    this.code = 'VALIDATION_ERROR';
    this.status = 400;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAccountMealEntryInput(input) {
  if (!isRecord(input) || Object.keys(input).some(key => !ENTRY_FIELDS.has(key))) {
    throw new AccountMealEntryValidationError('Nội dung nhật ký không hợp lệ hoặc có trường không được hỗ trợ.');
  }
  if (['foodId', 'portion', 'mealType', 'consumedAt', 'timeZone'].some(key => !(key in input))) {
    throw new AccountMealEntryValidationError('Thiếu thông tin bắt buộc của bản ghi bữa ăn.');
  }
  if (!parseFoodId(input.foodId)) {
    throw new AccountMealEntryValidationError('foodId phải là mã thực phẩm có nguồn hợp lệ.');
  }
  if (!isRecord(input.portion) || Object.keys(input.portion).some(key => !['amount', 'unit'].includes(key))
    || !Number.isFinite(input.portion.amount) || input.portion.amount <= 0 || input.portion.amount > 5000 || input.portion.unit !== 'g') {
    throw new AccountMealEntryValidationError('portion cần amount lớn hơn 0 đến 5000 và unit là g.');
  }
  if (!MEAL_TYPES.has(input.mealType)) throw new AccountMealEntryValidationError('mealType không hợp lệ.');
  let formatter;
  try { formatter = createDateFormatter(input.timeZone); }
  catch (error) { throw new AccountMealEntryValidationError(error.message); }
  let consumedAt;
  try { consumedAt = normalizeConsumedAt(input.consumedAt); }
  catch (error) { throw new AccountMealEntryValidationError(error.message); }
  const requestedDate = input.consumedAt.slice(0, 10);
  if (localDateKey(formatter, consumedAt) !== requestedDate) {
    throw new AccountMealEntryValidationError('Ngày và múi giờ phải khớp với thời điểm bữa ăn.');
  }
  if (input.notes !== undefined && input.notes !== null && typeof input.notes !== 'string') {
    throw new AccountMealEntryValidationError('notes phải là chuỗi hoặc null.');
  }
  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  if (notes.length > 500) throw new AccountMealEntryValidationError('notes không được dài quá 500 ký tự.');
  const portionGrams = Number(input.portion.amount.toFixed(3));
  if (portionGrams <= 0) throw new AccountMealEntryValidationError('portion cần amount ít nhất 0,001 g.');
  return {
    foodId: input.foodId,
    portion: { amount: portionGrams, unit: 'g' },
    mealType: input.mealType,
    consumedAt,
    timeZone: input.timeZone,
    notes: notes || null,
  };
}

function entryFromFood(input, food, id, createdAt, previous = {}) {
  if (!food || food.id !== input.foodId || typeof food.catalogVersion !== 'string' || !food.catalogVersion.trim()
    || !food.nutrition?.values || typeof food.source?.id !== 'string' || !food.source.id.trim()
    || !food.source.recordId || !food.source.edition) {
    throw new AccountMealEntryValidationError('Không có bản ghi dinh dưỡng có nguồn khớp với foodId.');
  }
  return {
    id,
    foodId: food.id,
    foodName: food.name,
    portion: { ...input.portion },
    mealType: input.mealType,
    consumedAt: input.consumedAt,
    timeZone: input.timeZone,
    notes: input.notes,
    nutrients: calculateFood(food, input.portion.amount),
    source: structuredClone(food.source),
    catalogVersion: food.catalogVersion,
    foodSnapshot: structuredClone(food),
    createdAt: previous.createdAt || new Date(createdAt).toISOString(),
    updatedAt: new Date(createdAt).toISOString(),
  };
}

function createAccountMealEntry(input, food, id, now = new Date()) {
  return entryFromFood(input, food, id, now, {});
}

function updateAccountMealEntry(current, input, food, now = new Date()) {
  return entryFromFood(input, food, current.id, now, current);
}

function aggregateMealEntries(entries) {
  if (!entries.length) return { hasEntries: false, totals: null };
  const totals = Object.fromEntries(NUTRIENT_KEYS.map(key => [key, 0]));
  for (const entry of entries) {
    for (const key of NUTRIENT_KEYS) {
      const value = entry.nutrients?.[key];
      if (!Number.isFinite(value) || totals[key] === null) totals[key] = null;
      else totals[key] += value;
    }
  }
  for (const key of NUTRIENT_KEYS) if (Number.isFinite(totals[key])) totals[key] = Math.round((totals[key] + Number.EPSILON) * 10) / 10;
  return { hasEntries: true, totals };
}

function buildNutritionReport({ entries, dates, timeZone }) {
  const formatter = createDateFormatter(timeZone);
  const grouped = new Map(dates.map(date => [date, []]));
  for (const entry of entries) {
    const date = localDateKey(formatter, entry.consumedAt);
    grouped.get(date)?.push(entry);
  }
  const days = dates.map(date => ({ date, ...aggregateMealEntries(grouped.get(date)) }));
  const sourceMap = new Map();
  for (const entry of entries) {
    const source = entry.source;
    if (source?.id && source?.recordId) sourceMap.set(`${source.id}:${source.recordId}:${source.edition}`, {
      id: source.id,
      label: source.label,
      recordId: source.recordId,
      edition: source.edition,
      catalogVersion: entry.catalogVersion,
    });
  }
  return { reportVersion: 1, timeZone, days, sources: [...sourceMap.values()] };
}

module.exports = {
  AccountMealEntryValidationError,
  NUTRIENT_KEYS,
  aggregateMealEntries,
  buildNutritionReport,
  createAccountMealEntry,
  normalizeAccountMealEntryInput,
  updateAccountMealEntry,
};
