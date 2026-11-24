const { createHash, createHmac, timingSafeEqual } = require('node:crypto');

const MAX_ORDER_CODE = 2147483647;

class PaymentValidationError extends Error {
  constructor(message, code = 'INVALID_PAYMENT_EVENT') {
    super(message);
    this.name = 'PaymentValidationError';
    this.code = code;
  }
}

function normalizeSignedValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return JSON.stringify(value.map(normalizeObject));
  if (value && typeof value === 'object') return JSON.stringify(normalizeObject(value));
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function normalizeObject(value) {
  if (Array.isArray(value)) return value.map(normalizeObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalizeObject(value[key])]));
}

function canonicalizePayosData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new PaymentValidationError('Dữ liệu chữ ký thanh toán không hợp lệ.');
  return Object.keys(data).sort().map(key => `${key}=${normalizeSignedValue(data[key])}`).join('&');
}

function signPayosData(data, checksumKey) {
  if (typeof checksumKey !== 'string' || checksumKey.length === 0) throw new PaymentValidationError('Thiếu khóa xác minh thanh toán.', 'PAYMENT_UNAVAILABLE');
  return createHmac('sha256', checksumKey).update(canonicalizePayosData(data), 'utf8').digest('hex');
}

function verifyPayosSignature(data, signature, checksumKey) {
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  try {
    const expected = Buffer.from(signPayosData(data, checksumKey), 'hex');
    const received = Buffer.from(signature, 'hex');
    return expected.length === received.length && timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

function normalizePayosWebhook(payload, checksumKey) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)
    || typeof payload.signature !== 'string' || typeof payload.code !== 'string' || typeof payload.success !== 'boolean') {
    throw new PaymentValidationError('Webhook thanh toán không đúng định dạng.');
  }
  const data = payload.data;
  if (!verifyPayosSignature(data, payload.signature, checksumKey)) throw new PaymentValidationError('Chữ ký webhook thanh toán không hợp lệ.', 'INVALID_PAYMENT_SIGNATURE');
  const orderCode = data.orderCode;
  const amount = data.amount;
  const currency = data.currency;
  const paymentLinkId = data.paymentLinkId;
  const reference = data.reference;
  const eventCode = data.code;
  if (!Number.isSafeInteger(orderCode) || orderCode < 1 || orderCode > MAX_ORDER_CODE
    || !Number.isSafeInteger(amount) || amount < 1 || amount > 50000000
    || currency !== 'VND'
    || typeof paymentLinkId !== 'string' || paymentLinkId.length < 1 || paymentLinkId.length > 128
    || typeof reference !== 'string' || reference.length < 1 || reference.length > 128
    || typeof eventCode !== 'string' || eventCode.length < 1 || eventCode.length > 32
    || (data.transactionDateTime !== undefined && (typeof data.transactionDateTime !== 'string' || data.transactionDateTime.length > 64))) {
    throw new PaymentValidationError('Thông tin giao dịch PayOS không hợp lệ.');
  }
  return {
    orderCode,
    amount,
    currency,
    paymentLinkId,
    reference,
    eventCode,
    // The PayOS signature covers `data`, not the root envelope. Only signed transaction
    // data may determine whether money was received; the root code/success are delivery metadata.
    success: eventCode === '00',
    transactionDateTime: data.transactionDateTime || null,
    eventKey: createHash('sha256').update(canonicalizePayosData(data), 'utf8').digest('hex'),
  };
}

module.exports = {
  MAX_ORDER_CODE,
  PaymentValidationError,
  canonicalizePayosData,
  normalizePayosWebhook,
  signPayosData,
  verifyPayosSignature,
};
