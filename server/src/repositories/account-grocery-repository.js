const { validIdempotencyKey } = require('./meal-plan-repository');

const LIST_COLUMNS = 'id,user_id,source_plan_id,request_key,is_current,created_at,updated_at';
const ITEM_COLUMNS = 'id,list_id,food_id,name,amount,unit,purchased,source,catalog_version,created_at,updated_at';
const PANTRY_COLUMNS = 'id,user_id,food_id,name,amount,unit,source,catalog_version,created_at,updated_at';

class AccountGroceryRepositoryError extends Error {
  constructor(message, status = 503, code = 'GROCERY_UNAVAILABLE') {
    super(message);
    this.name = 'AccountGroceryRepositoryError';
    this.status = status;
    this.code = code;
  }
}

function toShoppingItem(row) {
  return row ? {
    id: row.id,
    foodId: row.food_id,
    name: row.name,
    amount: Number(row.amount),
    unit: row.unit,
    purchased: row.purchased,
    source: row.source,
    catalogVersion: row.catalog_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } : null;
}

function toPantryItem(row) {
  return row ? {
    id: row.id,
    foodId: row.food_id,
    name: row.name,
    amount: Number(row.amount),
    unit: row.unit,
    source: row.source,
    catalogVersion: row.catalog_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } : null;
}

function mapRpcError(error) {
  if (error?.code === 'P0002') return new AccountGroceryRepositoryError('Không tìm thấy thực đơn đã lưu của tài khoản.', 404, 'SAVED_PLAN_NOT_FOUND');
  if (error?.code === '22023') return new AccountGroceryRepositoryError('Snapshot thực đơn không hợp lệ để tạo danh sách.', 422, 'SAVED_PLAN_INVALID');
  if (error?.code === '23505') return new AccountGroceryRepositoryError('Idempotency-Key đã được dùng với thực đơn khác.', 409, 'IDEMPOTENCY_CONFLICT');
  if (error?.code === '28000') return new AccountGroceryRepositoryError('Cần đăng nhập để tiếp tục.', 401, 'AUTHENTICATION_REQUIRED');
  return error;
}

