const test = require('node:test');
const assert = require('node:assert/strict');
const { getAccountMonthOptions, getDateInMonth, getMonthDateOptions } = require('./home-calendar.cjs');

test('lists account months through the current month with the year in every label', () => {
  const options = getAccountMonthOptions('2024-03-18T08:30:00.000Z', new Date(2026, 10, 25));

  assert.equal(options[0].value, '2024-03');
  assert.equal(options[0].label, 'Mar-2024');
  assert.equal(options.at(-1).value, '2026-11');
  assert.equal(options.at(-1).label, 'Nov-2026');
  assert.equal(options.length, 33);
});

test('limits selectable dates to account creation and today at the month boundaries', () => {
  assert.deepEqual(getMonthDateOptions('2024-03', '2024-03-18T08:30:00.000Z', new Date(2026, 10, 25)).slice(0, 2), ['2024-03-18', '2024-03-19']);
  const currentDates = getMonthDateOptions('2026-11', '2024-03-18T08:30:00.000Z', new Date(2026, 10, 25));
  assert.equal(currentDates.at(-1), '2026-11-25');
});

test('keeps the selected day when possible and clamps to account and current-date bounds', () => {
  const today = new Date(2026, 10, 25);
  assert.equal(getDateInMonth('2024-03', '2026-11-01', '2024-03-18', today), '2024-03-18');
  assert.equal(getDateInMonth('2025-02', '2026-10-31', '2024-03-18', today), '2025-02-28');
  assert.equal(getDateInMonth('2026-11', '2024-03-01', '2024-03-18', today), '2026-11-01');
});
