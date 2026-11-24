const express = require('express');
const { logApiFailure } = require('../observability/request-telemetry');
const { createCurrentConsentMiddleware } = require('../middleware/current-consent');
const { createUserRateLimitMiddleware } = require('../middleware/user-rate-limit');
const { ChatRepositoryError, createChatRepository } = require('../repositories/chat-repository');
const { AssistantProviderError } = require('../services/assistant-provider');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AI_CONSENT_VERSION = 'ai-assistant-processing-v1';
const MAX_MESSAGE_LENGTH = 2000;

function asyncRoute(handler) {
  return (req, res) => Promise.resolve(handler(req, res)).catch(error => {
    if (error instanceof ChatRepositoryError || error instanceof AssistantProviderError || Number.isInteger(error?.status)) {
      return res.status(error.status).json({ error: error.message, code: error.code || 'CHAT_UNAVAILABLE' });
    }
    logApiFailure(req, 'chat_operation_failed', 'CHAT_UNAVAILABLE');
    return res.status(503).json({ error: 'Không thể xử lý hội thoại lúc này. Hãy thử lại sau.', code: 'CHAT_UNAVAILABLE' });
  });
}

function parseBody(body, keys, label) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join(',') !== [...keys].sort().join(',')) {
    throw new ChatRepositoryError(`${label} không đúng định dạng.`, 400, 'INVALID_CHAT_REQUEST');
  }
}

function normalizeAssistantConsent(body) {
  parseBody(body, ['version', 'accepted'], 'Lựa chọn trợ lý AI');
  if (body.version !== AI_CONSENT_VERSION || typeof body.accepted !== 'boolean') throw new ChatRepositoryError('Lựa chọn trợ lý AI không hợp lệ.', 400, 'INVALID_CHAT_CONSENT');
  return { version: body.version, accepted: body.accepted };
}

function normalizeAssistantTurn(body) {
  parseBody(body, ['clientMessageId', 'message'], 'Tin nhắn trợ lý');
  if (typeof body.clientMessageId !== 'string' || !UUID.test(body.clientMessageId)
    || typeof body.message !== 'string' || !body.message.trim() || body.message.trim().length > MAX_MESSAGE_LENGTH) {
    throw new ChatRepositoryError('Tin nhắn phải dài 1–2000 ký tự và có mã yêu cầu hợp lệ.', 400, 'INVALID_CHAT_REQUEST');
  }
  return { clientMessageId: body.clientMessageId.toLowerCase(), message: body.message.trim() };
}

function normalizeAppointmentMessage(body) {
  parseBody(body, ['clientMessageId', 'body'], 'Tin nhắn lịch hẹn');
  if (typeof body.clientMessageId !== 'string' || !UUID.test(body.clientMessageId)
    || typeof body.body !== 'string' || !body.body.trim() || body.body.trim().length > MAX_MESSAGE_LENGTH) {
    throw new ChatRepositoryError('Tin nhắn phải dài 1–2000 ký tự và có mã yêu cầu hợp lệ.', 400, 'INVALID_CHAT_REQUEST');
  }
  return { clientMessageId: body.clientMessageId.toLowerCase(), body: body.body.trim() };
}

function createChatRouter({ repository = createChatRepository(), assistantProvider, requireCurrentConsent = createCurrentConsentMiddleware() } = {}) {
  const router = express.Router();
  const assistantRateLimit = createUserRateLimitMiddleware({ limit: 12 });
  const appointmentRateLimit = createUserRateLimitMiddleware({ limit: 30 });
  router.use(requireCurrentConsent);

  router.get('/assistant', asyncRoute(async (req, res) => {
    const thread = await repository.getAssistantThread({ db: req.userDatabase, userId: req.auth.user.id });
    return res.json(thread);
  }));

  router.post('/assistant/consent', asyncRoute(async (req, res) => {
    const input = normalizeAssistantConsent(req.body);
    const result = await repository.recordAssistantConsent({ db: req.userDatabase, ...input });
    return res.json(result);
  }));

  router.post('/assistant/turns', assistantRateLimit, asyncRoute(async (req, res) => {
    const input = normalizeAssistantTurn(req.body);
    if (!assistantProvider?.configured) return res.status(503).json({ error: 'Trợ lý AI chưa được cấu hình.', code: 'ASSISTANT_UNAVAILABLE' });
    const request = await repository.beginAssistantTurn({ db: req.userDatabase, requestKey: input.clientMessageId, userMessage: input.message });
    if (!request.shouldGenerate) {
      const completed = request.turn.status === 'completed';
      return res.status(completed ? 200 : 202).json({ threadId: request.threadId, turn: request.turn, replayed: request.replayed });
    }

    try {
      const previous = await repository.getAssistantHistory({
        db: req.userDatabase, userId: req.auth.user.id, threadId: request.threadId, excludeTurnId: request.turn.id, limit: 12,
      });
      const assistantMessage = await assistantProvider.generateReply([
        ...previous,
        { role: 'user', content: request.turn.userMessage },
      ]);
      const turn = await repository.completeAssistantTurn({ db: req.userDatabase, turnId: request.turn.id, message: assistantMessage });
      return res.status(200).json({ threadId: request.threadId, turn, replayed: request.replayed });
    } catch (error) {
      try { await repository.failAssistantTurn({ db: req.userDatabase, turnId: request.turn.id }); }
      catch { /* The turn stays pending and can be recovered with the same idempotency key. */ }
      throw error;
    }
  }));

  router.get('/appointments/:appointmentId/messages', asyncRoute(async (req, res) => {
    if (!UUID.test(req.params.appointmentId)) return res.status(404).json({ error: 'Không tìm thấy hội thoại.', code: 'CHAT_NOT_FOUND' });
    const result = await repository.getAppointmentMessages({
      db: req.userDatabase, userId: req.auth.user.id, appointmentId: req.params.appointmentId.toLowerCase(),
    });
    if (!result) return res.status(404).json({ error: 'Không tìm thấy hội thoại.', code: 'CHAT_NOT_FOUND' });
    return res.json(result);
  }));

  router.post('/appointments/:appointmentId/messages', appointmentRateLimit, asyncRoute(async (req, res) => {
    if (!UUID.test(req.params.appointmentId)) return res.status(404).json({ error: 'Không tìm thấy hội thoại.', code: 'CHAT_NOT_FOUND' });
    const input = normalizeAppointmentMessage(req.body);
    const result = await repository.sendAppointmentMessage({
      db: req.userDatabase, userId: req.auth.user.id, appointmentId: req.params.appointmentId.toLowerCase(), ...input,
    });
    return res.status(result.replayed ? 200 : 201).json(result);
  }));

  return router;
}

module.exports = {
  AI_CONSENT_VERSION,
  MAX_MESSAGE_LENGTH,
  UUID,
  asyncRoute,
  createChatRouter,
  normalizeAppointmentMessage,
  normalizeAssistantConsent,
  normalizeAssistantTurn,
};
