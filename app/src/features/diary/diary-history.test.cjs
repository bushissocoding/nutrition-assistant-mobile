'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { formatLocalDateKey, getRecentLocalDays, getLocalWeek, loadDiaryHistory } = require('./diary-history.cjs');

test('builds seven local dates across month and year boundaries in chronological order', () => {
  const days = getRecentLocalDays(new Date(2026, 0, 3, 23, 45), 7);

  assert.deepEqual(days.map(day => day.date), [
    '2025-12-28', '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03',
  ]);
  assert.equal(days.at(-1).current, true);
  assert.equal(days[0].dateObject.getHours(), 12);
});

test('builds a local Sunday to Saturday calendar week across a month boundary', () => {
  const week = getLocalWeek(new Date(2026, 2, 1, 1));

  assert.deepEqual(week.map(day => day.date), [
    '2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07',
  ]);
  assert.equal(formatLocalDateKey(new Date(2026, 2, 1, 0)), '2026-03-01');
});

test('steps through the daylight-saving transition without skipping a local date', () => {
  const previousTimeZone = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const days = getRecentLocalDays(new Date(2026, 2, 9, 12), 4);
    assert.deepEqual(days.map(day => day.date), ['2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09']);
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
});

test('loads each unique date with the supplied timezone and retains successful responses on partial failure', async () => {
  const totals = { energyKcal: 100, proteinG: 10, carbohydrateG: 20, fatG: 3, fiberG: 4, sodiumMg: 5 };
  const calls = [];
  const api = { getMealEntries: query => {
    calls.push(query);
    return query.date === '2026-06-01'
      ? Promise.reject(new Error('API đang ngoại tuyến.'))
      : Promise.resolve({ date: query.date, items: [{ id: 'entry-1' }], totals });
  } };

  const history = await loadDiaryHistory(api, ['2026-05-31', '2026-06-01', '2026-05-31'], 'Asia/Ho_Chi_Minh');

  assert.equal(calls.length, 2);
  assert.ok(calls.some(query => query.date === '2026-05-31' && query.timeZone === 'Asia/Ho_Chi_Minh'));
  assert.deepEqual(history.byDate['2026-05-31'].totals, totals);
  assert.equal(history.errorsByDate['2026-06-01'], 'API đang ngoại tuyến.');
});

test('treats malformed API totals as unavailable instead of zero intake', async () => {
  const history = await loadDiaryHistory({
    getMealEntries: async ({ date }) => ({ date, items: [], totals: { energyKcal: 0 } }),
  }, ['2026-06-01'], 'UTC');

  assert.equal(history.byDate['2026-06-01'], undefined);
  assert.match(history.errorsByDate['2026-06-01'], /không đúng định dạng/i);
});
