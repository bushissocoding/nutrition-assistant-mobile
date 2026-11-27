'use strict';

const { PUSH_LEASE_SECONDS } = require('./push-lease-config');

const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

class ExpoPushError extends Error {
  constructor(message = 'Expo Push is unavailable.', code = 'PUSH_PROVIDER_UNAVAILABLE', { cause } = {}) {
    super(message);
    this.name = 'ExpoPushError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

function awaitAbortable(operation, signal) {
  const request = Promise.resolve().then(operation);
  if (!signal) return request;
  if (signal.aborted) return Promise.reject(new Error('Expo Push request was aborted.'));

  let onAbort;
  const aborted = new Promise((_resolve, reject) => {
    onAbort = () => reject(new Error('Expo Push request was aborted.'));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  return Promise.race([request, aborted]).finally(() => signal.removeEventListener('abort', onAbort));
}

function createExpoPushGateway({ config, fetchImpl = globalThis.fetch, requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Expo Push gateway requires fetch.');
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs >= PUSH_LEASE_SECONDS * 1000) {
    throw new RangeError('Expo Push request timeout must be shorter than the push lease.');
  }
  const configured = typeof config?.accessToken === 'string' && config.accessToken.length > 0;

  async function post(url, body, { signal, deliveryAttempt = false } = {}) {
    if (!configured) throw new ExpoPushError('Expo Push chưa được cấu hình.', 'PUSH_PROVIDER_UNAVAILABLE');
    const controller = new AbortController();
    let timedOut = false;
    const abortFromLease = () => controller.abort(signal?.reason);
    if (signal?.aborted) abortFromLease();
    else signal?.addEventListener('abort', abortFromLease, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, requestTimeoutMs);

    try {
      const response = await awaitAbortable(() => fetchImpl(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.accessToken}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }), controller.signal);
      if (!response?.ok) {
        const retryable = response?.status === 429 || Number(response?.status) >= 500;
        throw new ExpoPushError(
          retryable ? 'Expo Push is temporarily unavailable.' : 'Expo Push rejected the request.',
          retryable ? 'PUSH_PROVIDER_UNAVAILABLE' : 'PUSH_PROVIDER_REJECTED',
        );
      }

      let payload;
      try { payload = await awaitAbortable(() => response.json(), controller.signal); }
      catch (cause) {
        throw new ExpoPushError(
          'Expo Push returned an unreadable response.',
          deliveryAttempt ? 'PUSH_DELIVERY_UNKNOWN' : 'PUSH_PROVIDER_INVALID_RESPONSE',
          { cause },
        );
      }
      if (payload?.errors?.length) throw new ExpoPushError('Expo Push rejected the request.', 'PUSH_PROVIDER_REJECTED');
      if (!payload || payload.data === undefined) {
        throw new ExpoPushError(
          'Expo Push returned an invalid response.',
          deliveryAttempt ? 'PUSH_DELIVERY_UNKNOWN' : 'PUSH_PROVIDER_INVALID_RESPONSE',
        );
      }
      return payload.data;
    } catch (cause) {
      if (cause instanceof ExpoPushError) throw cause;
      if (deliveryAttempt) {
        throw new ExpoPushError('Expo Push delivery outcome is unknown.', 'PUSH_DELIVERY_UNKNOWN', { cause });
      }
      throw new ExpoPushError(
        timedOut ? 'Expo Push request timed out.' : 'Không kết nối được Expo Push.',
        'PUSH_PROVIDER_UNAVAILABLE',
        { cause },
      );
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromLease);
    }
  }

  return {
    configured,
    async send(messages, { signal } = {}) {
      if (!Array.isArray(messages) || messages.length < 1 || messages.length > 10) throw new ExpoPushError('Lô gửi push không hợp lệ.', 'PUSH_REQUEST_INVALID');
      const result = await post(EXPO_PUSH_SEND_URL, messages, { signal, deliveryAttempt: true });
      if (!Array.isArray(result) || result.length !== messages.length) {
        throw new ExpoPushError('Expo Push returned an incomplete ticket response.', 'PUSH_DELIVERY_UNKNOWN');
      }
      return result;
    },
    async getReceipts(ticketIds, { signal } = {}) {
      if (!Array.isArray(ticketIds) || ticketIds.length < 1 || ticketIds.length > 300) throw new ExpoPushError('Lô kiểm tra receipt không hợp lệ.', 'PUSH_REQUEST_INVALID');
      const result = await post(EXPO_PUSH_RECEIPTS_URL, { ids: ticketIds }, { signal });
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new ExpoPushError('Expo Push trả về receipts không hợp lệ.', 'PUSH_PROVIDER_INVALID_RESPONSE');
      return result;
    },
  };
}

module.exports = { DEFAULT_REQUEST_TIMEOUT_MS, EXPO_PUSH_RECEIPTS_URL, EXPO_PUSH_SEND_URL, ExpoPushError, awaitAbortable, createExpoPushGateway };
