const CURRENT_CONSENT_VERSION = '2026-11-24-v1';
const CONSENT_KEYS = Object.freeze([
  'profile_processing',
  'nutrition_processing',
  'data_lifecycle',
  'ai_processing',
  'health_record_storage',
]);
const REQUIRED_CONSENT_KEYS = Object.freeze(['profile_processing', 'nutrition_processing', 'data_lifecycle']);

function parseConsentChoices(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const keys = Object.keys(input);
  if (keys.length !== CONSENT_KEYS.length || keys.some(key => !CONSENT_KEYS.includes(key))) return null;
  if (CONSENT_KEYS.some(key => typeof input[key] !== 'boolean')) return null;
  return Object.fromEntries(CONSENT_KEYS.map(key => [key, input[key]]));
}

function hasRequiredConsent(record) {
  return record?.version === CURRENT_CONSENT_VERSION
    && REQUIRED_CONSENT_KEYS.every(key => record.choices?.[key] === true);
}

async function readCurrentConsent(db, userId) {
  const { data, error } = await db.from('consent_records')
    .select('id,version,choices,accepted_at')
    .eq('user_id', userId)
    .order('accepted_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

module.exports = { CURRENT_CONSENT_VERSION, CONSENT_KEYS, REQUIRED_CONSENT_KEYS, parseConsentChoices, hasRequiredConsent, readCurrentConsent };
