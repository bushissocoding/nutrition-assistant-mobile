const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('notification migration persists owner-only events and queues generic push events for real business changes', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/202611240009_notifications_push.sql'), 'utf8');
  for (const table of ['notification_preferences', 'notification_devices', 'notifications', 'push_outbox']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(sql, /notifications_select_own[\s\S]*user_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /unique \(user_id, event_key\)/i);
  assert.match(sql, /after insert or update of status on public\.appointments/i);
  assert.match(sql, /after insert or update of status on public\.appointment_payments/i);
  assert.match(sql, /after insert on public\.appointment_messages/i);
  assert.match(sql, /Bạn có thông báo mới\. Mở ứng dụng để xem\./i);
  assert.match(sql, /where device\.user_id = p_user_id and device\.status = 'active'/i);
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /DeviceNotRegistered[\s\S]*status = 'disabled'/i);
  assert.doesNotMatch(sql, /new\.body|new\.message|symptom_note/i);
  assert.match(sql, /grant execute on function public\.claim_push_outbox[\s\S]*to service_role/i);
});
