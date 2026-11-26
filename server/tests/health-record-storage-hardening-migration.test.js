const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

test('health record storage paths are tied to owned records and uploads require current consent', () => {
  const migration = path.join(__dirname, '../../supabase/migrations/202611270001_harden_health_record_storage.sql');
  const sql = fs.readFileSync(migration, 'utf8');
  assert.match(sql, /create or replace function public\.owns_health_record_source_path\(p_object_name text\)/i);
  assert.match(sql, /coalesce\(array_length\(storage\.foldername\(p_object_name\),\s*1\),\s*0\)\s*=\s*1/i);
  assert.match(sql, /exists\s*\(\s*select 1 from public\.health_records[\s\S]*user_id\s*=\s*v_user/i);
  assert.match(sql, /create or replace function public\.can_upload_health_record_source\(p_object_name text\)[\s\S]*assert_health_record_consent/i);
  assert.match(sql, /create policy health_record_objects_select_own[\s\S]*owns_health_record_source_path\(name\)/i);
  assert.match(sql, /create policy health_record_objects_insert_own[\s\S]*can_upload_health_record_source\(name\)/i);
  assert.match(sql, /create policy health_record_objects_update_own[\s\S]*using[\s\S]*owns_health_record_source_path\(name\)[\s\S]*with check[\s\S]*can_upload_health_record_source\(name\)/i);
  assert.match(sql, /create policy health_record_objects_delete_own[\s\S]*owns_health_record_source_path\(name\)/i);
  assert.match(sql, /revoke all on function public\.owns_health_record_source_path\(text\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.can_upload_health_record_source\(text\) to authenticated/i);
});
