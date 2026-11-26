const { calculateFood } = require('./nutrition');

const ENTRY_FIELDS = new Set(['foodId', 'portion', 'mealType', 'consumedAt', 'timeZone', 'notes']);
const MEAL_TYPES = new Set(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']);
const DAY_MS = 24 * 60 * 60 * 1000;

class MealEntryValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MealEntryValidationError';
    this.code = 'VALIDATION_ERROR';
    this.status = 400;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new MealEntryValidationError('date phải có định dạng YYYY-MM-DD.');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new MealEntryValidationError('Ngày lịch không hợp lệ.');
  }
  return value;
}

function utcDateForKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function createDateFormatter(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone.trim()) {
    throw new MealEntryValidationError('timeZone phải là tên múi giờ IANA.');
  }
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      era: 'short',
    });
  } catch {
    throw new MealEntryValidationError('timeZone không được hỗ trợ.');
  }
}

function localDateKey(formatter, instant) {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
  const year = Number(parts.era === 'BC' ? 1 - Number(parts.year) : parts.year);
  return `${String(year).padStart(4, '0')}-${parts.month}-${parts.day}`;
}

function firstInstantOnOrAfterDate(dateKey, formatter) {
  const approximateMidnight = utcDateForKey(dateKey).getTime();
  let low = approximateMidnight - 2 * DAY_MS;
  let high = approximateMidnight + 2 * DAY_MS;

  if (localDateKey(formatter, low) >= dateKey || localDateKey(formatter, high) < dateKey) {
    throw new MealEntryValidationError('Không thể xác định ranh giới ngày cho múi giờ này.');
  }

  while (high - low > 1) {
    const middle = low + Math.floor((high - low) / 2);
    if (localDateKey(formatter, middle) >= dateKey) high = middle;
    else low = middle;
  }

  if (localDateKey(formatter, high) !== dateKey) {
    throw new MealEntryValidationError('Ngày này không tồn tại trong múi giờ đã chọn.');
  }
  return new Date(high);
}

function getLocalDateRange(date, timeZone) {
  const dateKey = assertDateKey(date);
  const formatter = createDateFormatter(timeZone);
  const nextDate = utcDateForKey(dateKey);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const nextDateKey = nextDate.toISOString().slice(0, 10);
  return {
    start: firstInstantOnOrAfterDate(dateKey, formatter),
    end: firstInstantOnOrAfterDate(nextDateKey, formatter),
  };
}

function normalizeConsumedAt(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new MealEntryValidationError('consumedAt phải là thời điểm ISO-8601 kèm Z hoặc offset.');
  }
  assertDateKey(value.slice(0, 10));
  const [, hour, minute, second = '0'] = value.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) {
    throw new MealEntryValidationError('consumedAt không hợp lệ.');
  }
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) throw new MealEntryValidationError('consumedAt không hợp lệ.');
  return instant.toISOString();
}

function normalizeMealEntryInput(input, foods, { partial = false } = {}) {
  if (!isRecord(input)) throw new MealEntryValidationError('Nội dung bản ghi phải là một object.');
  const keys = Object.keys(input);
  if (keys.some(key => !ENTRY_FIELDS.has(key))) throw new MealEntryValidationError('Bản ghi có trường không được hỗ trợ.');
  if (partial && keys.length === 0) throw new MealEntryValidationError('Cần ít nhất một trường để cập nhật.');
  if (!partial && ['foodId', 'portion', 'mealType', 'consumedAt', 'timeZone'].some(key => !(key in input))) {
    throw new MealEntryValidationError('Thiếu thông tin bắt buộc của bản ghi bữa ăn.');
  }

  const normalized = {};
  if ('foodId' in input) {
    if (typeof input.foodId !== 'string' || !foods.some(food => food.id === input.foodId)) {
      throw new MealEntryValidationError('foodId không tồn tại trong danh mục thực phẩm demo.');
    }
    normalized.foodId = input.foodId;
  }
  if ('portion' in input) {
    const portion = input.portion;
    if (!isRecord(portion) || Object.keys(portion).some(key => !['amount', 'unit'].includes(key))
      || !Number.isFinite(portion.amount) || portion.amount <= 0 || portion.amount > 5000 || portion.unit !== 'g') {
      throw new MealEntryValidationError('portion cần amount lớn hơn 0 đến 5000 và unit là g.');
    }
    normalized.portion = { amount: portion.amount, unit: 'g' };
  }
  if ('mealType' in input) {
    if (!MEAL_TYPES.has(input.mealType)) throw new MealEntryValidationError('mealType không hợp lệ.');
    normalized.mealType = input.mealType;
  }
  if ('consumedAt' in input) normalized.consumedAt = normalizeConsumedAt(input.consumedAt);
  if ('timeZone' in input) {
    createDateFormatter(input.timeZone);
    normalized.timeZone = input.timeZone;
  }
  if ('notes' in input) {
    if (input.notes !== null && typeof input.notes !== 'string') throw new MealEntryValidationError('notes phải là chuỗi hoặc null.');
    const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
    if (notes.length > 500) throw new MealEntryValidationError('notes không được dài quá 500 ký tự.');
    normalized.notes = notes || null;
  } else if (!partial) normalized.notes = null;

  return normalized;
}

function createMealEntry(normalized, foods, id, now = new Date()) {
  const food = foods.find(item => item.id === normalized.foodId);
  if (!food) throw new MealEntryValidationError('foodId không tồn tại trong danh mục thực phẩm demo.');
  const timestamp = new Date(now).toISOString();
  return {
    id,
    ...normalized,
    foodName: food.name,
    nutrients: calculateFood(food, normalized.portion.amount),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function updateMealEntry(current, patch, foods, now = new Date()) {
  const normalized = { ...current, ...patch };
  const food = foods.find(item => item.id === normalized.foodId);
  if (!food) throw new MealEntryValidationError('foodId không tồn tại trong danh mục thực phẩm demo.');
  return {
    ...normalized,
    foodName: food.name,
    nutrients: calculateFood(food, normalized.portion.amount),
    updatedAt: new Date(now).toISOString(),
  };
}

function sortAndPaginateEntries(entries, { limit = 50, offset = 0 } = {}) {
  const sorted = [...entries].sort((left, right) => left.consumedAt.localeCompare(right.consumedAt) || left.id.localeCompare(right.id));
  return {
    items: sorted.slice(offset, offset + limit),
    pagination: { limit, offset, total: sorted.length },
  };
}

module.exports = {
  MealEntryValidationError,
  createDateFormatter,
  createMealEntry,
  getLocalDateRange,
  localDateKey,
  normalizeConsumedAt,
  normalizeMealEntryInput,
  sortAndPaginateEntries,
  updateMealEntry,
};
