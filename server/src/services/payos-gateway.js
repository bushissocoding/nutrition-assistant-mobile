const { signPayosData, PaymentValidationError } = require('./payments');

const PAYOS_API = 'https://api-merchant.payos.vn/v2/payment-requests';

class PayosGatewayError extends Error {
  constructor(message = 'Không thể tạo liên kết thanh toán lúc này.', code = 'PAYOS_UNAVAILABLE', status = 503) {
    super(message);
    this.name = 'PayosGatewayError';
    this.code = code;
    this.status = status;
  }
}

function appendOrderCode(value, orderCode) {
  let url;
  try { url = new URL(value); }
  catch { throw new PayosGatewayError('URL thanh toán chưa được cấu hình.', 'PAYMENT_UNAVAILABLE'); }
  url.searchParams.set('orderCode', String(orderCode));
  return url.toString();
}

function paymentDescription(orderCode) {
  return `APT${String(orderCode).slice(-6)}`;
}

function isHostedCheckoutUrl(value, paymentLinkId) {
  if (typeof value !== 'string' || value.length > 1000) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'pay.payos.vn' && url.pathname === `/web/${paymentLinkId}`
      && !url.username && !url.password && !url.hash;
  } catch { return false; }
}

function createPayosGateway({ config, fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
  return {
    configured: Boolean(config?.clientId && config?.apiKey && config?.checksumKey && config?.returnUrl && config?.cancelUrl),
    async createPaymentLink({ orderCode, amount, expiresAt }) {
      if (!config?.clientId || !config.apiKey || !config.checksumKey) throw new PayosGatewayError('Thanh toán chưa được cấu hình.', 'PAYMENT_UNAVAILABLE');
      if (!Number.isSafeInteger(orderCode) || orderCode < 1 || orderCode > 2147483647
        || !Number.isSafeInteger(amount) || amount < 1 || amount > 50000000
        || typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt))) throw new PaymentValidationError('Thông tin tạo thanh toán không hợp lệ.');
      const expiredAt = Math.floor(Date.parse(expiresAt) / 1000);
      if (!Number.isSafeInteger(expiredAt) || expiredAt <= Math.floor(Date.now() / 1000) || expiredAt > 2147483647) {
        throw new PaymentValidationError('Thời hạn thanh toán không hợp lệ.');
      }
      const cancelUrl = appendOrderCode(config.cancelUrl, orderCode);
      const returnUrl = appendOrderCode(config.returnUrl, orderCode);
      const payload = {
        orderCode,
        amount,
        description: paymentDescription(orderCode),
        cancelUrl,
        returnUrl,
        expiredAt,
      };
      payload.signature = signPayosData({
        amount: payload.amount,
        cancelUrl: payload.cancelUrl,
        description: payload.description,
        orderCode: payload.orderCode,
        returnUrl: payload.returnUrl,
      }, config.checksumKey);
      let response;
      try {
        response = await fetchImpl(PAYOS_API, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-client-id': config.clientId, 'x-api-key': config.apiKey },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new PayosGatewayError();
      }
      let result;
      try { result = await response.json(); }
      catch { throw new PayosGatewayError(); }
      const data = result?.data;
      if (!response.ok || result?.code !== '00') throw new PayosGatewayError();
      if (!data || data.orderCode !== orderCode || data.amount !== amount || typeof data.paymentLinkId !== 'string'
        || !isHostedCheckoutUrl(data.checkoutUrl, data.paymentLinkId)
        || (data.qrCode !== undefined && (typeof data.qrCode !== 'string' || data.qrCode.length > 2000))) {
        throw new PayosGatewayError('Phản hồi từ cổng thanh toán không hợp lệ.', 'PAYOS_INVALID_RESPONSE');
      }
      return { paymentLinkId: data.paymentLinkId, checkoutUrl: data.checkoutUrl, qrCode: data.qrCode || null };
    },
    async cancelPaymentLink({ orderCode }) {
      if (!config?.clientId || !config.apiKey) throw new PayosGatewayError('Thanh toán chưa được cấu hình.', 'PAYMENT_UNAVAILABLE');
      if (!Number.isSafeInteger(orderCode) || orderCode < 1 || orderCode > 2147483647) throw new PaymentValidationError('Mã đơn thanh toán không hợp lệ.');
      let response;
      try {
        response = await fetchImpl(`${PAYOS_API}/${orderCode}/cancel`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-client-id': config.clientId, 'x-api-key': config.apiKey },
          body: JSON.stringify({ cancellationReason: 'Appointment cancelled' }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch { throw new PayosGatewayError(); }
      let result;
      try { result = await response.json(); }
      catch { throw new PayosGatewayError(); }
      if (!response.ok || result?.code !== '00' || result?.data?.orderCode !== orderCode || result?.data?.status !== 'CANCELLED') throw new PayosGatewayError();
      return { orderCode, status: 'cancelled' };
    },
  };
}

module.exports = { PAYOS_API, PayosGatewayError, createPayosGateway, isHostedCheckoutUrl, paymentDescription };
