const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('chat migration keeps assistant data owner-scoped and appointment messages participant-scoped', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/202611240007_chat_assistant_messaging.sql'), 'utf8');
  for (const table of ['assistant_ai_consents', 'assistant_threads', 'assistant_turns', 'appointment_messages']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(sql, /assistant_threads_one_per_owner unique \(user_id\)/i);
  assert.match(sql, /assistant_turns_request_unique unique \(user_id, request_key\)/i);
  assert.match(sql, /appointment_messages_request_unique unique \(appointment_id, sender_user_id, client_message_id\)/i);
  assert.match(sql, /user_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /appointment\.patient_user_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /provider\.user_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /v_appointment\.status not in \('confirmed', 'completed'\)/i);
  assert.match(sql, /create or replace function public\.begin_assistant_turn/i);
  assert.match(sql, /assistant_ai_consents[\s\S]*?choice = 'accepted'/i);
  assert.match(sql, /create or replace function public\.send_appointment_message/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /on conflict \(appointment_id, sender_user_id, client_message_id\) do nothing/i);
  assert.match(sql, /revoke all on function public\.send_appointment_message[\s\S]*from public, anon/i);
  assert.match(sql, /grant execute on function public\.send_appointment_message[\s\S]*to authenticated/i);
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete|all)\s+on\s+public\.(assistant_turns|appointment_messages)\s+to\s+authenticated/i);
});
