const CONSENT_VERSION = '2026-11-24-v1';

const CONSENT_CHOICES = Object.freeze([
  Object.freeze({
    key: 'profile_processing',
    required: true,
    label: 'Tôi đồng ý xử lý hồ sơ sức khỏe do tôi nhập để cung cấp chức năng tài khoản.',
  }),
  Object.freeze({
    key: 'nutrition_processing',
    required: true,
    label: 'Tôi đồng ý xử lý dị ứng, lựa chọn dinh dưỡng, bữa ăn và danh sách thực phẩm để cung cấp chức năng dinh dưỡng.',
  }),
  Object.freeze({
    key: 'data_lifecycle',
    required: true,
    label: 'Tôi đã đọc thông tin về nơi xử lý, lưu trữ, xuất và xóa dữ liệu tài khoản.',
  }),
  Object.freeze({
    key: 'ai_processing',
    required: false,
    label: 'Tùy chọn: Tôi đồng ý gửi ngữ cảnh dinh dưỡng đã chọn tới dịch vụ AI để tạo câu trả lời. Có thể rút lại riêng lựa chọn này.',
  }),
  Object.freeze({
    key: 'health_record_storage',
    required: false,
    label: 'Tùy chọn: Tôi đồng ý lưu hồ sơ khám và kết quả xét nghiệm trong vùng lưu trữ riêng của tài khoản.',
  }),
]);

const CONSENT_DISCLOSURE = Object.freeze([
  Object.freeze({
    title: 'Dữ liệu và mục đích',
    body: 'Hồ sơ có thể gồm tuổi, chiều cao, cân nặng, mức vận động, dị ứng, tình trạng bạn chọn, dấu hiệu hoặc ghi chú triệu chứng và khoảng dinh dưỡng do bạn tự nhập. Ứng dụng xử lý dữ liệu để cung cấp hồ sơ, nhật ký và tính năng dinh dưỡng. Nội dung không phải chẩn đoán hay điều trị.',
  }),
  Object.freeze({
    title: 'Gửi tới đâu và ai nhận?',
    body: 'Hồ sơ và biên nhận đồng ý gắn với tài khoản, được xử lý qua dịch vụ API và cơ sở dữ liệu do nhà vận hành cấu hình. Nội dung AI và hồ sơ khám chỉ được gửi/lưu nếu bạn bật lựa chọn tương ứng; các tính năng đó vẫn cần được cấu hình và kiểm tra riêng trước khi bật.',
  }),
  Object.freeze({
    title: 'Lưu trữ và thời hạn',
    body: 'Hồ sơ và biên nhận đồng ý được lưu trong cơ sở dữ liệu của tài khoản. Nhà vận hành triển khai phải công bố thời hạn lưu, nơi xử lý, sao lưu và đầu mối yêu cầu dữ liệu trước khi dùng dữ liệu thật; cấu hình ứng dụng không tự tạo ra thời hạn lưu hay bảo đảm pháp lý.',
  }),
  Object.freeze({
    title: 'Rút lựa chọn và xóa dữ liệu',
    body: 'Bạn có thể xem lại hoặc rút từng lựa chọn tùy chọn. Yêu cầu xuất hoặc xóa tài khoản phải được máy chủ xác nhận; quá trình xóa có thể cần thời gian để hoàn tất trên các dịch vụ liên kết.',
  }),
  Object.freeze({
    title: 'Giới hạn của bản demo',
    body: 'Thông tin dinh dưỡng chỉ mang tính tham khảo, không thay thế tư vấn chuyên môn. Chỉ bật tài khoản sản xuất sau khi nhà vận hành đã hoàn tất quyền dữ liệu, kiểm soát an toàn, bảo mật và đánh giá chuyên môn phù hợp.',
  }),
]);

function createEmptyConsentChoices() {
  return Object.fromEntries(CONSENT_CHOICES.map(({ key }) => [key, false]));
}

function validateConsentChoices(choices) {
  const errors = {};
  const value = choices && typeof choices === 'object' && !Array.isArray(choices) ? choices : {};
  for (const { key, required } of CONSENT_CHOICES) {
    if (typeof value[key] !== 'boolean') errors[key] = 'Lựa chọn không hợp lệ.';
    else if (required && value[key] !== true) errors[key] = 'Cần chọn mục này để tiếp tục.';
  }
  for (const key of Object.keys(value)) {
    if (!CONSENT_CHOICES.some(choice => choice.key === key)) errors[key] = 'Lựa chọn không được hỗ trợ.';
  }
  return errors;
}

function createConsentRecord(choices, acceptedAt = new Date()) {
  if (Object.keys(validateConsentChoices(choices)).length > 0) {
    throw new TypeError('All required consent choices must be accepted.');
  }
  const date = acceptedAt instanceof Date ? acceptedAt : new Date(acceptedAt);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Consent time must be a valid date.');
  return {
    version: CONSENT_VERSION,
    acceptedAt: date.toISOString(),
    choices: Object.fromEntries(CONSENT_CHOICES.map(({ key }) => [key, choices[key]])),
  };
}

function isCurrentConsentRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  if (record.version !== CONSENT_VERSION || typeof record.acceptedAt !== 'string') return false;
  const date = new Date(record.acceptedAt);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== record.acceptedAt) return false;
  return Object.keys(validateConsentChoices(record.choices)).length === 0;
}

module.exports = {
  CONSENT_CHOICES,
  CONSENT_DISCLOSURE,
  CONSENT_VERSION,
  createEmptyConsentChoices,
  createConsentRecord,
  isCurrentConsentRecord,
  validateConsentChoices,
};
