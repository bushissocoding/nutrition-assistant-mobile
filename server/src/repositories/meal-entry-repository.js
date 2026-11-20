const { createHash, randomUUID } = require('node:crypto');
const { createMealEntry, updateMealEntry } = require('../services/meal-entries');

class MealEntryRepositoryError extends Error {
  constructor(message, status = 503, code = 'DEMO_STORE_UNAVAILABLE') {
    super(message);
    this.name = 'MealEntryRepositoryError';
    this.status = status;
    this.code = code;
  }
}

function publicEntry(row) {
  const { kind: _kind, ...entry } = row;
  return entry;
}

function idempotencyFingerprint(input) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function assertIdempotencyKey(key) {
  if (typeof key !== 'string' || key.length < 8 || key.length > 128 || !/^[A-Za-z0-9_.:-]+$/.test(key)) {
    const error = new Error('Idempotency-Key phải có 8–128 ký tự ASCII chữ, số, _, -, ., hoặc :.');
    error.status = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
}

function isRepositoryError(error) {
  return error instanceof MealEntryRepositoryError || (Number.isInteger(error?.status) && typeof error?.code === 'string');
}

function unavailable(error) {
  if (isRepositoryError(error)) return error;
  return new MealEntryRepositoryError('Không thể lưu nhật ký demo lúc này. Hãy kiểm tra kết nối và thử lại.', 503, 'DEMO_STORE_UNAVAILABLE');
}

function createMealEntryRepository({ store, idFactory = randomUUID, clock = () => new Date() } = {}) {
  if (!store || typeof store.readCollection !== 'function' || typeof store.updateCollection !== 'function') {
    throw new TypeError('Meal entry repository requires a demo collection store.');
  }

  async function create(namespace, input, foods, key) {
    assertIdempotencyKey(key);
    const fingerprint = idempotencyFingerprint(input);
    let result;
    try {
      await store.updateCollection(namespace, 'meal_entries', rows => {
        const ledger = rows.find(row => row.kind === 'idempotency' && row.key === key);
        if (ledger) {
          if (ledger.fingerprint !== fingerprint) {
            throw new MealEntryRepositoryError('Idempotency-Key đã được dùng với nội dung khác.', 409, 'IDEMPOTENCY_CONFLICT');
          }
          const existing = rows.find(row => row.kind === 'entry' && row.id === ledger.resourceId);
          if (!existing) {
            throw new MealEntryRepositoryError('Bản ghi của lần gửi trước đã bị xóa; hãy tạo ý định mới.', 410, 'IDEMPOTENT_RESULT_DELETED');
          }
          result = { item: publicEntry(existing), replayed: true };
          return rows;
        }

        const item = createMealEntry(input, foods, idFactory(), clock());
        const ledgerRow = {
          kind: 'idempotency',
          key,
          fingerprint,
          resourceId: item.id,
          createdAt: new Date(clock()).toISOString(),
        };
        result = { item, replayed: false };
        return [...rows, { kind: 'entry', ...item }, ledgerRow];
      });
      return result;
    } catch (error) {
      throw unavailable(error);
    }
  }

  async function listByRange(namespace, start, end) {
    try {
      const rows = await store.readCollection(namespace, 'meal_entries');
      return rows.filter(row => row.kind === 'entry'
        && Date.parse(row.consumedAt) >= start.getTime()
        && Date.parse(row.consumedAt) < end.getTime())
        .map(publicEntry);
    } catch (error) {
      throw unavailable(error);
    }
  }

  async function get(namespace, id) {
    try {
      const rows = await store.readCollection(namespace, 'meal_entries');
      const row = rows.find(item => item.kind === 'entry' && item.id === id);
      return row ? publicEntry(row) : null;
    } catch (error) {
      throw unavailable(error);
    }
  }

  async function update(namespace, id, patch, foods) {
    let result = null;
    try {
      await store.updateCollection(namespace, 'meal_entries', rows => {
        const index = rows.findIndex(row => row.kind === 'entry' && row.id === id);
        if (index < 0) return rows;
        const updated = updateMealEntry(publicEntry(rows[index]), patch, foods, clock());
        result = updated;
        const next = [...rows];
        next[index] = { kind: 'entry', ...updated };
        return next;
      });
      return result;
    } catch (error) {
      throw unavailable(error);
    }
  }

  async function remove(namespace, id) {
    let removed = false;
    try {
      await store.updateCollection(namespace, 'meal_entries', rows => {
        const next = rows.filter(row => {
          const keep = row.kind !== 'entry' || row.id !== id;
          if (!keep) removed = true;
          return keep;
        });
        return next;
      });
      return removed;
    } catch (error) {
      throw unavailable(error);
    }
  }

  async function purge(namespace) {
    try {
      await store.updateCollection(namespace, 'meal_entries', () => []);
    } catch (error) {
      throw unavailable(error);
    }
  }

  return { create, listByRange, get, update, delete: remove, purge };
}

module.exports = { createMealEntryRepository, MealEntryRepositoryError };
