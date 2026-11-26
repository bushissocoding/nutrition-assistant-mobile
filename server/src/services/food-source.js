const INSTITUTE_SOURCE_ID = 'vietnam-nin';
const PENDING_DATASET_MESSAGE = 'Dữ liệu từ Viện Dinh dưỡng Quốc gia chưa khả dụng vì quyền tái phân phối chưa được xác nhận.';
const FOOD_ID_PATTERN = /^([a-z][a-z0-9-]{1,63}):([A-Za-z0-9._-]{1,128})$/;

function parseFoodId(value) {
  if (typeof value !== 'string') return null;
  const match = FOOD_ID_PATTERN.exec(value);
  return match ? { sourceId: match[1], recordId: match[2] } : null;
}

class FoodSourceError extends Error {
  constructor(code, message = PENDING_DATASET_MESSAGE) {
    super(message);
    this.name = 'FoodSourceError';
    this.code = code;
  }
}

function createPendingInstituteFoodSource() {
  const unavailable = async () => {
    throw new FoodSourceError('FOOD_SOURCE_UNAVAILABLE');
  };

  return Object.freeze({ search: unavailable, getFood: unavailable });
}

module.exports = { FOOD_ID_PATTERN, INSTITUTE_SOURCE_ID, FoodSourceError, PENDING_DATASET_MESSAGE, createPendingInstituteFoodSource, parseFoodId };