function createAccountGroceryRepository() {
  async function findList(db, userId, filter) {
    let query = db.from('shopping_lists').select(LIST_COLUMNS).eq('user_id', userId);
    for (const [key, value] of Object.entries(filter)) query = query.eq(key, value);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function loadList(db, row) {
    if (!row) return null;
    const { data, error } = await db.from('shopping_list_items').select(ITEM_COLUMNS)
      .eq('list_id', row.id).order('created_at', { ascending: true }).order('id', { ascending: true });
    if (error) throw error;
    return {
      id: row.id,
      sourcePlanId: row.source_plan_id,
      isCurrent: row.is_current,
      items: (data || []).map(toShoppingItem),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async function getCurrent(db, userId) {
    return loadList(db, await findList(db, userId, { is_current: true }));
  }

  async function existingRequest(db, userId, requestKey, savedPlanId) {
    const row = await findList(db, userId, { request_key: requestKey });
    if (!row) return null;
    if (row.source_plan_id !== savedPlanId) throw new AccountGroceryRepositoryError('Idempotency-Key đã được dùng với thực đơn khác.', 409, 'IDEMPOTENCY_CONFLICT');
    return { list: await loadList(db, row), replayed: true };
  }

  return {
    async getCurrent({ db, userId }) {
      return getCurrent(db, userId);
    },

    async createFromPlan({ db, userId, savedPlanId, requestKey }) {
      if (!validIdempotencyKey(requestKey)) throw new AccountGroceryRepositoryError('Cần Idempotency-Key dài 8–128 ký tự ASCII.', 400, 'INVALID_IDEMPOTENCY_KEY');
      const replay = await existingRequest(db, userId, requestKey, savedPlanId);
      if (replay) return replay;
      const { data, error } = await db.rpc('replace_shopping_list_from_plan', { p_saved_plan_id: savedPlanId, p_request_key: requestKey });
      if (error) {
        const concurrent = error.code === '23505' ? await existingRequest(db, userId, requestKey, savedPlanId) : null;
        if (concurrent) return concurrent;
        throw mapRpcError(error);
      }
      const list = await loadList(db, await findList(db, userId, { id: typeof data === 'string' ? data : data?.id }));
      if (!list) throw new AccountGroceryRepositoryError('Danh sách vừa lưu chưa thể tải lại.');
      return { list, replayed: false };
    },

    async addShoppingItem({ db, userId, item }) {
      const current = await getCurrent(db, userId);
      if (!current) throw new AccountGroceryRepositoryError('Hãy tạo danh sách đi chợ từ một thực đơn trước.', 409, 'SHOPPING_LIST_REQUIRED');
      const { data, error } = await db.from('shopping_list_items').insert({
        list_id: current.id,
        food_id: item.foodId,
        name: item.name,
        amount: item.amount,
        unit: item.unit,
        purchased: false,
        source: item.source,
        catalog_version: item.catalogVersion,
      }).select(ITEM_COLUMNS).single();
      if (error?.code === '23505') throw new AccountGroceryRepositoryError('Thực phẩm đã có trong danh sách.', 409, 'SHOPPING_ITEM_EXISTS');
      if (error?.code === '54000') throw new AccountGroceryRepositoryError('Danh sách đã đạt giới hạn 100 nguyên liệu.', 409, 'SHOPPING_LIST_FULL');
      if (error) throw error;
      return toShoppingItem(data);
    },

    async updateShoppingItem({ db, userId, itemId, patch }) {
      const current = await getCurrent(db, userId);
      if (!current) return null;
      const { data, error } = await db.from('shopping_list_items').update(patch)
        .eq('id', itemId).eq('list_id', current.id).select(ITEM_COLUMNS).maybeSingle();
      if (error) throw error;
      return toShoppingItem(data);
    },

    async deleteShoppingItem({ db, userId, itemId }) {
      const current = await getCurrent(db, userId);
      if (!current) return false;
      const { data, error } = await db.from('shopping_list_items').delete()
        .eq('id', itemId).eq('list_id', current.id).select('id').maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },

    async clearCurrent({ db }) {
      const { data, error } = await db.rpc('clear_current_shopping_list');
      if (error) throw mapRpcError(error);
      return data === true;
    },

    async listPantry({ db, userId, limit = 100, offset = 0 }) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000) {
        throw new AccountGroceryRepositoryError('Phân trang kho nhà không hợp lệ.', 400, 'INVALID_PAGINATION');
      }
      const { data: page, error: pageError, count: pageCount } = await db.from('pantry_items').select(PANTRY_COLUMNS, { count: 'exact' })
        .eq('user_id', userId).order('created_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + limit - 1);
      if (pageError) throw pageError;
      return { items: (page || []).map(toPantryItem), total: Number.isSafeInteger(pageCount) ? pageCount : null, limit, offset };
    },

    async getPantryItem({ db, userId, itemId }) {
      const { data, error } = await db.from('pantry_items').select(PANTRY_COLUMNS)
        .eq('id', itemId).eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return toPantryItem(data);
    },

    async getPantryItemByFoodId({ db, userId, foodId }) {
      const { data, error } = await db.from('pantry_items').select(PANTRY_COLUMNS)
        .eq('food_id', foodId).eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return toPantryItem(data);
    },

    async createPantryItem({ db, userId, item }) {
      const { data, error } = await db.from('pantry_items').insert({
        user_id: userId,
        food_id: item.foodId,
        name: item.name,
        amount: item.amount,
        unit: item.unit,
        source: item.source,
        catalog_version: item.catalogVersion,
      }).select(PANTRY_COLUMNS).single();
      if (error?.code === '23505') {
        const { data: existing, error: lookupError } = await db.from('pantry_items').select(PANTRY_COLUMNS)
          .eq('user_id', userId).eq('food_id', item.foodId).maybeSingle();
        if (lookupError) throw lookupError;
        if (existing && existing.name === item.name && Number(existing.amount) === item.amount && existing.unit === item.unit) return { item: toPantryItem(existing), replayed: true };
        throw new AccountGroceryRepositoryError('Nguyên liệu đã có trong kho nhà; hãy chỉnh số lượng hiện tại.', 409, 'PANTRY_ITEM_EXISTS');
      }
      if (error) throw error;
      return { item: toPantryItem(data), replayed: false };
    },

    async updatePantryItem({ db, userId, itemId, patch }) {
      const { data, error } = await db.from('pantry_items').update(patch)
        .eq('id', itemId).eq('user_id', userId).select(PANTRY_COLUMNS).maybeSingle();
      if (error) throw error;
      return toPantryItem(data);
    },

    async deletePantryItem({ db, userId, itemId }) {
      const { data, error } = await db.from('pantry_items').delete()
        .eq('id', itemId).eq('user_id', userId).select('id').maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
  };
}

module.exports = {
  LIST_COLUMNS,
  ITEM_COLUMNS,
  PANTRY_COLUMNS,
  AccountGroceryRepositoryError,
  createAccountGroceryRepository,
  toPantryItem,
  toShoppingItem,
};
