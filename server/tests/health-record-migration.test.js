const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

test('health record migration keeps result metadata owner-scoped and source objects private', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/202611240008_health_records.sql'), 'utf8');
  for (const table of ['health_records', 'health_record_results']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(sql, /values \('health-record-images', 'health-record-images', false, 8388608, array\['image\/jpeg', 'image\/png'\]\)/i);
  assert.match(sql, /user_id = \(select auth\.uid\(\)\)/i);
  assert.ok(sql.includes('(storage.foldername(name))[1] = (select auth.uid())::text'));
  assert.match(sql, /file_path = user_id::text \|\| '\/' \|\| id::text/i);
  assert.match(sql, /for delete to authenticated using[\s\S]*storage\.foldername\(name\)/i);
  assert.match(sql, /create or replace function public\.save_health_record[\s\S]*confirmed/i);
  assert.match(sql, /health_records_request_unique unique \(user_id, request_key\)/i);
  assert.match(sql, /on conflict \(user_id, request_key\) do update/i);
  assert.match(sql, /grant execute on function public\.delete_health_record\(uuid\) to authenticated/i);
});
