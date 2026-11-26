const express = require('express');
const { CURRENT_CONSENT_VERSION, parseConsentChoices, readCurrentConsent } = require('../services/consent');

function toConsentDto(row) {
  return row ? { version: row.version, choices: row.choices, acceptedAt: row.accepted_at } : null;
}

function createConsentRouter() {
  const router = express.Router();
  router.get('/', async (req, res) => {
    try {
      const record = await readCurrentConsent(req.userDatabase, req.auth.user.id);
      return res.json({ consent: toConsentDto(record), currentVersion: CURRENT_CONSENT_VERSION });
    } catch {
      return res.status(503).json({ error: 'Không thể tải lựa chọn dữ liệu lúc này.', code: 'CONSENT_UNAVAILABLE' });
    }
  });

  router.put('/', async (req, res) => {
    const choices = parseConsentChoices(req.body?.choices);
    if (!choices) return res.status(400).json({ error: 'Các lựa chọn dữ liệu không hợp lệ.', code: 'INVALID_CONSENT' });
    try {
      const { data, error } = await req.userDatabase.from('consent_records')
        .insert({ user_id: req.auth.user.id, version: CURRENT_CONSENT_VERSION, choices })
        .select('id,version,choices,accepted_at')
        .single();
      if (error) throw error;
      return res.status(201).json({ consent: toConsentDto(data), currentVersion: CURRENT_CONSENT_VERSION });
    } catch {
      return res.status(503).json({ error: 'Không thể lưu lựa chọn dữ liệu lúc này.', code: 'CONSENT_UNAVAILABLE' });
    }
  });
  return router;
}

module.exports = { createConsentRouter, toConsentDto };
