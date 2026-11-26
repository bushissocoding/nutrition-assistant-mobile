const { validIdempotencyKey } = require('./meal-plan-repository');

const PROVIDER_COLUMNS = 'id,user_id,display_name,specialty,bio,experience_years,fee_vnd,verification_status,verified_at,created_at,updated_at';
const CREDENTIAL_COLUMNS = 'provider_id,user_id,license_number,region,review_status,reviewed_at,created_at,updated_at';
const SLOT_COLUMNS = 'id,provider_id,starts_at,ends_at,status,created_at,updated_at';
const APPOINTMENT_COLUMNS = 'id,patient_user_id,provider_id,slot_id,provider_name,provider_specialty,starts_at,ends_at,fee_vnd,currency,status,request_key,request_hash,patient_name,patient_phone,symptom_note,provider_sharing_accepted,provider_sharing_version,provider_sharing_accepted_at,hold_expires_at,cancellation_reason,cancellation_note,created_at,updated_at';
const DIRECTORY_COLUMNS = 'id,display_name,specialty,bio,experience_years,fee_vnd,verification_status,verified_at';

class CareBookingRepositoryError extends Error {
  constructor(message, status = 503, code = 'CARE_BOOKING_UNAVAILABLE') {
    super(message);
    this.name = 'CareBookingRepositoryError';
    this.status = status;
    this.code = code;
  }
}

