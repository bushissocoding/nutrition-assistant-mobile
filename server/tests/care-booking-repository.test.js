const test = require('node:test');
const assert = require('node:assert/strict');
const { createCareBookingRepository, toAppointment } = require('../src/repositories/care-booking-repository');

function createDb({ rows = {}, rpcResults = {} } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const query = { table, filters: [] };
      const record = { table, query };
      calls.push(record);
      for (const method of ['eq', 'gte', 'lt', 'ilike']) query[method] = (column, value) => { query.filters.push([method, column, value]); return query; };
      query.filters = [];
      record.filters = query.filters;
      query.or = value => { record.or = value; return query; };
      query.order = (column, options) => { record.orders = [...(record.orders || []), [column, options]]; return query; };
      query.range = (from, to) => { record.range = [from, to]; return Promise.resolve({ data: rows[table] || [], error: null, count: rows[`${table}:count`] ?? (rows[table] || []).length }); };
      query.limit = value => { record.limit = value; return query; };
      query.select = (columns, options) => { record.columns = columns; record.selectOptions = options; return query; };
      query.maybeSingle = async () => ({ data: rows[table] || null, error: null });
      query.single = async () => ({ data: rows[`${table}:insert`] || rows[table] || null, error: null });
      query.upsert = (input, options) => { record.upsert = input; record.upsertOptions = options; return query; };
      query.insert = input => { record.insert = input; return query; };
      query.delete = () => { record.delete = true; return query; };
      return query;
    },
    async rpc(name, args) { calls.push({ rpc: name, args }); return rpcResults[name] || { data: null, error: null }; },
  };
}

test('verified directory selects only public profile fields and scopes every filter to approved status', async () => {
  const db = createDb({ rows: { care_providers: [{ id: 'provider-1', user_id: 'private-user-id', display_name: 'Nguyễn An', specialty: 'Dinh dưỡng', bio: '', experience_years: 5, fee_vnd: 200000, verification_status: 'verified', license_number: 'must-not-leak' }], 'care_providers:count': 1 } });
  const result = await createCareBookingRepository().listVerifiedProviders({ db, query: 'Nguyễn An', specialty: '', limit: 10, offset: 0 });
  const query = db.calls[0];
  assert.equal(query.columns, 'id,display_name,specialty,bio,experience_years,fee_vnd,verification_status,verified_at');
  assert.deepEqual(query.filters, [['eq', 'verification_status', 'verified']]);
  assert.equal(query.or, 'display_name.ilike.%Nguyễn An%,specialty.ilike.%Nguyễn An%');
  assert.equal(result.items[0].displayName, 'Nguyễn An');
  assert.equal('userId' in result.items[0], false);
  assert.equal('licenseNumber' in result.items[0], false);
});

test('provider profile combines private credentials only for the owner query', async () => {
  const db = createDb({ rows: {
    care_providers: { id: 'provider-1', user_id: 'user-1', display_name: 'Nguyễn An', specialty: 'Dinh dưỡng', bio: '', experience_years: 4, fee_vnd: 200000, verification_status: 'pending' },
    care_provider_credentials: { provider_id: 'provider-1', user_id: 'user-1', license_number: 'ABC-1', region: 'VN', review_status: 'pending' },
  } });
  const result = await createCareBookingRepository().getProviderProfile({ db, userId: 'user-1' });
  assert.deepEqual(db.calls.map(call => call.filters), [
    [['eq', 'user_id', 'user-1']], [['eq', 'user_id', 'user-1']],
  ]);
  assert.equal(result.credentials.licenseNumber, 'ABC-1');
  assert.equal(result.verificationStatus, 'pending');
});

test('appointment create RPC binds identity, normalized intent, and owner-filters the returned row', async () => {
  const appointmentId = 'a2b4fefe-81fd-44f1-8be0-905e33f10b16';
  const db = createDb({ rows: { appointments: { id: appointmentId, patient_user_id: 'patient-1', provider_id: 'provider-1', status: 'awaiting_payment', provider_name: 'Nguyễn An', provider_specialty: 'Dinh dưỡng', fee_vnd: 200000, currency: 'VND', patient_name: 'Bình', patient_phone: '+84901234567', symptom_note: '', provider_sharing_accepted: true } }, rpcResults: { create_appointment_hold: { data: { id: appointmentId, replayed: true }, error: null } } });
  const result = await createCareBookingRepository().createAppointment({ db, userId: 'patient-1', input: { providerId: 'provider-1', slotId: 'slot-1', patientName: 'Bình', phone: '+84901234567', symptomNote: '', providerSharingAccepted: true }, requestKey: 'appointment-intent-1', requestHash: 'a'.repeat(64) });
  assert.equal(result.replayed, true);
  assert.equal(result.appointment.id, appointmentId);
  assert.deepEqual(db.calls[0], { rpc: 'create_appointment_hold', args: {
    p_provider_id: 'provider-1', p_slot_id: 'slot-1', p_request_key: 'appointment-intent-1', p_request_hash: 'a'.repeat(64),
    p_patient_name: 'Bình', p_patient_phone: '+84901234567', p_symptom_note: '', p_provider_sharing_accepted: true,
  } });
  assert.deepEqual(db.calls[1].filters, [['eq', 'id', appointmentId], ['eq', 'patient_user_id', 'patient-1']]);
  assert.equal('patientUserId' in result.appointment, false);
});

test('provider cancellation RPC requires provider actor and reloads within the provider scope', async () => {
  const appointmentId = 'a2b4fefe-81fd-44f1-8be0-905e33f10b16';
  const db = createDb({ rows: {
    care_providers: { id: 'provider-1', user_id: 'provider-user', verification_status: 'verified' },
    appointments: { id: appointmentId, provider_id: 'provider-1', status: 'cancelled', provider_name: 'Nguyễn An', provider_specialty: 'Dinh dưỡng', fee_vnd: 200000, currency: 'VND', patient_name: 'Bình', patient_phone: '+84901234567', symptom_note: '', provider_sharing_accepted: true },
  }, rpcResults: { cancel_care_appointment: { data: 'provider', error: null } } });
  const result = await createCareBookingRepository().cancelAppointment({ db, userId: 'provider-user', appointmentId, actor: 'provider', cancellation: { reason: 'other', note: '' } });
  assert.equal(result.actor, 'provider');
  assert.deepEqual(db.calls[0], { rpc: 'cancel_care_appointment', args: { p_appointment_id: appointmentId, p_reason: 'other', p_note: '', p_expected_actor: 'provider' } });
  assert.deepEqual(db.calls[2].filters, [['eq', 'id', appointmentId], ['eq', 'provider_id', 'provider-1']]);
});

test('appointment DTO omits auth identity and replay secrets', () => {
  const dto = toAppointment({ id: 'one', patient_user_id: 'patient-secret', request_key: 'private-key', request_hash: 'hash', provider_name: 'Dr', provider_specialty: 'Nutrition', status: 'confirmed', fee_vnd: 500, currency: 'VND' });
  assert.equal(dto.patientUserId, undefined);
  assert.equal(dto.requestKey, undefined);
  assert.equal(dto.requestHash, undefined);
});
