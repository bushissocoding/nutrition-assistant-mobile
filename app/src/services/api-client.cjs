const { ApiConfigurationError, resolveApiBaseUrl } = require('./api-config.cjs');

class ApiClientError extends Error {
  constructor(code, message, { status, cause } = {}) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    if (status !== undefined) this.status = status;
    if (cause !== undefined) this.cause = cause;
  }
}

function errorFromResponse(status, body) {
  const serverMessage = body && typeof body.error === 'string' ? body.error : null;
  const message = serverMessage || (status >= 500
    ? 'Máy chủ đang gặp sự cố. Hãy thử lại sau.'
    : `Yêu cầu chưa được chấp nhận (HTTP ${status}).`);
  return new ApiClientError('API_HTTP_ERROR', message, { status });
}

async function parseResponse(response) {
  if (response.status === 204) return null;

  let text;
  try {
    text = await response.text();
  } catch (cause) {
    if (!response.ok) throw errorFromResponse(response.status, null);
    throw new ApiClientError('API_RESPONSE_INVALID', 'Máy chủ trả về dữ liệu không đọc được.', { cause });
  }

  let body = null;
  if (typeof text === 'string' && text.trim() !== '') {
    try {
      body = JSON.parse(text);
    } catch (cause) {
      if (!response.ok) throw errorFromResponse(response.status, null);
      throw new ApiClientError('API_RESPONSE_INVALID', 'Máy chủ trả về dữ liệu không đúng định dạng.', { cause });
    }
  }

  if (!response.ok) throw errorFromResponse(response.status, body);
  return body;
}

function createApiClient({
  baseUrl,
  namespaceStore,
  fetchImpl = globalThis.fetch,
  AbortControllerImpl = globalThis.AbortController,
  timeoutMs = 15000,
} = {}) {
  if (!namespaceStore || typeof namespaceStore.getNamespace !== 'function') {
    throw new TypeError('API client requires a demo namespace store.');
  }
  if (typeof fetchImpl !== 'function') throw new TypeError('API client requires fetch.');
  if (typeof AbortControllerImpl !== 'function') throw new TypeError('API client requires AbortController.');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('API timeout must be a positive number.');

  async function request(path, options = {}) {
    let base;
    try {
      base = resolveApiBaseUrl(baseUrl);
    } catch (cause) {
      if (cause instanceof ApiConfigurationError) throw cause;
      throw new ApiClientError('API_CONFIG_INVALID', 'Địa chỉ API không hợp lệ.', { cause });
    }
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
      throw new ApiClientError('API_PATH_INVALID', 'Đường dẫn API không hợp lệ.');
    }

    const callerSignal = options.signal;
    if (callerSignal?.aborted) {
      throw new ApiClientError('API_REQUEST_ABORTED', 'Yêu cầu đã bị hủy.');
    }

    const controller = new AbortControllerImpl();
    let timeoutId;
    let rejectTimeout;
    let rejectCallerAbort;
    let deadlineExpired = false;
    let callerAborted = false;
    const timeoutPromise = new Promise((resolve, reject) => { rejectTimeout = reject; });
    const callerAbortPromise = new Promise((resolve, reject) => { rejectCallerAbort = reject; });
    const onCallerAbort = () => {
      callerAborted = true;
      controller.abort();
      rejectCallerAbort(new ApiClientError('API_REQUEST_ABORTED', 'Yêu cầu đã bị hủy.'));
    };
    callerSignal?.addEventListener('abort', onCallerAbort, { once: true });

    timeoutId = setTimeout(() => {
      deadlineExpired = true;
      controller.abort();
      rejectTimeout(new ApiClientError('API_TIMEOUT', 'Máy chủ phản hồi quá lâu. Hãy kiểm tra kết nối rồi thử lại.'));
    }, timeoutMs);

    const { signal: ignoredSignal, headers: customHeaders, ...fetchOptions } = options;

    const work = (async () => {
      let namespace;
      try {
        namespace = await namespaceStore.getNamespace();
      } catch (cause) {
        throw new ApiClientError(
          'API_NAMESPACE_UNAVAILABLE',
          cause?.message || 'Không đọc được mã phiên demo trên thiết bị. Hãy thử lại.',
          { cause },
        );
      }
      if (deadlineExpired) {
        throw new ApiClientError('API_TIMEOUT', 'Máy chủ phản hồi quá lâu. Hãy kiểm tra kết nối rồi thử lại.');
      }
      if (callerAborted || callerSignal?.aborted) {
        throw new ApiClientError('API_REQUEST_ABORTED', 'Yêu cầu đã bị hủy.');
      }

      const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(customHeaders || {}),
        'X-Demo-Namespace': namespace,
      };
      let response;
      try {
        response = await fetchImpl(`${base}${path}`, {
          ...fetchOptions,
          headers,
          signal: controller.signal,
        });
      } catch (cause) {
        if (callerAborted || callerSignal?.aborted) throw new ApiClientError('API_REQUEST_ABORTED', 'Yêu cầu đã bị hủy.', { cause });
        if (deadlineExpired) throw new ApiClientError('API_TIMEOUT', 'Máy chủ phản hồi quá lâu. Hãy kiểm tra kết nối rồi thử lại.', { cause });
        throw new ApiClientError('API_NETWORK_ERROR', 'Không kết nối được API. Hãy kiểm tra mạng và thử lại.', { cause });
      }
      return parseResponse(response);
    })();

    try {
      return await Promise.race([work, timeoutPromise, callerAbortPromise]);
    } finally {
      clearTimeout(timeoutId);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    }
  }

  return { request };
}

function createApiMethods(apiClient) {
  if (!apiClient || typeof apiClient.request !== 'function') {
    throw new TypeError('API methods require a shared client.');
  }
  const request = apiClient.request.bind(apiClient);
  return {
    generateMealPlan: payload => request('/api/v1/meal-plans/generate', { method: 'POST', body: JSON.stringify(payload) }),
    calculateNutrition: items => request('/api/v1/nutrition/calculate', { method: 'POST', body: JSON.stringify({ items }) }),
    getFoods: query => request(`/api/v1/foods${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  };
}

module.exports = { ApiClientError, createApiClient, createApiMethods };
