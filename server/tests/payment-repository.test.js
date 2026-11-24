const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createPaymentRepository } = require('../src/repositories/payment-repository');

const userId = 'synthetic-user-1';
const appointmentId = 'synthetic-appointment-1';
const payment = {
  id: 'synthetic-payment-1', appointmentId, orderCode: 1800000001,
  amount: { value: 250000, currency: 'VND' }, status: 'creating_link', holdExpiresAt: '2026-11-24T00:20:00.000Z',
};

test('creates payment intent through the owner token RPC and passes no client amount', async () => {
  const calls = [];
  const repository = createPaymentRepository();
  const result = await repository.createIntent({
    db: { async rpc(name, args) { calls.push({ name, args }); return { data: { payment, replayed: false }, error: null }; } },
    appointmentId, idempotencyKey: 'appointment-payment-1',
  });
  assert.deepEqual(result, { payment, replayed: false });
  assert.deepEqual(calls, [{ name: 'create_appointment_payment_intent', args: { p_appointment_id: appointmentId, p_idempotency_key: 'appointment-payment-1' } }]);
  assert.equal(Object.hasOwn(calls[0].args, 'amount'), false);
});

test('reads payment with explicit patient and appointment owner filters and returns a safe DTO', async () => {
  const calls = [];
  function query(table) {
    const result = table === 'appointment_payments'
      ? { ...payment, appointment_id: appointmentId, order_code: '1800000001', amount_vnd: '250000', currency: 'VND', patient_user_id: userId, status: 'paid', payment_link_id: 'link-1', checkout_url: 'https://pay.payos.vn/web/link-1', qr_code: 'qr', provider_reference: 'ref', provider_transaction_at: '2026-11-24 10:00:00', link_created_at: '2026-11-24T00:01:00.000Z', paid_at: '2026-11-24T00:02:00.000Z', created_at: '2026-11-24T00:00:00.000Z', updated_at: '2026-11-24T00:02:00.000Z' }
      : { hold_expires_at: null, status: 'confirmed' };
    return {
      select(columns) { calls.push(['select', table, columns]); return this; },
      eq(key, value) { calls.push(['eq', table, key, value]); return this; },
      maybeSingle: async () => ({ data: result, error: null }),
    };
  }
  const repository = createPaymentRepository();
  const result = await repository.getOwnPayment({ db: {
    async rpc(name, args) { calls.push(['rpc', name, args]); return { data: null, error: null }; },
    from: table => query(table),
  }, userId, appointmentId });
  assert.equal(result.payment.status, 'paid');
  assert.equal(result.payment.amount.value, 250000);
  assert.equal(result.appointmentStatus, 'confirmed');
  assert.equal(JSON.stringify(result).includes(userId), false);
  assert.ok(calls.some(call => call[2] === 'patient_user_id' && call[3] === userId));
  assert.ok(calls.some(call => call[2] === 'appointment_id' && call[3] === appointmentId));
  assert.deepEqual(calls[0], ['rpc', 'expire_own_appointment_payment_hold', { p_appointment_id: appointmentId }]);
});

test('processes only normalized events through the server privileged database client', async () => {
  const calls = [];
  const repository = createPaymentRepository({ privilegedClient: { async rpc(name, args) { calls.push({ name, args }); return { data: 'paid', error: null }; } } });
  const event = { eventKey: 'a'.repeat(64), orderCode: 1800000001, paymentLinkId: 'link-1', reference: 'bank-ref', amount: 250000, currency: 'VND', eventCode: '00', success: true, transactionDateTime: null };
  assert.equal(await repository.processVerifiedEvent(event), 'paid');
  assert.equal(calls[0].name, 'process_payos_payment_event');
  assert.equal(calls[0].args.p_success, true);
});

test('payment migration isolates owner reads and limits transaction-writing RPCs to server role', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/202611240006_appointment_payments.sql'), 'utf8');
  for (const table of ['appointment_payments', 'payment_webhook_events']) assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  assert.match(sql, /appointment_payments_select_own[\s\S]*patient_user_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /appointment\.fee_vnd/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /amount_vnd <> p_amount_vnd/i);
  assert.match(sql, /payment_link_id is distinct from p_payment_link_id/i);
  assert.match(sql, /on conflict \(event_key\) do nothing returning id/i);
  assert.match(sql, /update public\.appointments set status = 'confirmed'/i);
  assert.match(sql, /grant execute on function public\.process_payos_payment_event[\s\S]*to service_role/i);
  assert.match(sql, /revoke all on function public\.process_payos_payment_event[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /expire_own_appointment_payment_hold[\s\S]*grant execute[\s\S]*to authenticated/i);
  assert.match(sql, /get_cancelled_appointment_payment_link[\s\S]*to service_role/i);
  assert.match(sql, /appointments set status = 'expired', hold_expires_at = null/i);
  assert.match(sql, /payment_id uuid references public\.appointment_payments \(id\) on delete cascade/i);
});
