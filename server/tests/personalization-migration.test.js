const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('personalization migration keeps settings owner-scoped and writes through auth-bound validation', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/202611240010_personalization_preferences.sql'), 'utf8');
  assert.match(sql, /alter table public\.nutrition_preferences enable row level security/i);
  assert.match(sql, /nutrition_preferences_select_own[\s\S]*user_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /grant select on public\.nutrition_preferences to authenticated/i);
  assert.match(sql, /save_nutrition_preferences\(p_preferences jsonb\)[\s\S]*auth\.uid\(\)/i);
  assert.match(sql, /unique|distinct/i);
  assert.match(sql, /vegetarian.*low_sugar.*low_salt.*mild.*Vietnamese.*easy_cook/i);
  assert.doesNotMatch(sql, /grant (insert|update|delete) on public\.nutrition_preferences/i);
  assert.match(sql, /allergy_reminder boolean not null default true/i);
  assert.match(sql, /jsonb_typeof\(choice\.value\) is distinct from 'string'/i);
});
