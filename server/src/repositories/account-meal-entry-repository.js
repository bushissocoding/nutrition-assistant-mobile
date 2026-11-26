const { fingerprint, validIdempotencyKey } = require('./meal-plan-repository');

const COLUMNS = 'id,user_id,request_key,intent_hash,food_id,food_name,portion_grams,meal_type,consumed_at,time_zone,notes,nutrients,source,food_snapshot,catalog_version,created_at,updated_at,deleted_at';
const MAX_RANGE_ROWS = 2000;

class AccountMealEntryRepositoryError extends Error {
  constructor(message, status = 503, code = 'MEAL_DIARY_UNAVAILABLE') {
    super(message);
    this.name = 'AccountMealEntryRepositoryError';
    this.status = status;
    this.code = code;
  }
}

function toMealEntryDto(row) {
  return row ? {
    id: row.id,
    foodId: row.food_id,
    foodName: row.food_name,
    portion: { amount: Number(row.portion_grams), unit: 'g' },
    mealType: row.meal_type,
    consumedAt: row.consumed_at,
    timeZone: row.time_zone,
    notes: row.notes,
    nutrients: row.nutrients,
    source: row.source,
    catalogVersion: row.catalog_version,
    foodSnapshot: row.food_snapshot,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } : null;
}

function entryValues(entry) {
  return {
    food_id: entry.foodId,
    food_name: entry.foodName,
    portion_grams: entry.portion.amount,
    meal_type: entry.mealType,
    consumed_at: entry.consumedAt,
    time_zone: entry.timeZone,
    notes: entry.notes,
    nutrients: entry.nutrients,
    source: entry.source,
    food_snapshot: entry.foodSnapshot,
    catalog_version: entry.catalogVersion,
  };
}

function rowFromEntry(userId, requestKey, intentHash, entry) {
  // The database generates the primary key. Authenticated clients intentionally
  // have no INSERT privilege on `id`.
  return { user_id: userId, request_key: requestKey, intent_hash: intentHash, ...entryValues(entry) };
}

function createAccountMealEntryRepository() {
  async function findByKey(db, userId, requestKey) {
    const { data, error } = await db.from('meal_entries').select(COLUMNS)
      .eq('user_id', userId).eq('request_key', requestKey).maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function verifyReplay(db, userId, requestKey, inputHash) {
    const existing = await findByKey(db, userId, requestKey);
    if (!existing) return null;
    if (existing.intent_hash !== inputHash) throw new AccountMealEntryRepositoryError('Idempotency-Key đã được dùng với nội dung khác.', 409, 'IDEMPOTENCY_CONFLICT');
    if (existing.deleted_at) throw new AccountMealEntryRepositoryError('Bản ghi của lần gửi trước đã bị xóa; hãy tạo ý định mới.', 410, 'IDEMPOTENT_RESULT_DELETED');
    return { item: toMealEntryDto(existing), replayed: true };
  }

  return {
    async replay({ db, userId, requestKey, input }) {
      if (!validIdempotencyKey(requestKey)) throw new AccountMealEntryRepositoryError('Cần Idempotency-Key dài 8–128 ký tự ASCII.', 400, 'INVALID_IDEMPOTENCY_KEY');
      return verifyReplay(db, userId, requestKey, fingerprint(input));
    },

    async create({ db, userId, requestKey, input, item }) {
      if (!validIdempotencyKey(requestKey)) throw new AccountMealEntryRepositoryError('Cần Idempotency-Key dài 8–128 ký tự ASCII.', 400, 'INVALID_IDEMPOTENCY_KEY');
      const intentHash = fingerprint(input);
      const replay = await verifyReplay(db, userId, requestKey, intentHash);
      if (replay) return replay;
      const { data, error } = await db.from('meal_entries').insert(rowFromEntry(userId, requestKey, intentHash, item)).select(COLUMNS).single();
      if (!error && data) return { item: toMealEntryDto(data), replayed: false };
      if (error?.code === '23505') {
        const concurrent = await verifyReplay(db, userId, requestKey, intentHash);
        if (concurrent) return concurrent;
      }
      throw error || new AccountMealEntryRepositoryError('Không thể lưu nhật ký lúc này.');
    },

    async listByRange({ db, userId, start, end, limit = 100, offset = 0 }) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000) {
        throw new AccountMealEntryRepositoryError('Phân trang nhật ký không hợp lệ.', 400, 'INVALID_PAGINATION');
      }
      const { data, error, count } = await db.from('meal_entries').select(COLUMNS, { count: 'exact' })
        .eq('user_id', userId).is('deleted_at', null)
        .gte('consumed_at', start.toISOString()).lt('consumed_at', end.toISOString())
        .order('consumed_at', { ascending: true }).order('id', { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      return { items: (data || []).map(toMealEntryDto), total: Number.isSafeInteger(count) ? count : null, limit, offset };
    },

    async listForReport({ db, userId, start, end, maximumRows = MAX_RANGE_ROWS }) {
      const { data, error, count } = await db.from('meal_entries').select(COLUMNS, { count: 'exact' })
        .eq('user_id', userId).is('deleted_at', null)
        .gte('consumed_at', start.toISOString()).lt('consumed_at', end.toISOString())
        .order('consumed_at', { ascending: true }).order('id', { ascending: true })
        .range(0, maximumRows);
      if (error) throw error;
      if (Number.isSafeInteger(count) && count > maximumRows) throw new AccountMealEntryRepositoryError('Khoảng báo cáo có quá nhiều bản ghi; hãy chọn ít ngày hơn.', 422, 'REPORT_RANGE_TOO_LARGE');
      return (data || []).map(toMealEntryDto);
    },

    async get({ db, userId, id }) {
      const { data, error } = await db.from('meal_entries').select(COLUMNS)
        .eq('id', id).eq('user_id', userId).is('deleted_at', null).maybeSingle();
      if (error) throw error;
      return toMealEntryDto(data);
    },

    async update({ db, userId, id, item }) {
      const { data, error } = await db.from('meal_entries').update(entryValues(item))
        .eq('id', id).eq('user_id', userId).is('deleted_at', null).select(COLUMNS).maybeSingle();
      if (error) throw error;
      return toMealEntryDto(data);
    },

    async delete({ db, userId, id, deletedAt = new Date().toISOString() }) {
      const { data, error } = await db.from('meal_entries').update({ deleted_at: deletedAt })
        .eq('id', id).eq('user_id', userId).is('deleted_at', null).select('id').maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
  };
}

module.exports = { COLUMNS, MAX_RANGE_ROWS, AccountMealEntryRepositoryError, createAccountMealEntryRepository, toMealEntryDto };
