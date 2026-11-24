function validateEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  return /^[^\s@]{1,64}@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email) ? email : null;
}

function validateUsername(value) {
  const username = String(value ?? '').trim();
  return /^[A-Za-z0-9_.-]{3,30}$/.test(username) ? username : null;
}

function validatePassword(value, confirmation) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 72
    && (confirmation === undefined || value === confirmation);
}

function normalizeE164(value) {
  const phone = String(value ?? '').replace(/[\s().-]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

module.exports = { validateEmail, validateUsername, validatePassword, normalizeE164 };
