const { randomUUID } = require('node:crypto');
const BUCKET = 'health-record-images';
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MIME_TYPES = new Set(['image/jpeg', 'image/png']);
const SOURCE_LIST_PAGE_SIZE = 100;
const SOURCE_REMOVE_BATCH_SIZE = 100;
const VERSIONED_SOURCE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RECORD_COLUMNS = 'id,user_id,title,source_date,note,file_path,file_mime_type,file_size,file_source_version,created_at,updated_at';
const RESULT_COLUMNS = 'id,record_id,name,value,unit,reference_range,created_at';

class HealthRecordError extends Error {
  constructor(message, status = 503, code = 'HEALTH_RECORD_UNAVAILABLE') { super(message); this.status = status; this.code = code; }
}

function mapHealthRecordError(error) {
  if (error?.status && error?.code) return error;
  if (error?.code === '28000') return new HealthRecordError('Cần đăng nhập để tiếp tục.', 401, 'AUTHENTICATION_REQUIRED');
  if (error?.code === '42501' && String(error.message || '').includes('HEALTH_RECORD_CONSENT_REQUIRED')) return new HealthRecordError('Hãy bật quyền lưu hồ sơ xét nghiệm trước khi tiếp tục.', 403, 'HEALTH_RECORD_CONSENT_REQUIRED');
  if (error?.code === '42501') return new HealthRecordError('Không có quyền truy cập hồ sơ này.', 403, 'HEALTH_RECORD_FORBIDDEN');
  if (error?.code === '40001') return new HealthRecordError('Ảnh hồ sơ vừa được cập nhật ở nơi khác. Hãy tải lại hồ sơ trước khi thử lại.', 409, 'HEALTH_RECORD_SOURCE_CHANGED');
  if (error?.code === 'P0002') return new HealthRecordError('Không tìm thấy hồ sơ xét nghiệm.', 404, 'HEALTH_RECORD_NOT_FOUND');
  if (error?.code === '22023') return new HealthRecordError('Thông tin hồ sơ xét nghiệm không hợp lệ.', 400, 'INVALID_HEALTH_RECORD');
  return error;
}

function isDefinitiveDatabaseError(error) {
  return typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code);
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

