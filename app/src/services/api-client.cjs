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
  getAccessToken = async () => null,
  fetchImpl = globalThis.fetch,
  AbortControllerImpl = globalThis.AbortController,
  timeoutMs = 15000,
} = {}) {
  if (namespaceStore && typeof namespaceStore.getNamespace !== 'function') throw new TypeError('Demo namespace store is invalid.');
  if (typeof getAccessToken !== 'function') throw new TypeError('API client requires an access-token provider.');
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

    const { demo = false, authenticated = false, headers: customHeaders, ...fetchOptions } = options;

    const work = (async () => {
      const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(customHeaders || {}),
      };
      if (authenticated) {
        let token;
        try { token = await getAccessToken(); }
        catch (cause) { throw new ApiClientError('API_AUTH_UNAVAILABLE', 'Không thể đọc phiên đăng nhập. Hãy đăng nhập lại.', { cause }); }
        if (typeof token !== 'string' || !token) throw new ApiClientError('API_AUTH_REQUIRED', 'Hãy đăng nhập để tiếp tục.');
        headers.Authorization = `Bearer ${token}`;
      }
      if (demo) {
        if (!namespaceStore) throw new ApiClientError('API_NAMESPACE_UNAVAILABLE', 'Chế độ dữ liệu demo chưa được cấu hình.');
        let namespace;
        try { namespace = await namespaceStore.getNamespace(); }
        catch (cause) {
          throw new ApiClientError('API_NAMESPACE_UNAVAILABLE', cause?.message || 'Không đọc được mã phiên demo trên thiết bị. Hãy thử lại.', { cause });
        }
        headers['X-Demo-Namespace'] = namespace;
      }
      if (deadlineExpired) {
        throw new ApiClientError('API_TIMEOUT', 'Máy chủ phản hồi quá lâu. Hãy kiểm tra kết nối rồi thử lại.');
      }
      if (callerAborted || callerSignal?.aborted) {
        throw new ApiClientError('API_REQUEST_ABORTED', 'Yêu cầu đã bị hủy.');
      }

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
    searchSourcedFoods: (query, { page = 1, signal } = {}) => request(`/api/v1/foods/search?q=${encodeURIComponent(query)}&page=${page}`, { signal }),
    getSourcedFood: (fdcId, signal) => request(`/api/v1/foods/fdc/${encodeURIComponent(String(fdcId).replace(/^fdc:/, ''))}`, { signal }),
    calculateSourcedNutrition: (items, signal) => request('/api/v1/nutrition/calculate-sourced', { method: 'POST', signal, body: JSON.stringify({ items }) }),
    createMealEntry: (payload, idempotencyKey) => request('/api/v1/meal-entries', {
      demo: true,
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payload),
    }),
    getMealEntries: ({ date, timeZone, limit = 50, offset = 0 }) => {
      const query = new URLSearchParams({ date, timeZone, limit: String(limit), offset: String(offset) });
      return request(`/api/v1/meal-entries?${query.toString()}`, { demo: true });
    },
    getMealEntry: id => request(`/api/v1/meal-entries/${encodeURIComponent(id)}`, { demo: true }),
    updateMealEntry: (id, payload) => request(`/api/v1/meal-entries/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      demo: true,
      body: JSON.stringify(payload),
    }),
    deleteMealEntry: id => request(`/api/v1/meal-entries/${encodeURIComponent(id)}`, { method: 'DELETE', demo: true }),
    purgeMealEntries: () => request('/api/v1/meal-entries', { method: 'DELETE', demo: true }),
    getCurrentShoppingList: () => request('/api/v1/shopping-lists/current', { demo: true }),
    createShoppingList: (payload, idempotencyKey) => request('/api/v1/shopping-lists', {
      method: 'POST',
      demo: true,
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payload),
    }),
    updateShoppingListItem: (id, payload) => request(`/api/v1/shopping-lists/current/items/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      demo: true,
      body: JSON.stringify(payload),
    }),
    deleteShoppingListItem: id => request(`/api/v1/shopping-lists/current/items/${encodeURIComponent(id)}`, { method: 'DELETE', demo: true }),
    deleteCurrentShoppingList: () => request('/api/v1/shopping-lists/current', { method: 'DELETE', demo: true }),
    purgeShoppingLists: () => request('/api/v1/shopping-lists', { method: 'DELETE', demo: true }),
    getCurrentUser: () => request('/api/v1/me', { authenticated: true }),
    getMyConsent: () => request('/api/v1/me/consent', { authenticated: true }),
    saveMyConsent: choices => request('/api/v1/me/consent', { method: 'PUT', authenticated: true, body: JSON.stringify({ choices }) }),
    getMyProfile: () => request('/api/v1/me/profile', { authenticated: true }),
    saveMyProfile: profile => request('/api/v1/me/profile', { method: 'PUT', authenticated: true, body: JSON.stringify(profile) }),
    deleteMyProfile: () => request('/api/v1/me/profile', { method: 'DELETE', authenticated: true }),
    getMyAccountExport: () => request('/api/v1/me/export', { authenticated: true }),
    deleteMyAccount: () => request('/api/v1/me', { method: 'DELETE', authenticated: true }),
    getMyMealPlans: ({ limit = 20, offset = 0 } = {}) => request(`/api/v1/me/meal-plans?${new URLSearchParams({ limit: String(limit), offset: String(offset) })}`, { authenticated: true }),
    createMyMealPlan: (payload, idempotencyKey) => request('/api/v1/me/meal-plans', {
      method: 'POST',
      authenticated: true,
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payload),
    }),
    createMyMealEntry: (payload, idempotencyKey) => request('/api/v1/me/meal-entries', {
      method: 'POST',
      authenticated: true,
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payload),
    }),
    getMyMealEntries: ({ date, timeZone, limit = 50, offset = 0 }) => request(`/api/v1/me/meal-entries?${new URLSearchParams({ date, timeZone, limit: String(limit), offset: String(offset) })}`, { authenticated: true }),
    getMyMealEntry: id => request(`/api/v1/me/meal-entries/${encodeURIComponent(id)}`, { authenticated: true }),
    updateMyMealEntry: (id, payload) => request(`/api/v1/me/meal-entries/${encodeURIComponent(id)}`, { method: 'PATCH', authenticated: true, body: JSON.stringify(payload) }),
    deleteMyMealEntry: id => request(`/api/v1/me/meal-entries/${encodeURIComponent(id)}`, { method: 'DELETE', authenticated: true }),
    getMyNutritionReport: ({ date, timeZone, days = 7 }) => request(`/api/v1/me/nutrition-report?${new URLSearchParams({ date, timeZone, days: String(days) })}`, { authenticated: true }),
    getMyShoppingList: () => request('/api/v1/me/grocery/shopping-list', { authenticated: true }),
    createMyShoppingList: (savedPlanId, idempotencyKey) => request('/api/v1/me/grocery/shopping-list', {
      method: 'POST',
      authenticated: true,
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ savedPlanId }),
    }),
    clearMyShoppingList: () => request('/api/v1/me/grocery/shopping-list', { method: 'DELETE', authenticated: true }),
    createMyShoppingListItem: payload => request('/api/v1/me/grocery/shopping-list/items', { method: 'POST', authenticated: true, body: JSON.stringify(payload) }),
    updateMyShoppingListItem: (id, payload) => request(`/api/v1/me/grocery/shopping-list/items/${encodeURIComponent(id)}`, { method: 'PATCH', authenticated: true, body: JSON.stringify(payload) }),
    deleteMyShoppingListItem: id => request(`/api/v1/me/grocery/shopping-list/items/${encodeURIComponent(id)}`, { method: 'DELETE', authenticated: true }),
    getMyPantry: ({ limit = 100, offset = 0 } = {}) => request(`/api/v1/me/grocery/pantry?${new URLSearchParams({ limit: String(limit), offset: String(offset) })}`, { authenticated: true }),
    getMyPantryItem: id => request(`/api/v1/me/grocery/pantry/${encodeURIComponent(id)}`, { authenticated: true }),
    getMyPantryItemByFoodId: foodId => request(`/api/v1/me/grocery/pantry/food/${encodeURIComponent(foodId)}`, { authenticated: true }),
    createMyPantryItem: payload => request('/api/v1/me/grocery/pantry', { method: 'POST', authenticated: true, body: JSON.stringify(payload) }),
    updateMyPantryItem: (id, payload) => request(`/api/v1/me/grocery/pantry/${encodeURIComponent(id)}`, { method: 'PATCH', authenticated: true, body: JSON.stringify(payload) }),
    deleteMyPantryItem: id => request(`/api/v1/me/grocery/pantry/${encodeURIComponent(id)}`, { method: 'DELETE', authenticated: true }),
  };
}

module.exports = { ApiClientError, createApiClient, createApiMethods };
