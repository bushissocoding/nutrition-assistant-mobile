'use strict';

const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

class ExpoPushError extends Error {
  constructor(message = 'Expo Push is unavailable.', code = 'PUSH_PROVIDER_UNAVAILABLE', { cause } = {}) {
    super(message);
    this.name = 'ExpoPushError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

function createExpoPushGateway({ config, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Expo Push gateway requires fetch.');
  const configured = typeof config?.accessToken === 'string' && config.accessToken.length > 0;

  async function post(url, body) {
    if (!configured) throw new ExpoPushError('Expo Push chưa được cấu hình.', 'PUSH_PROVIDER_UNAVAILABLE');
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.accessToken}`,
        },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      throw new ExpoPushError('Không kết nối được Expo Push.', 'PUSH_PROVIDER_UNAVAILABLE', { cause });
    }
    if (!response?.ok) throw new ExpoPushError('Expo Push từ chối yêu cầu.', 'PUSH_PROVIDER_UNAVAILABLE');
    let payload;
    try { payload = await response.json(); }
    catch (cause) { throw new ExpoPushError('Expo Push trả về dữ liệu không hợp lệ.', 'PUSH_PROVIDER_INVALID_RESPONSE', { cause }); }
    if (!payload || payload.errors?.length || payload.data === undefined) throw new ExpoPushError('Expo Push trả về dữ liệu không hợp lệ.', 'PUSH_PROVIDER_INVALID_RESPONSE');
    return payload.data;
  }

  return {
    configured,
    async send(messages) {
      if (!Array.isArray(messages) || messages.length < 1 || messages.length > 100) throw new ExpoPushError('Lô gửi push không hợp lệ.', 'PUSH_REQUEST_INVALID');
      const result = await post(EXPO_PUSH_SEND_URL, messages);
      if (!Array.isArray(result) || result.length !== messages.length) throw new ExpoPushError('Expo Push trả về số ticket không khớp.', 'PUSH_PROVIDER_INVALID_RESPONSE');
      return result;
    },
    async getReceipts(ticketIds) {
      if (!Array.isArray(ticketIds) || ticketIds.length < 1 || ticketIds.length > 300) throw new ExpoPushError('Lô kiểm tra receipt không hợp lệ.', 'PUSH_REQUEST_INVALID');
      const result = await post(EXPO_PUSH_RECEIPTS_URL, { ids: ticketIds });
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new ExpoPushError('Expo Push trả về receipts không hợp lệ.', 'PUSH_PROVIDER_INVALID_RESPONSE');
      return result;
    },
  };
}

module.exports = { EXPO_PUSH_RECEIPTS_URL, EXPO_PUSH_SEND_URL, ExpoPushError, createExpoPushGateway };
