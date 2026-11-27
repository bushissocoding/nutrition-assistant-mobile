const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('push lease migration fences stale workers and parks unknown deliveries', () => {
  const root = path.join(__dirname, '../..');
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/202611270006_fence_push_worker_leases.sql'), 'utf8');
  const pgTap = fs.readFileSync(path.join(root, 'supabase/tests/push_worker_leases.test.sql'), 'utf8');

  assert.match(migration, /add column if not exists lease_token uuid/i);
  assert.match(migration, /add column if not exists delivery_started_at timestamptz/i);
  assert.match(migration, /status = 'delivery_unknown'[\s\S]*delivery_started_at is not null/i);
  assert.match(migration, /status = 'leased'[\s\S]*lease_token = p_lease_token[\s\S]*lease_until > now\(\)/i);
  assert.match(migration, /create or replace function public\.begin_push_delivery/i);
  assert.match(migration, /create or replace function public\.renew_push_outbox_lease/i);
  assert.match(migration, /create or replace function public\.renew_push_receipt_lease/i);
  assert.match(migration, /grant execute on function[\s\S]*to service_role/i);
  assert.match(pgTap, /select plan\(26\)/i);
  assert.match(pgTap, /worker crash after send began is reconciled as unknown instead of re-sent/i);
  assert.match(pgTap, /a stale worker cannot write a ticket/i);
  assert.match(pgTap, /a stale worker cannot write a receipt result/i);
});
