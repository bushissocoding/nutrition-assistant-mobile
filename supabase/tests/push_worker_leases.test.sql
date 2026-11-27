begin;

select plan(26);

select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'push_outbox' and column_name = 'lease_token'),
  'push outbox stores a lease fencing token');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'push_outbox' and column_name = 'delivery_started_at'),
  'push outbox records the point after which delivery outcome may be unknown');
select ok((select pg_get_constraintdef(oid) like '%delivery_unknown%' from pg_constraint where conname = 'push_outbox_status_check'),
  'outbox has a terminal unknown-delivery state');
select is(to_regprocedure('public.record_push_ticket(uuid,text,text)'), null::regprocedure,
  'unfenced ticket recorder is removed');
select ok(not has_function_privilege('anon', 'public.begin_push_delivery(uuid[],uuid[])', 'EXECUTE'),
  'anonymous users cannot start push delivery');
select ok(has_function_privilege('service_role', 'public.begin_push_delivery(uuid[],uuid[])', 'EXECUTE'),
  'only the server role can start push delivery');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('99990000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'push-lease@example.test', '{}'::jsonb, '{}'::jsonb);

insert into public.notification_devices (id, user_id, expo_push_token, platform) values
  ('88880000-0000-4000-8000-000000000001', '99990000-0000-4000-8000-000000000001', 'ExponentPushToken[push_lease_test_1]', 'ios'),
  ('88880000-0000-4000-8000-000000000002', '99990000-0000-4000-8000-000000000001', 'ExponentPushToken[push_lease_test_2]', 'ios'),
  ('88880000-0000-4000-8000-000000000003', '99990000-0000-4000-8000-000000000001', 'ExponentPushToken[push_lease_test_3]', 'ios');

insert into public.notifications (id, user_id, event_key, kind, title, body) values
  ('77770000-0000-4000-8000-000000000001', '99990000-0000-4000-8000-000000000001', 'push-lease-event-1', 'appointment', 'Notice', 'Synthetic notice.'),
  ('77770000-0000-4000-8000-000000000002', '99990000-0000-4000-8000-000000000001', 'push-lease-event-2', 'appointment', 'Notice', 'Synthetic notice.'),
  ('77770000-0000-4000-8000-000000000003', '99990000-0000-4000-8000-000000000001', 'push-lease-event-3', 'appointment', 'Notice', 'Synthetic notice.');

insert into public.push_outbox (id, notification_id, device_id) values
  ('66660000-0000-4000-8000-000000000001', '77770000-0000-4000-8000-000000000001', '88880000-0000-4000-8000-000000000001'),
  ('66660000-0000-4000-8000-000000000002', '77770000-0000-4000-8000-000000000002', '88880000-0000-4000-8000-000000000002'),
  ('66660000-0000-4000-8000-000000000003', '77770000-0000-4000-8000-000000000003', '88880000-0000-4000-8000-000000000003');

set local role service_role;

create temp table delivery_claims as select * from public.claim_push_outbox(10, 120);
select is((select count(*)::integer from delivery_claims), 3, 'claim returns all eligible delivery rows');
select ok((select bool_and(lease_token is not null) from delivery_claims), 'each claimed delivery has a unique fencing token');
select is(public.begin_push_delivery(
  (select array_agg(outbox_id order by outbox_id) from delivery_claims),
  (select array_agg(lease_token order by outbox_id) from delivery_claims)
), true, 'delivery begins only after the whole lease batch is fenced');
select is((select count(*)::integer from public.push_outbox where status = 'leased' and delivery_started_at is not null), 3,
  'all rows are marked as possibly sent before the network request');

select is(public.renew_push_outbox_lease('66660000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 120), false,
  'a stale token cannot renew a delivery lease');
select is(public.renew_push_outbox_lease(
  '66660000-0000-4000-8000-000000000001',
  (select lease_token from delivery_claims where outbox_id = '66660000-0000-4000-8000-000000000001'), 120
), true, 'the current owner can renew its delivery lease');

select public.record_push_ticket('66660000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'stale-ticket', null);
select is((select status from public.push_outbox where id = '66660000-0000-4000-8000-000000000001'), 'leased',
  'a stale worker cannot write a ticket');
select public.record_push_ticket(
  '66660000-0000-4000-8000-000000000001',
  (select lease_token from delivery_claims where outbox_id = '66660000-0000-4000-8000-000000000001'), null, 'PUSH_DELIVERY_UNKNOWN'
);
select is((select status from public.push_outbox where id = '66660000-0000-4000-8000-000000000001'), 'delivery_unknown',
  'an ambiguous provider response is never automatically retried');
select is((select last_error_code from public.push_outbox where id = '66660000-0000-4000-8000-000000000001'), 'PUSH_DELIVERY_UNKNOWN',
  'unknown delivery is identifiable for reconciliation');

select public.record_push_ticket(
  '66660000-0000-4000-8000-000000000002',
  (select lease_token from delivery_claims where outbox_id = '66660000-0000-4000-8000-000000000002'), 'ticket-2', null
);
select is((select status from public.push_outbox where id = '66660000-0000-4000-8000-000000000002'), 'ticketed',
  'a confirmed Expo ticket advances the outbox');

update public.push_outbox set lease_until = now() - interval '1 second' where id = '66660000-0000-4000-8000-000000000003';
create temp table after_uncertain_expiry as select * from public.claim_push_outbox(10, 120);
select is((select count(*)::integer from after_uncertain_expiry where outbox_id = '66660000-0000-4000-8000-000000000003'), 0,
  'an expired lease after a send began is not claimed again');
select is((select status from public.push_outbox where id = '66660000-0000-4000-8000-000000000003'), 'delivery_unknown',
  'worker crash after send began is reconciled as unknown instead of re-sent');

update public.push_outbox set next_attempt_at = now() where id = '66660000-0000-4000-8000-000000000002';
create temp table receipt_claims as select * from public.claim_push_receipts(10, 120);
select is((select count(*)::integer from receipt_claims), 1, 'ticketed rows are claimed for receipt checks');
select ok((select lease_token is not null from receipt_claims where outbox_id = '66660000-0000-4000-8000-000000000002'),
  'receipt claims have fencing tokens too');
select is(public.renew_push_receipt_lease('66660000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 120), false,
  'a stale token cannot renew a receipt lease');
select public.record_push_receipt('66660000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'ok', null);
select is((select status from public.push_outbox where id = '66660000-0000-4000-8000-000000000002'), 'checking_receipt',
  'a stale worker cannot write a receipt result');
select is(public.renew_push_receipt_lease(
  '66660000-0000-4000-8000-000000000002',
  (select lease_token from receipt_claims where outbox_id = '66660000-0000-4000-8000-000000000002'), 120
), true, 'the current owner can renew its receipt lease');
select public.record_push_receipt(
  '66660000-0000-4000-8000-000000000002',
  (select lease_token from receipt_claims where outbox_id = '66660000-0000-4000-8000-000000000002'), 'ok', null
);
select is((select status from public.push_outbox where id = '66660000-0000-4000-8000-000000000002'), 'receipt_ok',
  'the current owner can finish a receipt check');

insert into public.notification_devices (id, user_id, expo_push_token, platform)
values ('88880000-0000-4000-8000-000000000004', '99990000-0000-4000-8000-000000000001', 'ExponentPushToken[push_lease_test_4]', 'ios');
insert into public.notifications (id, user_id, event_key, kind, title, body)
values ('77770000-0000-4000-8000-000000000004', '99990000-0000-4000-8000-000000000001', 'push-lease-event-4', 'appointment', 'Notice', 'Synthetic notice.');
insert into public.push_outbox (id, notification_id, device_id)
values ('66660000-0000-4000-8000-000000000004', '77770000-0000-4000-8000-000000000004', '88880000-0000-4000-8000-000000000004');
create temp table retry_claim as select * from public.claim_push_outbox(10, 120);
update public.push_outbox set lease_until = now() - interval '1 second' where id = '66660000-0000-4000-8000-000000000004';
create temp table retry_reclaim as select * from public.claim_push_outbox(10, 120);
select is((select count(*)::integer from retry_reclaim where outbox_id = '66660000-0000-4000-8000-000000000004'), 1,
  'an expired lease before delivery begins can be retried');
select ok((select delivery_started_at is null and lease_token is not null from public.push_outbox where id = '66660000-0000-4000-8000-000000000004'),
  'a safe retry has a fresh token and no started marker');

reset role;
select * from finish();
rollback;
