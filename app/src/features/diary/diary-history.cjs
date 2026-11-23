'use strict';

const nutrientKeys = ['energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fiberG', 'sodiumMg'];

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatLocalDateKey(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new TypeError('A valid date is required.');
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getRecentLocalDays(referenceDate = new Date(), count = 7) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 31) {
    throw new RangeError('Day count must be an integer from 1 to 31.');
  }
  if (!(referenceDate instanceof Date) || !Number.isFinite(referenceDate.getTime())) {
    throw new TypeError('A valid reference date is required.');
  }

  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate(), 12);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (count - index - 1));
    const key = formatLocalDateKey(date);
    return {
      key,
      date: key,
      dateObject: date,
      label: new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(date).replace('.', ''),
      current: index === count - 1,
    };
  });
}

function getLocalWeek(referenceDate = new Date()) {
  if (!(referenceDate instanceof Date) || !Number.isFinite(referenceDate.getTime())) {
    throw new TypeError('A valid reference date is required.');
  }
  const firstDay = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate(), 12);
  firstDay.setDate(firstDay.getDate() - firstDay.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(firstDay);
    date.setDate(firstDay.getDate() + index);
    const key = formatLocalDateKey(date);
    return {
      key,
      date: key,
      dateObject: date,
      label: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date),
    };
  });
}

function validateDiaryResponse(result, date) {
  if (!result || result.date !== date || !Array.isArray(result.items)
    || !result.totals || typeof result.totals !== 'object'
    || !nutrientKeys.every(key => Number.isFinite(result.totals[key]))) {
    throw new Error('Dữ liệu nhật ký trả về không đúng định dạng.');
  }
  return { items: result.items, totals: result.totals };
}

async function loadDiaryHistory(api, dates, timeZone) {
  if (!api || typeof api.getMealEntries !== 'function' || !Array.isArray(dates) || typeof timeZone !== 'string' || !timeZone) {
    throw new TypeError('Diary history requires an API client, dates, and an IANA timezone.');
  }

  const uniqueDates = [...new Set(dates)];
  const results = await Promise.all(uniqueDates.map(async date => {
    try {
      const response = await api.getMealEntries({ date, timeZone });
      return { date, value: validateDiaryResponse(response, date) };
    } catch (error) {
      return { date, error: error?.message || 'Không tải được nhật ký ngày này.' };
    }
  }));

  return results.reduce((history, result) => {
    if (result.error) history.errorsByDate[result.date] = result.error;
    else history.byDate[result.date] = result.value;
    return history;
  }, { byDate: {}, errorsByDate: {} });
}

module.exports = { formatLocalDateKey, getRecentLocalDays, getLocalWeek, loadDiaryHistory };
