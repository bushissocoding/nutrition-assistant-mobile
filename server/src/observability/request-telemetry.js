'use strict';

const { randomUUID } = require('node:crypto');

const ROUTE_GROUPS = [
  '/api/v1/me/health-records',
  '/api/v1/me/notifications',
  '/api/v1/me/personalization',
  '/api/v1/me/meal-entries',
  '/api/v1/me/meal-plans',
  '/api/v1/me/nutrition-report',
  '/api/v1/me/provider-profile',
  '/api/v1/me/care',
  '/api/v1/me/chat',
  '/api/v1/me/grocery',
  '/api/v1/me/consent',
  '/api/v1/me/profile',
  '/api/v1/me',
  '/api/v1/webhooks/payos',
  '/api/v1/meal-entries',
  '/api/v1/shopping-lists',
  '/api/v1/meal-plans',
  '/api/v1/nutrition',
  '/api/v1/foods',
  '/api/v1',
];

function routeTemplate(req) {
  if (req?.route?.path === '/health' && req.baseUrl === '') return '/health';
  const route = req?.route?.path;
  if (typeof route !== 'string' || route.length > 160 || /[\r\n]/.test(route)) return 'unmatched';
  const base = typeof req?.baseUrl === 'string' ? req.baseUrl : '';
  const knownPrefix = ROUTE_GROUPS.find(prefix => base === prefix || base.startsWith(`${prefix}/`));
  return knownPrefix ? `${knownPrefix}${route === '/' ? '' : route}` : route;
}

function emitJson(logger, level, event) {
  const write = logger?.[level];
  if (typeof write === 'function') write.call(logger, JSON.stringify(event));
}

function safeCode(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(value) ? value : 'UNCLASSIFIED_ERROR';
}

function logApiFailure(req, event, code, { logger = console } = {}) {
  const payload = {
    event,
    entryPoint: 'http_api',
    requestId: req?.requestId || 'unavailable',
    method: typeof req?.method === 'string' ? req.method : 'UNKNOWN',
    route: routeTemplate(req),
    code: safeCode(code),
  };
  if (typeof req?.logApiFailure === 'function') req.logApiFailure(event, code);
  else emitJson(logger, 'error', payload);
}

function createRequestTelemetryMiddleware({ logger = console, idFactory = randomUUID, now = Date.now } = {}) {
  return function requestTelemetry(req, res, next) {
    const requestId = idFactory();
    const startedAt = now();
    req.requestId = requestId;
    req.logApiFailure = (event, code) => emitJson(logger, 'error', {
      event,
      entryPoint: 'http_api',
      requestId,
      method: req.method,
      route: routeTemplate(req),
      code: safeCode(code),
    });
    res.setHeader('x-request-id', requestId);
    res.once('finish', () => {
      const elapsed = now() - startedAt;
      emitJson(logger, 'info', {
        event: 'http_request_completed',
        entryPoint: 'http_api',
        requestId,
        method: req.method,
        route: routeTemplate(req),
        statusCode: res.statusCode,
        durationMs: Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed)) : null,
      });
    });
    next();
  };
}

module.exports = { createRequestTelemetryMiddleware, logApiFailure, routeTemplate, safeCode };
