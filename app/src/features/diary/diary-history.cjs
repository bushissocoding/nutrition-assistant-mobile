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
  if (!result || result.date !== date || typeof result.hasEntries !== 'boolean') {
    throw new Error('Dữ liệu báo cáo dinh dưỡng trả về không đúng định dạng.');
  }
  if (!result.hasEntries) {
    if (result.totals !== null) throw new Error('Ngày chưa có món phải giữ tổng dinh dưỡng là null.');
    return { hasEntries: false, totals: null };
  }
  if (!result.totals || typeof result.totals !== 'object'
    || !nutrientKeys.every(key => result.totals[key] === null || Number.isFinite(result.totals[key]))) {
    throw new Error('Dữ liệu tổng dinh dưỡng trả về không đúng định dạng.');
  }
  return { hasEntries: true, totals: result.totals };
}

async function loadDiaryHistory(api, dates, timeZone) {
  if (!api || typeof api.getMyNutritionReport !== 'function' || !Array.isArray(dates) || typeof timeZone !== 'string' || !timeZone) {
    throw new TypeError('Diary history requires an API client, dates, and an IANA timezone.');
  }
  const uniqueDates = [...new Set(dates)];
  if (!uniqueDates.length) return { byDate: {}, errorsByDate: {} };
  try {
    const response = await api.getMyNutritionReport({ date: uniqueDates.at(-1), timeZone, days: uniqueDates.length });
    if (!response || !Array.isArray(response.days) || response.days.length !== uniqueDates.length) {
      throw new Error('Dữ liệu báo cáo dinh dưỡng trả về không đúng định dạng.');
    }
    const byDate = {};
    response.days.forEach((day, index) => {
      if (day?.date !== uniqueDates[index]) throw new Error('Dữ liệu báo cáo dinh dưỡng trả về không đúng ngày.');
      byDate[day.date] = validateDiaryResponse(day, day.date);
    });
    return { byDate, errorsByDate: {} };
  } catch (error) {
    const errorsByDate = Object.fromEntries(uniqueDates.map(date => [date, error?.message || 'Không tải được báo cáo ngày này.']));
    return { byDate: {}, errorsByDate };
  }
}

module.exports = { formatLocalDateKey, getRecentLocalDays, getLocalWeek, loadDiaryHistory };
