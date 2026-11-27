import { MAX_RECORD_SOURCE_BYTES, parseLabCandidates, validateHealthRecordCandidates } from './health-record-ocr.cjs';

export async function recognizeLabImage(uri) {
  if (typeof uri !== 'string' || !uri) throw new Error('Không đọc được đường dẫn ảnh trên thiết bị.');
  const error = new Error('Trình duyệt chưa hỗ trợ nhận diện chữ trên ảnh. Bạn có thể nhập thủ công các chỉ số đã xem lại.');
  error.code = 'OCR_UNAVAILABLE';
  throw error;
}

export { MAX_RECORD_SOURCE_BYTES, parseLabCandidates, validateHealthRecordCandidates };
