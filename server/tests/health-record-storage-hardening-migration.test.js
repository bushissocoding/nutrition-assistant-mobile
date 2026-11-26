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

test('health record replacements use versioned paths and compare the expected current path', () => {
  const migration = path.join(__dirname, '../../supabase/migrations/202611270002_version_health_record_sources.sql');
  const sql = fs.readFileSync(migration, 'utf8');
  assert.match(sql, /file_path is not null and file_mime_type is not null and file_size is not null/i);
  assert.match(sql, /coalesce\(array_length\(v_folders,\s*1\),\s*0\)\s*=\s*2[\s\S]*v_filename\s*~\s*'\^\[0-9a-f\]/i);
  assert.match(sql, /create or replace function public\.replace_health_record_source\([\s\S]*returns text[\s\S]*for update/i);
  assert.match(sql, /v_previous_file_path is distinct from p_expected_file_path[\s\S]*errcode = '40001'/i);
  assert.match(sql, /drop policy if exists health_record_objects_update_own on storage\.objects/i);
  assert.match(sql, /revoke all on function public\.attach_health_record_source\(uuid, text, text, bigint\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.replace_health_record_source\(uuid, text, text, text, bigint\) to authenticated/i);
});

test('ambiguous health record uploads can be fenced before staged objects are removed', () => {
  const migration = path.join(__dirname, '../../supabase/migrations/202611270003_fence_health_record_source_uploads.sql');
  const sql = fs.readFileSync(migration, 'utf8');
  assert.match(sql, /add column file_source_version integer not null default 0/i);
  assert.match(sql, /select file_path, file_source_version[\s\S]*for update/i);
  assert.match(sql, /v_source_version is distinct from p_expected_source_version[\s\S]*errcode = '40001'/i);
  assert.match(sql, /file_source_version = file_source_version \+ 1/i);
  assert.match(sql, /create function public\.cancel_health_record_source_upload\([\s\S]*for update/i);
  assert.match(sql, /v_current_file_path = p_staged_file_path then return false/i);
  assert.match(sql, /grant execute on function public\.cancel_health_record_source_upload\(uuid, text, integer, text\) to authenticated/i);
});
