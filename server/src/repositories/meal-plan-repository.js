const { createHash } = require('node:crypto');

const COLUMNS = 'id,user_id,request_key,intent_hash,plan,profile_updated_at,catalog_version,created_at';

class MealPlanRepositoryError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

function validIdempotencyKey(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128 && /^[A-Za-z0-9_.:-]+$/.test(value);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

function fingerprint(intent) {
  return createHash('sha256').update(JSON.stringify(stableValue(intent))).digest('hex');
}

function matchesIntent(existing, { input, profileUpdatedAt, catalogVersion }) {
  const base = { input, profileUpdatedAt: profileUpdatedAt || null };
  return existing.intent_hash === fingerprint({ ...base, catalogVersion })
    || existing.intent_hash === fingerprint({ ...base, catalogVersion: existing.catalog_version });
}

function toMealPlanDto(row) {
  return row ? {
    id: row.id,
    plan: row.plan,
    profileUpdatedAt: row.profile_updated_at,
    catalogVersion: row.catalog_version,
    createdAt: row.created_at,
  } : null;
}

function createMealPlanRepository() {
  async function find(db, userId, requestKey) {
    const { data, error } = await db.from('meal_plans').select(COLUMNS)
      .eq('user_id', userId).eq('request_key', requestKey).maybeSingle();
    if (error) throw error;
    return data || null;
  }

  return {
    async replay({ db, userId, requestKey, input, profileUpdatedAt, catalogVersion }) {
      if (!validIdempotencyKey(requestKey)) throw new MealPlanRepositoryError('Idempotency-Key phải có 8–128 ký tự ASCII chữ, số, _, -, ., hoặc :.', 400, 'INVALID_IDEMPOTENCY_KEY');
      const existing = await find(db, userId, requestKey);
      if (!existing) return null;
      if (!matchesIntent(existing, { input, profileUpdatedAt, catalogVersion })) throw new MealPlanRepositoryError('Idempotency-Key đã được dùng với nội dung khác.', 409, 'IDEMPOTENCY_CONFLICT');
      return { record: toMealPlanDto(existing), replayed: true };
    },

    async create({ db, userId, requestKey, input, plan, profileUpdatedAt, catalogVersion }) {
      if (!validIdempotencyKey(requestKey)) throw new MealPlanRepositoryError('Idempotency-Key phải có 8–128 ký tự ASCII chữ, số, _, -, ., hoặc :.', 400, 'INVALID_IDEMPOTENCY_KEY');
      const intentHash = fingerprint({ input, profileUpdatedAt: profileUpdatedAt || null, catalogVersion });
      const existing = await find(db, userId, requestKey);
      if (existing) {
        if (!matchesIntent(existing, { input, profileUpdatedAt, catalogVersion })) throw new MealPlanRepositoryError('Idempotency-Key đã được dùng với nội dung khác.', 409, 'IDEMPOTENCY_CONFLICT');
        return { record: toMealPlanDto(existing), replayed: true };
      }

      const { data, error } = await db.from('meal_plans').insert({
        user_id: userId,
        request_key: requestKey,
        intent_hash: intentHash,
        plan,
        profile_updated_at: profileUpdatedAt || null,
        catalog_version: catalogVersion,
      }).select(COLUMNS).single();
      if (!error && data) return { record: toMealPlanDto(data), replayed: false };
      if (error?.code === '23505') {
        const concurrent = await find(db, userId, requestKey);
        if (concurrent && matchesIntent(concurrent, { input, profileUpdatedAt, catalogVersion })) return { record: toMealPlanDto(concurrent), replayed: true };
        if (concurrent) throw new MealPlanRepositoryError('Idempotency-Key đã được dùng với nội dung khác.', 409, 'IDEMPOTENCY_CONFLICT');
      }
      throw error || new MealPlanRepositoryError('Không thể lưu kế hoạch.', 503, 'MEAL_PLAN_UNAVAILABLE');
    },

    async list({ db, userId, limit = 20, offset = 0 }) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000) {
        throw new MealPlanRepositoryError('Phân trang kế hoạch không hợp lệ.', 400, 'INVALID_PAGINATION');
      }
      const { data, error, count } = await db.from('meal_plans').select(COLUMNS, { count: 'exact' })
        .eq('user_id', userId).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw error;
      return { items: (data || []).map(toMealPlanDto), limit, offset, total: Number.isSafeInteger(count) ? count : null };
    },
  };
}

module.exports = { COLUMNS, MealPlanRepositoryError, createMealPlanRepository, fingerprint, matchesIntent, toMealPlanDto, validIdempotencyKey };
