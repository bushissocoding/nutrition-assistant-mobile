class ApiConfigurationError extends Error {
  constructor(message, code = 'API_CONFIG_INVALID') {
    super(message);
    this.name = 'ApiConfigurationError';
    this.code = code;
  }
}

function resolveApiBaseUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ApiConfigurationError(
      'Chưa cấu hình địa chỉ API. Hãy đặt EXPO_PUBLIC_API_URL rồi khởi động lại Expo.',
      'API_CONFIG_MISSING',
    );
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ApiConfigurationError('Địa chỉ API không hợp lệ. Hãy kiểm tra EXPO_PUBLIC_API_URL.');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ApiConfigurationError('Địa chỉ API phải bắt đầu bằng http:// hoặc https://.');
  }
  if (!url.hostname || url.username || url.password || url.search || url.hash) {
    throw new ApiConfigurationError('Địa chỉ API không được chứa thông tin đăng nhập, query hoặc fragment.');
  }

  return url.toString().replace(/\/+$/, '');
}

module.exports = { ApiConfigurationError, resolveApiBaseUrl };
