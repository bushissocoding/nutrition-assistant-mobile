const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  CareBookingValidationError,
  normalizeAvailabilitySlot,
  normalizeBookingInput,
  normalizeCancelInput,
  normalizeProviderCredentials,
  normalizeProviderProfile,
  appointmentRequestHash,
  canTransitionAppointment,
} = require('../src/services/care-bookings');

const now = new Date('2026-11-24T00:00:00.000Z');
const providerId = '82b4fefe-81fd-44f1-8be0-905e33f10b16';
const slotId = '92b4fefe-81fd-44f1-8be0-905e33f10b16';

test('normalizes bounded provider profile fields and rejects attempts to self-verify', () => {
  assert.deepEqual(normalizeProviderProfile({ displayName: ' Nguyễn An ', specialty: 'Dinh dưỡng', bio: 'Tư vấn', experienceYears: 4, feeVnd: 250000 }), {
    displayName: 'Nguyễn An', specialty: 'Dinh dưỡng', bio: 'Tư vấn', experienceYears: 4, feeVnd: 250000,
  });
  assert.throws(() => normalizeProviderProfile({ displayName: 'Nguyễn An', specialty: 'Dinh dưỡng', bio: '', experienceYears: 4, feeVnd: 250000, status: 'verified' }), CareBookingValidationError);
  assert.throws(() => normalizeProviderProfile({ displayName: '', specialty: 'Dinh dưỡng', bio: '', experienceYears: 4, feeVnd: 250000 }), /Tên/);
});

test('requires explicit bounded provider qualification details', () => {
  assert.deepEqual(normalizeProviderCredentials({ licenseNumber: ' DD-123 ', region: 'Việt Nam' }), { licenseNumber: 'DD-123', region: 'Việt Nam' });
  assert.throws(() => normalizeProviderCredentials({ licenseNumber: 'DD-123', region: 'Việt Nam', verificationStatus: 'verified' }), CareBookingValidationError);
  assert.throws(() => normalizeProviderCredentials({ licenseNumber: '', region: 'Việt Nam' }), CareBookingValidationError);
});

test('availability accepts only future UTC half-hour slots inside the 90-day window', () => {
  assert.deepEqual(normalizeAvailabilitySlot({ startsAt: '2026-11-25T09:00:00.000Z', endsAt: '2026-11-25T09:30:00.000Z' }, { now }), {
    startsAt: '2026-11-25T09:00:00.000Z', endsAt: '2026-11-25T09:30:00.000Z',
  });
  assert.throws(() => normalizeAvailabilitySlot({ startsAt: '2026-11-25T09:00:00+07:00', endsAt: '2026-11-25T09:30:00+07:00' }, { now }), CareBookingValidationError);
  assert.throws(() => normalizeAvailabilitySlot({ startsAt: '2026-11-25T09:00:00.000Z', endsAt: '2026-11-25T10:00:00.000Z' }, { now }), CareBookingValidationError);
  assert.throws(() => normalizeAvailabilitySlot({ startsAt: '2027-03-01T09:00:00.000Z', endsAt: '2027-03-01T09:30:00.000Z' }, { now }), CareBookingValidationError);
});

test('booking requires valid patient details and explicit provider disclosure consent', () => {
  const input = { providerId, slotId, patientName: ' Nguyễn An ', phone: '+84901234567', symptomNote: 'Mệt sau bữa ăn', providerSharingAccepted: true };
  assert.deepEqual(normalizeBookingInput(input), { providerId, slotId, patientName: 'Nguyễn An', phone: '+84901234567', symptomNote: 'Mệt sau bữa ăn', providerSharingAccepted: true });
  assert.throws(() => normalizeBookingInput({ ...input, providerSharingAccepted: false }), CareBookingValidationError);
  assert.throws(() => normalizeBookingInput({ ...input, ownerId: providerId }), CareBookingValidationError);
  assert.throws(() => normalizeBookingInput({ ...input, phone: '0901234567' }), CareBookingValidationError);
  assert.throws(() => normalizeBookingInput({ ...input, symptomNote: 'x'.repeat(1001) }), CareBookingValidationError);
});

test('appointment intent hash is stable and state transitions reject client-side payment confirmation', () => {
  const input = normalizeBookingInput({ providerId, slotId, patientName: 'Nguyễn An', phone: '+84901234567', symptomNote: '', providerSharingAccepted: true });
  assert.equal(appointmentRequestHash(input), appointmentRequestHash({ ...input }));
  assert.notEqual(appointmentRequestHash(input), appointmentRequestHash({ ...input, symptomNote: 'Khác' }));
  assert.equal(canTransitionAppointment('awaiting_payment', 'cancelled', 'patient'), true);
  assert.equal(canTransitionAppointment('confirmed', 'completed', 'provider'), true);
  assert.equal(canTransitionAppointment('confirmed', 'cancelled', 'patient'), true);
  assert.equal(canTransitionAppointment('awaiting_payment', 'confirmed', 'patient'), false);
  assert.equal(canTransitionAppointment('completed', 'confirmed', 'provider'), false);
  assert.equal(canTransitionAppointment('cancelled', 'completed', 'provider'), false);
});

test('cancellation input accepts a known reason and bounded note only', () => {
  assert.deepEqual(normalizeCancelInput({ reason: 'schedule-change', note: 'Chọn ngày khác' }), { reason: 'schedule-change', note: 'Chọn ngày khác' });
  assert.throws(() => normalizeCancelInput({ reason: 'other', note: 'x'.repeat(501) }), CareBookingValidationError);
  assert.throws(() => normalizeCancelInput({ reason: 'schedule-change', status: 'confirmed' }), CareBookingValidationError);
});

test('care migration protects private tables, prevents self-verification and serializes reservations', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/202611240005_care_bookings.sql'), 'utf8');
  for (const table of ['care_providers', 'care_provider_credentials', 'provider_availability', 'appointments']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(migration, /grant insert \(user_id, display_name, specialty, bio, experience_years, fee_vnd\) on public\.care_providers to authenticated/i);
  assert.doesNotMatch(migration, /grant\s+(insert|update|all)\s+on\s+public\.care_providers\s+to\s+authenticated/i);
  assert.match(migration, /verification_status = 'pending'/i);
  assert.match(migration, /public\.has_current_care_consent\(\(select auth\.uid\(\)\)\)/i);
  assert.match(migration, /order by consent\.accepted_at desc, consent\.id desc\s+limit 1/i);
  assert.match(migration, /slot public\.provider_availability%rowtype[\s\S]*?for update;/i);
  assert.match(migration, /appointments_patient_request_unique unique \(patient_user_id, request_key\)/i);
  assert.match(migration, /provider_sharing_accepted_at timestamptz not null default now\(\)/i);
  assert.match(migration, /grant execute on function public\.create_appointment_hold[\s\S]*to authenticated/i);
  assert.match(migration, /revoke all on function public\.create_appointment_hold[\s\S]*from public, anon/i);
  assert.match(migration, /p_expected_actor text/i);
  assert.ok(migration.split(/\r?\n/).some(line => line.includes("p_patient_phone !~ '^\\+[1-9][0-9]{7,14}$'")));
  assert.equal(migration.split(/\r?\n/).some(line => line.includes("p_patient_phone !~ '^\\\\+")), false);
});