function toProvider(row, credential = null, includeOwner = false) {
  if (!row) return null;
  return {
    id: row.id,
    ...(includeOwner ? { userId: row.user_id } : {}),
    displayName: row.display_name,
    specialty: row.specialty,
    bio: row.bio,
    experienceYears: Number(row.experience_years),
    feeVnd: Number(row.fee_vnd),
    verificationStatus: row.verification_status,
    verifiedAt: row.verified_at,
    ...(credential ? { credentials: {
      licenseNumber: credential.license_number,
      region: credential.region,
      reviewStatus: credential.review_status,
      reviewedAt: credential.reviewed_at,
    } } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSlot(row) {
  return row ? { id: row.id, providerId: row.provider_id, startsAt: row.starts_at, endsAt: row.ends_at, status: row.status, createdAt: row.created_at } : null;
}

function toAppointment(row) {
  if (!row) return null;
  return {
    id: row.id,
    providerId: row.provider_id,
    slotId: row.slot_id,
    provider: { name: row.provider_name, specialty: row.provider_specialty },
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    amount: { value: Number(row.fee_vnd), currency: row.currency },
    status: row.status,
    patient: { name: row.patient_name, phone: row.patient_phone, preliminarySymptoms: row.symptom_note },
    providerSharing: { accepted: row.provider_sharing_accepted, version: row.provider_sharing_version, acceptedAt: row.provider_sharing_accepted_at },
    holdExpiresAt: row.hold_expires_at,
    cancellation: row.cancellation_reason ? { reason: row.cancellation_reason, note: row.cancellation_note } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCareError(error) {
  if (['42501'].includes(error?.code)) return new CareBookingRepositoryError('Không có quyền thực hiện thao tác này hoặc cần xác nhận đồng ý hiện hành.', 403, 'CARE_FORBIDDEN');
  if (error?.code === '28000') return new CareBookingRepositoryError('Cần đăng nhập để tiếp tục.', 401, 'AUTHENTICATION_REQUIRED');
  if (error?.code === '23505' && String(error.message || '').includes('IDEMPOTENCY_CONFLICT')) return new CareBookingRepositoryError('Mã yêu cầu đã được dùng với thông tin đặt lịch khác.', 409, 'IDEMPOTENCY_CONFLICT');
  if (error?.code === '23505') return new CareBookingRepositoryError('Khung giờ hoặc hồ sơ đã tồn tại.', 409, 'CARE_CONFLICT');
  if (error?.code === '23P01') return new CareBookingRepositoryError('Khung giờ vừa được đặt hoặc không còn trống.', 409, 'SLOT_UNAVAILABLE');
  if (error?.code === 'P0002') return new CareBookingRepositoryError('Không tìm thấy hồ sơ bác sĩ đã xác minh hoặc lịch hẹn.', 404, 'CARE_NOT_FOUND');
  if (error?.code === '55000' && String(error.message || '').includes('CANCELLATION_WINDOW_CLOSED')) return new CareBookingRepositoryError('Đã đóng thời hạn tự hủy trước lịch khám 24 giờ.', 409, 'CANCELLATION_WINDOW_CLOSED');
  if (error?.code === '55000') return new CareBookingRepositoryError('Trạng thái lịch hẹn hiện tại không cho phép thao tác này.', 409, 'APPOINTMENT_STATE_CONFLICT');
  if (error?.code === '22023') return new CareBookingRepositoryError('Dữ liệu lịch hẹn không hợp lệ.', 400, 'INVALID_CARE_INPUT');
  if (error?.code === '54000') return new CareBookingRepositoryError('Đã đạt giới hạn số khung giờ trong khoảng này.', 409, 'AVAILABILITY_LIMIT_REACHED');
  return error;
}

function createCareBookingRepository() {
  async function getProviderByUser(db, userId) {
    const { data, error } = await db.from('care_providers').select(PROVIDER_COLUMNS).eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function loadAppointment(db, appointmentId, ownerColumn, ownerId) {
    let query = db.from('appointments').select(APPOINTMENT_COLUMNS).eq('id', appointmentId);
    if (ownerColumn) query = query.eq(ownerColumn, ownerId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return toAppointment(data);
  }

  return {
    async getProviderProfile({ db, userId }) {
      const provider = await getProviderByUser(db, userId);
      if (!provider) return null;
      const { data: credential, error } = await db.from('care_provider_credentials').select(CREDENTIAL_COLUMNS).eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return toProvider(provider, credential, true);
    },

    async saveProviderApplication({ db, userId, profile, credentials }) {
      const { data: provider, error: providerError } = await db.from('care_providers')
        .upsert({ user_id: userId, display_name: profile.displayName, specialty: profile.specialty, bio: profile.bio, experience_years: profile.experienceYears, fee_vnd: profile.feeVnd }, { onConflict: 'user_id' })
        .select(PROVIDER_COLUMNS).single();
      if (providerError) throw providerError;
      const { data: credential, error: credentialError } = await db.from('care_provider_credentials')
        .upsert({ provider_id: provider.id, user_id: userId, license_number: credentials.licenseNumber, region: credentials.region }, { onConflict: 'provider_id' })
        .select(CREDENTIAL_COLUMNS).single();
      if (credentialError) throw credentialError;
      return toProvider(provider, credential, true);
    },

    async listVerifiedProviders({ db, query, specialty, limit, offset }) {
      let request = db.from('care_providers').select(DIRECTORY_COLUMNS, { count: 'exact' }).eq('verification_status', 'verified');
      if (query) request = request.or(`display_name.ilike.%${query}%,specialty.ilike.%${query}%`);
      if (specialty) request = request.ilike('specialty', `%${specialty}%`);
      const { data, error, count } = await request.order('display_name', { ascending: true }).order('id', { ascending: true }).range(offset, offset + limit - 1);
      if (error) throw error;
      return { items: (data || []).map(row => toProvider(row)), total: Number.isSafeInteger(count) ? count : 0, limit, offset };
    },

    async listAvailability({ db, providerId, from, to }) {
      const { error: releaseError } = await db.rpc('release_expired_appointment_holds', { p_provider_id: providerId });
      if (releaseError) throw mapCareError(releaseError);
      const { data, error } = await db.from('provider_availability').select(SLOT_COLUMNS)
        .eq('provider_id', providerId).eq('status', 'open').gte('starts_at', from).lt('starts_at', to)
        .order('starts_at', { ascending: true }).limit(500);
      if (error) throw error;
      return (data || []).map(toSlot);
    },

    async getProviderSlots({ db, userId, from, to }) {
      const provider = await getProviderByUser(db, userId);
      if (!provider) return { provider: null, slots: [] };
      const { data, error } = await db.from('provider_availability').select(SLOT_COLUMNS)
        .eq('provider_id', provider.id).gte('starts_at', from).lt('starts_at', to)
        .order('starts_at', { ascending: true }).limit(500);
      if (error) throw error;
      return { provider: toProvider(provider, null, true), slots: (data || []).map(toSlot) };
    },

    async createAvailability({ db, userId, slot }) {
      const provider = await getProviderByUser(db, userId);
      if (!provider || provider.verification_status !== 'verified') throw new CareBookingRepositoryError('Chỉ nhà cung cấp đã xác minh mới được mở lịch.', 403, 'PROVIDER_VERIFICATION_REQUIRED');
      const { data, error } = await db.from('provider_availability').insert({ provider_id: provider.id, starts_at: slot.startsAt, ends_at: slot.endsAt })
        .select(SLOT_COLUMNS).single();
      if (error) throw mapCareError(error);
      return toSlot(data);
    },

    async deleteAvailability({ db, userId, slotId }) {
      const provider = await getProviderByUser(db, userId);
      if (!provider) return false;
      const { data, error } = await db.from('provider_availability').delete().eq('id', slotId).eq('provider_id', provider.id).eq('status', 'open').select('id').maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },

    async createAppointment({ db, userId, input, requestKey, requestHash }) {
      if (!validIdempotencyKey(requestKey)) throw new CareBookingRepositoryError('Cần Idempotency-Key dài 8–128 ký tự ASCII.', 400, 'INVALID_IDEMPOTENCY_KEY');
      const { data: result, error } = await db.rpc('create_appointment_hold', {
        p_provider_id: input.providerId,
        p_slot_id: input.slotId,
        p_request_key: requestKey,
        p_request_hash: requestHash,
        p_patient_name: input.patientName,
        p_patient_phone: input.phone,
        p_symptom_note: input.symptomNote,
        p_provider_sharing_accepted: input.providerSharingAccepted,
      });
      if (error) throw mapCareError(error);
      if (!result || typeof result.id !== 'string' || typeof result.replayed !== 'boolean') throw new CareBookingRepositoryError('Máy chủ chưa xác nhận kết quả đặt lịch.');
      const appointment = await loadAppointment(db, result.id, 'patient_user_id', userId);
      if (!appointment) throw new CareBookingRepositoryError('Lịch hẹn vừa tạo chưa thể tải lại.');
      return { appointment, replayed: result.replayed };
    },

    async listPatientAppointments({ db, userId, limit, offset }) {
      const { data, error, count } = await db.from('appointments').select(APPOINTMENT_COLUMNS, { count: 'exact' })
        .eq('patient_user_id', userId).order('starts_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw error;
      return { items: (data || []).map(toAppointment), total: Number.isSafeInteger(count) ? count : 0, limit, offset };
    },

    async listProviderAppointments({ db, userId, limit, offset }) {
      const provider = await getProviderByUser(db, userId);
      if (!provider || provider.verification_status !== 'verified') throw new CareBookingRepositoryError('Tài khoản chưa có hồ sơ nhà cung cấp đã xác minh.', 403, 'PROVIDER_VERIFICATION_REQUIRED');
      const { data, error, count } = await db.from('appointments').select(APPOINTMENT_COLUMNS, { count: 'exact' })
        .eq('provider_id', provider.id).order('starts_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + limit - 1);
      if (error) throw error;
      return { items: (data || []).map(toAppointment), total: Number.isSafeInteger(count) ? count : 0, limit, offset };
    },

    async getPatientAppointment({ db, userId, appointmentId }) {
      return loadAppointment(db, appointmentId, 'patient_user_id', userId);
    },

    async cancelAppointment({ db, userId, appointmentId, cancellation, actor: expectedActor = 'patient' }) {
      const { data: actor, error } = await db.rpc('cancel_care_appointment', { p_appointment_id: appointmentId, p_reason: cancellation.reason, p_note: cancellation.note, p_expected_actor: expectedActor });
      if (error) throw mapCareError(error);
      const provider = actor === 'provider' ? await getProviderByUser(db, userId) : null;
      const ownerColumn = actor === 'provider' ? 'provider_id' : 'patient_user_id';
      const ownerId = actor === 'provider' ? provider?.id : userId;
      const appointment = await loadAppointment(db, appointmentId, ownerColumn, ownerId);
      if (!appointment) throw new CareBookingRepositoryError('Lịch hẹn vừa cập nhật chưa thể tải lại.');
      return { appointment, actor };
    },

    async completeAppointment({ db, userId, appointmentId }) {
      const { error } = await db.rpc('complete_care_appointment', { p_appointment_id: appointmentId });
      if (error) throw mapCareError(error);
      const provider = await getProviderByUser(db, userId);
      const appointment = await loadAppointment(db, appointmentId, 'provider_id', provider?.id);
      if (!appointment) throw new CareBookingRepositoryError('Lịch hẹn vừa cập nhật chưa thể tải lại.');
      return appointment;
    },
  };
}

module.exports = {
  APPOINTMENT_COLUMNS,
  CREDENTIAL_COLUMNS,
  DIRECTORY_COLUMNS,
  PROVIDER_COLUMNS,
  SLOT_COLUMNS,
  CareBookingRepositoryError,
  createCareBookingRepository,
  mapCareError,
  toAppointment,
  toProvider,
  toSlot,
};
