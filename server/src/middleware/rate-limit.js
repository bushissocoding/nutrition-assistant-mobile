function createRateLimitMiddleware({ limit = 180, windowMs = 60_000, maxClients = 10_000, now = Date.now } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1
    || !Number.isSafeInteger(maxClients) || maxClients < 1 || typeof now !== 'function') {
    throw new TypeError('Rate limit settings are invalid.');
  }

  const clients = new Map();
  return function enforceRateLimit(req, res, next) {
    const currentTime = now();
    const key = typeof req.ip === 'string' && req.ip ? req.ip : 'unknown';
    let entry = clients.get(key);

    if (!entry || entry.resetAt <= currentTime) {
      if (!entry && clients.size >= maxClients) {
        for (const [clientKey, client] of clients) {
          if (client.resetAt <= currentTime) clients.delete(clientKey);
        }
        if (clients.size >= maxClients) {
          res.setHeader('Retry-After', '1');
          return res.status(429).json({ error: 'Máy chủ đang nhận quá nhiều yêu cầu. Hãy thử lại sau.', code: 'RATE_LIMITED' });
        }
      }
      entry = { count: 0, resetAt: currentTime + windowMs };
      clients.set(key, entry);
    }

    entry.count += 1;
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - entry.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
    if (entry.count > limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1000))));
      return res.status(429).json({ error: 'Máy chủ đang nhận quá nhiều yêu cầu. Hãy thử lại sau.', code: 'RATE_LIMITED' });
    }
    return next();
  };
}

module.exports = { createRateLimitMiddleware };
