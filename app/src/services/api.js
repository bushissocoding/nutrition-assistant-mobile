const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error : data.error?.message;
    const error = new Error(message || `Yêu cầu thất bại (${response.status}).`);
    error.code = data.error?.code || 'HTTP_ERROR';
    error.field = data.error?.field || null;
    throw error;
  }
  return data;
}

export const api = {
  generateMealPlan: payload => request('/api/v1/meal-plans/generate', { method: 'POST', body: JSON.stringify(payload) }),
  calculateNutrition: items => request('/api/v1/nutrition/calculate', { method: 'POST', body: JSON.stringify({ items }) }),
  getFoods: query => request(`/api/v1/foods${query ? `?q=${encodeURIComponent(query)}` : ''}`),
};
