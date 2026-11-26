const { FOOD_ID_PATTERN, parseFoodId } = require('./food-source');

const CUSTOM_NAME_MAX_LENGTH = 100;
const UNITS = new Set(['g', 'kg', 'ml', 'l', 'piece', 'bunch', 'pack']);
const MAX_AMOUNT = 1_000_000;

class AccountGroceryValidationError extends Error {
  constructor(message, code = 'VALIDATION_ERROR', status = 400) {
    super(message);
    this.name = 'AccountGroceryValidationError';
    this.code = code;
    this.status = status;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeGroceryAmount(value) {
  if (!isRecord(value) || Object.keys(value).some(key => !['amount', 'unit'].includes(key))
    || !Number.isFinite(value.amount) || value.amount <= 0 || value.amount > MAX_AMOUNT
    || typeof value.unit !== 'string' || !UNITS.has(value.unit)) {
    throw new AccountGroceryValidationError('amount hoặc unit của nguyên liệu không hợp lệ.');
  }
  const amount = Number(value.amount.toFixed(3));
  if (amount <= 0) throw new AccountGroceryValidationError('amount phải lớn hơn 0 đến 1.000.000.');
  return { amount, unit: value.unit };
}

function normalizePantryMutation(input) {
  if (!isRecord(input)) throw new AccountGroceryValidationError('Nguyên liệu trong kho không hợp lệ.');
  if (Object.keys(input).sort().join(',') === 'amount,customName,unit') {
    if (typeof input.customName !== 'string' || !input.customName.trim() || input.customName.trim().length > CUSTOM_NAME_MAX_LENGTH) {
      throw new AccountGroceryValidationError(`Tên nguyên liệu tự nhập phải dài từ 1 đến ${CUSTOM_NAME_MAX_LENGTH} ký tự.`);
    }
    return { customName: input.customName.trim().replace(/\s+/g, ' '), ...normalizeGroceryAmount({ amount: input.amount, unit: input.unit }) };
  }
  if (Object.keys(input).some(key => !['foodId', 'amount', 'unit'].includes(key))
    || typeof input.foodId !== 'string' || !FOOD_ID_PATTERN.test(input.foodId)) {
    throw new AccountGroceryValidationError('Chọn thực phẩm có mã nguồn hợp lệ hoặc nhập tên cùng số lượng; nguồn và chủ sở hữu do máy chủ xác định.');
  }
  return { foodId: input.foodId, ...normalizeGroceryAmount({ amount: input.amount, unit: input.unit }) };
}

function normalizeShoppingItemPatch(input) {
  const allowed = new Set(['amount', 'unit', 'purchased']);
  if (!isRecord(input) || Object.keys(input).length === 0 || Object.keys(input).some(key => !allowed.has(key))) {
    throw new AccountGroceryValidationError('Cần cung cấp thay đổi số lượng, đơn vị hoặc trạng thái mua.');
  }
  const patch = {};
  if ('amount' in input || 'unit' in input) {
    const amount = input.amount;
    const unit = input.unit;
    if (amount === undefined || unit === undefined) {
      throw new AccountGroceryValidationError('Khi sửa số lượng cần gửi đồng thời amount và unit.');
    }
    Object.assign(patch, normalizeGroceryAmount({ amount, unit }));
  }
  if ('purchased' in input) {
    if (typeof input.purchased !== 'boolean') throw new AccountGroceryValidationError('purchased phải là boolean.');
    patch.purchased = input.purchased;
  }
  return patch;
}

function normalizePantryItemPatch(input) {
  if (!isRecord(input) || Object.keys(input).length === 0 || Object.keys(input).some(key => !['amount', 'unit'].includes(key))) {
    throw new AccountGroceryValidationError('Kho nhà chỉ cho phép cập nhật số lượng và đơn vị.');
  }
  return normalizeGroceryAmount(input);
}

function combineSavedPlanPortions(savedResult) {
  if (!savedResult || savedResult.status !== 'feasible' || !Array.isArray(savedResult.plan) || savedResult.plan.length === 0) {
    throw new AccountGroceryValidationError('Chỉ có thể tạo danh sách từ thực đơn đã lưu và khả thi.', 'PLAN_NOT_FEASIBLE', 409);
  }
  const items = new Map();
  for (const meal of savedResult.plan) {
    if (!Array.isArray(meal?.portions)) throw new AccountGroceryValidationError('Snapshot thực đơn không có thành phần hợp lệ.', 'PLAN_INVALID', 422);
    for (const portion of meal.portions) {
      const provenance = portion?.provenance;
      if (!parseFoodId(portion?.foodId)
        || typeof portion.food !== 'string' || !portion.food.trim() || portion.food.length > 500
        || !Number.isFinite(portion.grams) || portion.grams <= 0 || portion.grams > 5000
        || typeof provenance?.sourceId !== 'string' || !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(provenance.sourceId)
        || typeof provenance.sourceRecordId !== 'string'
        || typeof provenance.edition !== 'string' || typeof provenance.catalogVersion !== 'string') {
        throw new AccountGroceryValidationError('Snapshot có thành phần thiếu nguồn hoặc số lượng.', 'PLAN_INVALID', 422);
      }
      const source = { id: provenance.sourceId, recordId: provenance.sourceRecordId, edition: provenance.edition };
      const existing = items.get(portion.foodId);
      if (existing && (existing.name !== portion.food || JSON.stringify(existing.source) !== JSON.stringify(source)
        || existing.catalogVersion !== provenance.catalogVersion)) {
        throw new AccountGroceryValidationError('Cùng một thành phần có nguồn không thống nhất trong snapshot.', 'PLAN_INVALID', 422);
      }
      const amount = (existing?.amount || 0) + portion.grams;
      if (amount > MAX_AMOUNT) throw new AccountGroceryValidationError('Tổng số lượng thành phần vượt giới hạn.', 'PLAN_INVALID', 422);
      items.set(portion.foodId, {
        foodId: portion.foodId,
        name: portion.food,
        amount: Number(amount.toFixed(3)),
        unit: 'g',
        source,
        catalogVersion: provenance.catalogVersion,
      });
    }
  }
  if (!items.size) throw new AccountGroceryValidationError('Thực đơn không có thành phần để mua.', 'PLAN_INVALID', 422);
  return [...items.values()].sort((left, right) => left.foodId.localeCompare(right.foodId));
}

module.exports = {
  AccountGroceryValidationError,
  CUSTOM_NAME_MAX_LENGTH,
  FOOD_ID_PATTERN,
  MAX_AMOUNT,
  UNITS,
  combineSavedPlanPortions,
  normalizeGroceryAmount,
  normalizePantryItemPatch,
  normalizePantryMutation,
  normalizeShoppingItemPatch,
};
