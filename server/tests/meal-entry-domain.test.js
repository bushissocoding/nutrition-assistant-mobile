const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCatalog } = require('../src/repositories/catalog');
const {
  MealEntryValidationError,
  createMealEntry,
  getLocalDateRange,
  normalizeMealEntryInput,
  sortAndPaginateEntries,
} = require('../src/services/meal-entries');

const { foods } = loadCatalog();
const validInput = {
  foodId: 'rice-steamed',
  portion: { amount: 120, unit: 'g' },
  mealType: 'LUNCH',
  consumedAt: '2026-11-16T12:15:00+07:00',
  timeZone: 'Asia/Ho_Chi_Minh',
  notes: '  Ăn trưa  ',
};

test('normalizes a complete entry and trims optional notes', () => {
  assert.deepEqual(normalizeMealEntryInput(validInput, foods), {
    foodId: 'rice-steamed',
    portion: { amount: 120, unit: 'g' },
    mealType: 'LUNCH',
    consumedAt: '2026-11-16T05:15:00.000Z',
    timeZone: 'Asia/Ho_Chi_Minh',
    notes: 'Ăn trưa',
  });
});

test('rejects missing, invalid, and unknown fields at the domain boundary', () => {
  assert.throws(() => normalizeMealEntryInput({ ...validInput, portion: undefined }, foods), MealEntryValidationError);
  assert.throws(() => normalizeMealEntryInput({ ...validInput, portion: { amount: 0, unit: 'g' } }, foods), MealEntryValidationError);
  assert.throws(() => normalizeMealEntryInput({ ...validInput, foodId: 'not-in-catalog' }, foods), MealEntryValidationError);
  assert.throws(() => normalizeMealEntryInput({ ...validInput, nutrients: {} }, foods), MealEntryValidationError);
});

test('normalizes a nonempty partial patch without inventing omitted fields', () => {
  assert.deepEqual(normalizeMealEntryInput({ notes: '  ghi chú mới  ' }, foods, { partial: true }), { notes: 'ghi chú mới' });
  assert.throws(() => normalizeMealEntryInput({}, foods, { partial: true }), MealEntryValidationError);
});

test('rejects timestamps without an explicit offset and malformed calendar dates', () => {
  assert.throws(() => normalizeMealEntryInput({ ...validInput, consumedAt: '2026-11-16T12:15:00' }, foods), MealEntryValidationError);
  assert.throws(() => getLocalDateRange('2026-02-30', 'Asia/Ho_Chi_Minh'), MealEntryValidationError);
  assert.throws(() => getLocalDateRange('2026-11-16', 'Not/A_Zone'), MealEntryValidationError);
});

test('normalizes ISO timestamps with optional seconds and fractional precision', () => {
  const inputWithoutSeconds = normalizeMealEntryInput({ ...validInput, consumedAt: '2026-11-16T12:15+07:00' }, foods);
  assert.equal(inputWithoutSeconds.consumedAt, '2026-11-16T05:15:00.000Z');
  const inputWithFractions = normalizeMealEntryInput({ ...validInput, consumedAt: '2026-11-16T12:15:00.123456+07:00' }, foods);
  assert.equal(inputWithFractions.consumedAt, '2026-11-16T05:15:00.123Z');
});

test('uses local midnight boundaries across 23-hour and 25-hour DST days', () => {
  const shortDay = getLocalDateRange('2026-03-08', 'America/New_York');
  assert.equal(shortDay.start.toISOString(), '2026-03-08T05:00:00.000Z');
  assert.equal(shortDay.end.toISOString(), '2026-03-09T04:00:00.000Z');
  assert.equal(shortDay.end - shortDay.start, 23 * 60 * 60 * 1000);

  const longDay = getLocalDateRange('2026-11-01', 'America/New_York');
  assert.equal(longDay.start.toISOString(), '2026-11-01T04:00:00.000Z');
  assert.equal(longDay.end.toISOString(), '2026-11-02T05:00:00.000Z');
  assert.equal(longDay.end - longDay.start, 25 * 60 * 60 * 1000);
});

test('uses four-digit years correctly for date boundaries', () => {
  const range = getLocalDateRange('0001-01-01', 'UTC');
  assert.equal(range.start.toISOString(), '0001-01-01T00:00:00.000Z');
  assert.equal(range.end.toISOString(), '0001-01-02T00:00:00.000Z');
});

test('calculates entry nutrients from the server catalog and sorts before pagination', () => {
  const normalized = normalizeMealEntryInput(validInput, foods);
  const entry = createMealEntry(normalized, foods, 'entry-1', new Date('2026-11-16T05:16:00.000Z'));
  assert.equal(entry.foodName, foods.find(food => food.id === 'rice-steamed').name);
  assert.equal(entry.nutrients.energyKcal, 156);

  const page = sortAndPaginateEntries([
    { id: 'b', consumedAt: '2026-11-16T06:00:00.000Z' },
    { id: 'c', consumedAt: '2026-11-16T05:00:00.000Z' },
    { id: 'a', consumedAt: '2026-11-16T05:00:00.000Z' },
  ], { limit: 2, offset: 1 });
  assert.deepEqual(page.items.map(item => item.id), ['c', 'b']);
  assert.deepEqual(page.pagination, { limit: 2, offset: 1, total: 3 });
});
