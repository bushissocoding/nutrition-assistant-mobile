const BUCKET = 'health-record-images';
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MIME_TYPES = new Set(['image/jpeg', 'image/png']);
const RECORD_COLUMNS = 'id,user_id,title,source_date,note,file_path,file_mime_type,file_size,created_at,updated_at';
const RESULT_COLUMNS = 'id,record_id,name,value,unit,reference_range,created_at';

class HealthRecordError extends Error {
  constructor(message, status = 503, code = 'HEALTH_RECORD_UNAVAILABLE') { super(message); this.status = status; this.code = code; }
}

function mapHealthRecordError(error) {
  if (error?.status && error?.code) return error;
  if (error?.code === '28000') return new HealthRecordError('Cần đăng nhập để tiếp tục.', 401, 'AUTHENTICATION_REQUIRED');
  if (error?.code === '42501' && String(error.message || '').includes('HEALTH_RECORD_CONSENT_REQUIRED')) return new HealthRecordError('Hãy bật quyền lưu hồ sơ xét nghiệm trước khi tiếp tục.', 403, 'HEALTH_RECORD_CONSENT_REQUIRED');
  if (error?.code === '42501') return new HealthRecordError('Không có quyền truy cập hồ sơ này.', 403, 'HEALTH_RECORD_FORBIDDEN');
  if (error?.code === 'P0002') return new HealthRecordError('Không tìm thấy hồ sơ xét nghiệm.', 404, 'HEALTH_RECORD_NOT_FOUND');
  if (error?.code === '22023') return new HealthRecordError('Thông tin hồ sơ xét nghiệm không hợp lệ.', 400, 'INVALID_HEALTH_RECORD');
  return error;
}

function toResult(row) {
  return { id: row.id, name: row.name, value: row.value, unit: row.unit, referenceRange: row.reference_range, createdAt: row.created_at };
}

