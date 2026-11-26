const { createUserSupabaseClient } = require('../services/supabase/user-client');

function sendAuthError(res, status, error, code) {
  return res.status(status).json({ error, code });
}

function readBearerToken(header) {
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(header.trim());
  if (!match || match[1].length > 8192) return null;
  return match[1];
}

function createSupabaseAuthMiddleware({ settings, createClient } = {}) {
  return async function requireSupabaseUser(req, res, next) {
    const accessToken = readBearerToken(req.get('Authorization'));
    if (!accessToken) {
      return sendAuthError(res, 401, 'Cần đăng nhập để tiếp tục.', 'AUTHENTICATION_REQUIRED');
    }

    let client;
    try {
      client = createUserSupabaseClient({ settings, accessToken, createClient });
    } catch {
      return sendAuthError(res, 503, 'Dịch vụ tài khoản chưa sẵn sàng.', 'AUTH_PROVIDER_UNAVAILABLE');
    }

    let result;
    try {
      result = await client.auth.getUser(accessToken);
    } catch {
      return sendAuthError(res, 503, 'Không thể xác minh tài khoản lúc này. Hãy thử lại sau.', 'AUTH_PROVIDER_UNAVAILABLE');
    }

    if (result?.error) {
      const errorCode = typeof result.error.code === 'string' ? result.error.code.toLowerCase() : '';
      const status = result.error.status === 401 || errorCode === 'user_not_found' ? 401 : 503;
      const code = status === 401 ? 'AUTHENTICATION_REQUIRED' : 'AUTH_PROVIDER_UNAVAILABLE';
      const message = status === 401
        ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'
        : 'Không thể xác minh tài khoản lúc này. Hãy thử lại sau.';
      return sendAuthError(res, status, message, code);
    }

    const user = result?.data?.user;
    const userId = user?.id;
    if (typeof userId !== 'string' || userId.trim().length === 0) {
      return sendAuthError(res, 401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', 'AUTHENTICATION_REQUIRED');
    }

    if (!user.email_confirmed_at && !user.phone_confirmed_at && !user.confirmed_at) {
      return sendAuthError(res, 403, 'Hãy xác minh email hoặc số điện thoại trước khi tiếp tục.', 'ACCOUNT_NOT_VERIFIED');
    }

    req.auth = Object.freeze({ user: Object.freeze({ id: userId, email: typeof user.email === 'string' ? user.email : null }) });
    req.userDatabase = client;
    return next();
  };
}

module.exports = { createSupabaseAuthMiddleware, readBearerToken };