async function removeRecordSources(bucket, userId, recordId) {
  const root = `${userId}/${recordId}`;
  let removedCount = 0;
  let noProgressPages = 0;
  while (true) {
    const { data, error } = await bucket.list(root, { limit: SOURCE_LIST_PAGE_SIZE, offset: 0 });
    if (error || !Array.isArray(data)) {
      throw new HealthRecordError('Hồ sơ đã xóa nhưng chưa thể liệt kê hết ảnh riêng tư để dọn.', 503, 'HEALTH_RECORD_DELETE_CLEANUP_FAILED');
    }
    if (!data.length) break;
    const paths = data.map(entry => {
      if (!entry || typeof entry.id !== 'string' || !VERSIONED_SOURCE_NAME.test(entry.name || '')) {
        throw new HealthRecordError('Hồ sơ đã xóa nhưng Storage trả về đường dẫn ảnh không hợp lệ.', 503, 'HEALTH_RECORD_DELETE_CLEANUP_FAILED');
      }
      return `${root}/${entry.name}`;
    });
    for (let index = 0; index < paths.length; index += SOURCE_REMOVE_BATCH_SIZE) {
      const { error: removeError, data: removed } = await bucket.remove(paths.slice(index, index + SOURCE_REMOVE_BATCH_SIZE));
      if (removeError) throw new HealthRecordError('Hồ sơ đã xóa nhưng chưa thể dọn ảnh riêng tư. Hãy thử xóa lại để hoàn tất.', 503, 'HEALTH_RECORD_DELETE_CLEANUP_FAILED');
      if (!Array.isArray(removed)) throw new HealthRecordError('Hồ sơ đã xóa nhưng Storage chưa xác nhận ảnh đã được dọn.', 503, 'HEALTH_RECORD_DELETE_CLEANUP_FAILED');
      if (removed.length === 0) noProgressPages += 1;
      else noProgressPages = 0;
      if (noProgressPages >= 2) throw new HealthRecordError('Hồ sơ đã xóa nhưng Storage chưa xác nhận ảnh đã được dọn.', 503, 'HEALTH_RECORD_DELETE_CLEANUP_FAILED');
      removedCount += removed.length;
    }
  }
  const { error: legacyRemoveError, data: legacyRemoved } = await bucket.remove([root]);
  if (legacyRemoveError) throw new HealthRecordError('Hồ sơ đã xóa nhưng chưa thể dọn ảnh riêng tư. Hãy thử xóa lại để hoàn tất.', 503, 'HEALTH_RECORD_DELETE_CLEANUP_FAILED');
  removedCount += Array.isArray(legacyRemoved) ? legacyRemoved.length : 0;
  return removedCount;
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
      const expectedSourceVersion = Number(record.file_source_version ?? 0);
      if (!Number.isSafeInteger(expectedSourceVersion) || expectedSourceVersion < 0) throw new HealthRecordError('Không thể xác nhận phiên bản ảnh hiện tại.', 503, 'HEALTH_RECORD_SOURCE_VERSION_INVALID');
      const path = `${userId}/${recordId}/${randomUUID()}`;
      const bucket = storageClient.storage.from(BUCKET);
      const removeStagedPath = async () => {
        try {
          const { error: cleanupError } = await bucket.remove([path]);
          if (cleanupError) throw cleanupError;
        } catch {
          throw new HealthRecordError('Ảnh đã tải lên nhưng chưa thể gắn vào hồ sơ. Hệ thống chưa xác nhận xóa ảnh; hãy thử lại sau.', 503, 'HEALTH_RECORD_UPLOAD_CLEANUP_FAILED');
        }
      };
      let uploadResult;
      try {
        uploadResult = await bucket.upload(path, bytes, { contentType: mimeType, cacheControl: '0', upsert: false });
      } catch {
        await removeStagedPath();
        throw new HealthRecordError('Không lưu được ảnh hồ sơ riêng tư. Bạn có thể thử tải lại.', 503, 'HEALTH_RECORD_UPLOAD_FAILED');
      }
      if (uploadResult?.error) {
        await removeStagedPath();
        throw new HealthRecordError('Không lưu được ảnh hồ sơ riêng tư. Bạn có thể thử tải lại.', 503, 'HEALTH_RECORD_UPLOAD_FAILED');
      }
      const finishCommittedAttach = async () => {
        if (record.file_path) {
          try {
            const { error: cleanupError } = await bucket.remove([record.file_path]);
            if (cleanupError) throw cleanupError;
          } catch {
            throw new HealthRecordError('Ảnh mới đã được gắn vào hồ sơ nhưng chưa xác nhận xóa ảnh cũ. Hãy thử lại sau.', 503, 'HEALTH_RECORD_PREVIOUS_SOURCE_CLEANUP_FAILED');
          }
        }
        return this.get({ db, userId, recordId });
      };
      const reconcileAmbiguousAttach = async () => {
        const current = await readRecord({ db, userId, recordId }).catch(() => null);
        if (current?.file_path === path) return finishCommittedAttach();
        for (let attempt = 0; attempt < 2; attempt += 1) {
          let cancelResult;
          try {
            cancelResult = await db.rpc('cancel_health_record_source_upload', {
              p_record_id: recordId,
              p_expected_file_path: record.file_path,
              p_expected_source_version: expectedSourceVersion,
              p_staged_file_path: path,
            });
          } catch {
            continue;
          }
          if (cancelResult?.error) continue;
          if (cancelResult?.data === true) {
            await removeStagedPath();
            throw new HealthRecordError('Ảnh chưa được gắn vào hồ sơ. Hãy thử tải lại.', 503, 'HEALTH_RECORD_SOURCE_ATTACH_FAILED');
          }
          const latest = await readRecord({ db, userId, recordId }).catch(() => null);
          if (latest?.file_path === path) return finishCommittedAttach();
        }
        throw new HealthRecordError('Chưa xác định được ảnh đã gắn vào hồ sơ hay chưa. Ảnh được giữ an toàn; hãy tải lại hồ sơ trước khi thử lại.', 503, 'HEALTH_RECORD_SOURCE_ATTACH_UNCERTAIN');
      };
      let attachResult;
      try {
        attachResult = await db.rpc('replace_health_record_source', {
          p_record_id: recordId, p_expected_file_path: record.file_path,
          p_expected_source_version: expectedSourceVersion, p_file_path: path,
          p_mime_type: mimeType, p_file_size: bytes.length,
        });
      } catch {
        // The RPC may have committed despite its response being lost.
        // Fence its captured source version before removing the staged object.
        return reconcileAmbiguousAttach();
      }
      if (!attachResult || typeof attachResult !== 'object' || !('data' in attachResult || 'error' in attachResult)) {
        return reconcileAmbiguousAttach();
      }
      const { data: previousPath, error: attachError } = attachResult || {};
      if (attachError) {
        if (!isDefinitiveDatabaseError(attachError)) return reconcileAmbiguousAttach();
        await removeStagedPath();
        throw mapHealthRecordError(attachError);
      }
      if (typeof previousPath === 'string' && previousPath !== path) {
        try {
          const { error: cleanupError } = await bucket.remove([previousPath]);
          if (cleanupError) throw cleanupError;
        } catch {
          throw new HealthRecordError('Ảnh mới đã được gắn vào hồ sơ nhưng chưa xác nhận xóa ảnh cũ. Hãy thử lại sau.', 503, 'HEALTH_RECORD_PREVIOUS_SOURCE_CLEANUP_FAILED');
        }
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
      if (!storageClient?.storage?.from) {
        if (!record) return false;
        throw new HealthRecordError('Kho hồ sơ riêng tư chưa được cấu hình; hồ sơ chưa bị xóa.', 503, 'HEALTH_RECORD_STORAGE_UNAVAILABLE');
      }
      if (record) {
        let deleteResult;
        try {
          deleteResult = await db.rpc('delete_health_record', { p_record_id: recordId });
        } catch {
          const current = await readRecord({ db, userId, recordId }).catch(() => undefined);
          if (current !== null) throw new HealthRecordError('Chưa xác định được hồ sơ đã xóa hay chưa. Ảnh vẫn được giữ an toàn; hãy tải lại trước khi thử lại.', 503, 'HEALTH_RECORD_DELETE_UNCERTAIN');
        }
        if (deleteResult?.error) {
          if (isDefinitiveDatabaseError(deleteResult.error) && deleteResult.error.code !== 'P0002') throw mapHealthRecordError(deleteResult.error);
          const current = await readRecord({ db, userId, recordId }).catch(() => undefined);
          if (current !== null) {
            if (isDefinitiveDatabaseError(deleteResult.error)) throw mapHealthRecordError(deleteResult.error);
            throw new HealthRecordError('Chưa xác định được hồ sơ đã xóa hay chưa. Ảnh vẫn được giữ an toàn; hãy tải lại trước khi thử lại.', 503, 'HEALTH_RECORD_DELETE_UNCERTAIN');
          }
        }
      }
      const removedCount = await removeRecordSources(storageClient.storage.from(BUCKET), userId, recordId);
      return Boolean(record) || removedCount > 0;
    },
  };
}

module.exports = { BUCKET, MAX_SOURCE_BYTES, MIME_TYPES, HealthRecordError, createHealthRecordRepository, isValidImageBytes, mapHealthRecordError, toRecord, toResult };
