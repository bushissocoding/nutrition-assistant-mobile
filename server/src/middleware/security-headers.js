function createSecurityHeadersMiddleware({ environment = 'development' } = {}) {
  return function applySecurityHeaders(_req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (environment === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    return next();
  };
}

module.exports = { createSecurityHeadersMiddleware };
