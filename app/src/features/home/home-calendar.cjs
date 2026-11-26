function parseMonth(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year, month } : null;
}

function parseDateKey(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (month < 1 || month > 12 || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function localDateKey(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [year, month] = key.split('-').map(Number);
  const name = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
  return `${name}-${year}`;
}

function getAccountMonthOptions(createdAt, today = new Date()) {
  const current = { year: today.getFullYear(), month: today.getMonth() + 1 };
  let start = parseMonth(createdAt) || current;
  if (start.year > current.year || (start.year === current.year && start.month > current.month)) start = current;

  const options = [];
  for (let year = start.year, month = start.month; year < current.year || (year === current.year && month <= current.month);) {
    const value = monthKey(year, month);
    options.push({ value, label: monthLabel(value) });
    if (month === 12) { year += 1; month = 1; }
    else month += 1;
  }
  return options;
}

function getMonthDateOptions(key, createdAt, today = new Date()) {
  const selectedMonth = parseMonth(key);
  if (!selectedMonth) return [];
  const todayKey = localDateKey(today);
  const todayMonth = parseMonth(todayKey);
  if (selectedMonth.year > todayMonth.year || (selectedMonth.year === todayMonth.year && selectedMonth.month > todayMonth.month)) return [];

  const firstOfMonth = `${key}-01`;
  const lastDay = new Date(selectedMonth.year, selectedMonth.month, 0).getDate();
  const lastOfMonth = `${key}-${String(lastDay).padStart(2, '0')}`;
  const accountDate = parseDateKey(createdAt);
  const accountMonth = accountDate ? parseMonth(accountDate) : null;
  const start = accountMonth?.year === selectedMonth.year && accountMonth.month === selectedMonth.month && accountDate > firstOfMonth
    ? accountDate
    : firstOfMonth;
  const end = selectedMonth.year === todayMonth.year && selectedMonth.month === todayMonth.month && todayKey < lastOfMonth
    ? todayKey
    : lastOfMonth;
  if (start > end) return [];

  const dates = [];
  const startParts = start.split('-').map(Number);
  const endParts = end.split('-').map(Number);
  const cursor = new Date(startParts[0], startParts[1] - 1, startParts[2]);
  const endDate = new Date(endParts[0], endParts[1] - 1, endParts[2]);
  while (cursor <= endDate) {
    dates.push(localDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function getDateInMonth(key, referenceDate, createdAt, today = new Date()) {
  const dates = getMonthDateOptions(key, createdAt, today);
  if (!dates.length) return null;
  const referenceParts = (parseDateKey(referenceDate) || localDateKey(today)).split('-').map(Number);
  const [year, month] = key.split('-').map(Number);
  const day = Math.min(referenceParts[2], new Date(year, month, 0).getDate());
  const candidate = `${key}-${String(day).padStart(2, '0')}`;
  if (candidate < dates[0]) return dates[0];
  const lastDate = dates[dates.length - 1];
  if (candidate > lastDate) return lastDate;
  return candidate;
}

module.exports = { getAccountMonthOptions, getDateInMonth, getMonthDateOptions, monthLabel };