function toRecord(row, results = []) {
  return {
    id: row.id,
    title: row.title,
    sourceDate: row.source_date,
    note: row.note,
    source: row.file_path ? { available: true, mimeType: row.file_mime_type, size: Number(row.file_size) } : { available: false },
    results: results.map(toResult),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isValidImageBytes(bytes, mimeType) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 8 || bytes.length > MAX_SOURCE_BYTES || !MIME_TYPES.has(mimeType)) return false;
  if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function createHealthRecordRepository({ storageClient, signedUrlTtlSeconds = 60 } = {}) {
  async function readRecord({ db, userId, recordId }) {
    const { data, error } = await db.from('health_records').select(RECORD_COLUMNS).eq('id', recordId).eq('user_id', userId).maybeSingle();
    if (error) throw mapHealthRecordError(error);
    return data || null;
  }

  async function readResults({ db, userId, recordId }) {
    const { data, error } = await db.from('health_record_results').select(RESULT_COLUMNS)
      .eq('record_id', recordId).eq('user_id', userId).order('created_at', { ascending: true }).order('id', { ascending: true });
    if (error) throw mapHealthRecordError(error);
    return data || [];
  }

  return {
    async list({ db, userId, limit = 50, offset = 0 }) {
      const { data, error, count } = await db.from('health_records').select(RECORD_COLUMNS, { count: 'exact' })
        .eq('user_id', userId).order('source_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw mapHealthRecordError(error);
      const rows = data || [];
      const ids = rows.map(row => row.id);
      let resultRows = [];
      if (ids.length) {
        const result = await db.from('health_record_results').select(RESULT_COLUMNS).eq('user_id', userId).in('record_id', ids)
          .order('created_at', { ascending: true }).order('id', { ascending: true });
        if (result.error) throw mapHealthRecordError(result.error);
        resultRows = result.data || [];
      }
      return { items: rows.map(row => toRecord(row, resultRows.filter(result => result.record_id === row.id))), total: Number.isSafeInteger(count) ? count : 0, limit, offset };
    },

    async get({ db, userId, recordId }) {
      const row = await readRecord({ db, userId, recordId });
      if (!row) return null;
      return toRecord(row, await readResults({ db, userId, recordId }));
    },

    async save({ db, userId, input, recordId = null, requestKey = null }) {
      const { data: id, error } = await db.rpc('save_health_record', {
        p_record_id: recordId,
        p_request_key: requestKey,
        p_title: input.title,
        p_source_date: input.sourceDate,
        p_note: input.note,
        p_results: input.results,
      });
      if (error) throw mapHealthRecordError(error);
      const record = await this.get({ db, userId, recordId: id });
      if (!record) throw new HealthRecordError('Hồ sơ vừa lưu chưa thể tải lại.');
      return record;
    },

    async uploadSource({ db, userId, recordId, bytes, mimeType }) {
      if (!isValidImageBytes(bytes, mimeType)) throw new HealthRecordError('Ảnh phải là JPEG hoặc PNG hợp lệ, tối đa 8 MB.', 400, 'INVALID_HEALTH_RECORD_SOURCE');
      if (!storageClient?.storage?.from) throw new HealthRecordError('Kho hồ sơ riêng tư chưa được cấu hình.', 503, 'HEALTH_RECORD_STORAGE_UNAVAILABLE');
      const record = await readRecord({ db, userId, recordId });
      if (!record) throw new HealthRecordError('Không tìm thấy hồ sơ xét nghiệm.', 404, 'HEALTH_RECORD_NOT_FOUND');
      const path = `${userId}/${recordId}`;
      const bucket = storageClient.storage.from(BUCKET);
      const { error: uploadError } = await bucket.upload(path, bytes, { contentType: mimeType, cacheControl: '0', upsert: true });
      if (uploadError) throw new HealthRecordError('Không lưu được ảnh hồ sơ riêng tư. Bạn có thể thử tải lại.', 503, 'HEALTH_RECORD_UPLOAD_FAILED');
      const { error: attachError } = await db.rpc('attach_health_record_source', {
        p_record_id: recordId, p_file_path: path, p_mime_type: mimeType, p_file_size: bytes.length,
      });
      if (attachError) {
        await bucket.remove([path]).catch(() => undefined);
        throw mapHealthRecordError(attachError);
      }
      return this.get({ db, userId, recordId });
    },

    async getSourceUrl({ db, userId, recordId }) {
      const record = await readRecord({ db, userId, recordId });
      if (!record) return null;
      if (!record.file_path) throw new HealthRecordError('Hồ sơ này chưa có ảnh nguồn.', 404, 'HEALTH_RECORD_SOURCE_NOT_FOUND');
      if (!storageClient?.storage?.from) throw new HealthRecordError('Kho hồ sơ riêng tư chưa được cấu hình.', 503, 'HEALTH_RECORD_STORAGE_UNAVAILABLE');
      const { data, error } = await storageClient.storage.from(BUCKET).createSignedUrl(record.file_path, signedUrlTtlSeconds);
      if (error || typeof data?.signedUrl !== 'string') throw new HealthRecordError('Không thể tạo liên kết tải xuống tạm thời.', 503, 'HEALTH_RECORD_DOWNLOAD_FAILED');
      return { url: data.signedUrl, expiresInSeconds: signedUrlTtlSeconds, mimeType: record.file_mime_type };
    },

    async delete({ db, userId, recordId }) {
      const record = await readRecord({ db, userId, recordId });
      if (!record) return false;
      if (record.file_path) {
        if (!storageClient?.storage?.from) throw new HealthRecordError('Kho hồ sơ riêng tư chưa được cấu hình; hồ sơ chưa bị xóa.', 503, 'HEALTH_RECORD_STORAGE_UNAVAILABLE');
        const { error } = await storageClient.storage.from(BUCKET).remove([record.file_path]);
        if (error) throw new HealthRecordError('Không xóa được ảnh riêng tư; hồ sơ vẫn được giữ lại.', 503, 'HEALTH_RECORD_DELETE_FAILED');
      }
      const { error } = await db.rpc('delete_health_record', { p_record_id: recordId });
      if (error) throw mapHealthRecordError(error);
      return true;
    },
  };
}

module.exports = { BUCKET, MAX_SOURCE_BYTES, MIME_TYPES, HealthRecordError, createHealthRecordRepository, isValidImageBytes, mapHealthRecordError, toRecord, toResult };
