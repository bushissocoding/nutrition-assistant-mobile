function createUserRateLimitMiddleware({ limit = 20, windowMs = 60_000, maxUsers = 10_000, now = Date.now } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1
    || !Number.isSafeInteger(maxUsers) || maxUsers < 1 || typeof now !== 'function') {
    throw new TypeError('User rate limit settings are invalid.');
  }
  const users = new Map();
  return function enforceUserRateLimit(req, res, next) {
    const userId = req.auth?.user?.id;
    if (typeof userId !== 'string' || !userId) return res.status(401).json({ error: 'Cần đăng nhập để tiếp tục.', code: 'AUTHENTICATION_REQUIRED' });
    const currentTime = now();
    let entry = users.get(userId);
    if (!entry || entry.resetAt <= currentTime) {
      if (!entry && users.size >= maxUsers) {
        for (const [key, value] of users) if (value.resetAt <= currentTime) users.delete(key);
        if (users.size >= maxUsers) {
          res.setHeader('Retry-After', '1');
          return res.status(429).json({ error: 'Đã gửi quá nhiều yêu cầu. Hãy thử lại sau.', code: 'RATE_LIMITED' });
        }
      }
      entry = { count: 0, resetAt: currentTime + windowMs };
      users.set(userId, entry);
    }
    entry.count += 1;
    if (entry.count > limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1000))));
      return res.status(429).json({ error: 'Đã gửi quá nhiều yêu cầu. Hãy thử lại sau.', code: 'RATE_LIMITED' });
    }
    return next();
  };
}

module.exports = { createUserRateLimitMiddleware };
