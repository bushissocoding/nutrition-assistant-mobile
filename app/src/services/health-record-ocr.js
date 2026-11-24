import { getVisionAvailability, prepareVision, recognizeText } from 'expo-ai-kit';
import { MAX_RECORD_SOURCE_BYTES, parseLabCandidates, validateHealthRecordCandidates } from './health-record-ocr.cjs';

export async function recognizeLabImage(uri) {
  if (typeof uri !== 'string' || !uri) throw new Error('Không đọc được đường dẫn ảnh trên thiết bị.');
  const availability = await getVisionAvailability();
  const capability = availability?.textRecognition;
  if (capability?.status === 'unavailable') {
    const error = new Error(capability.reason === 'not-enabled'
      ? 'Bản cài đặt này chưa bật nhận diện văn bản. Hãy cài bản ứng dụng có hỗ trợ OCR.'
      : 'Thiết bị hiện không hỗ trợ nhận diện văn bản ngoại tuyến.');
    error.code = 'OCR_UNAVAILABLE';
    throw error;
  }
  await prepareVision({ features: ['text-recognition'] });
  const recognized = await recognizeText({ uri }, { recognitionLevel: 'accurate', minTextHeight: 0.008 });
  if (typeof recognized?.text !== 'string') throw new Error('Thiết bị không trích xuất được nội dung ảnh.');
  return { candidates: parseLabCandidates(recognized.text), extractedAt: new Date().toISOString() };
}

export { MAX_RECORD_SOURCE_BYTES, parseLabCandidates, validateHealthRecordCandidates };
