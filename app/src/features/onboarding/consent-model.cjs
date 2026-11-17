const CONSENT_VERSION = 'demo-consent-v1-2026-11-17';

const CONSENT_CHOICES = Object.freeze([
  Object.freeze({
    key: 'local_profile_storage',
    label: 'Tôi đồng ý lưu hồ sơ ví dụ trên thiết bị này cho bản demo và hiểu rằng tôi có thể xóa hồ sơ đó trong ứng dụng.',
  }),
  Object.freeze({
    key: 'demo_api_processing',
    label: 'Tôi đồng ý gửi dị ứng, giới hạn dinh dưỡng, lựa chọn thực đơn, nhật ký và danh sách đi chợ đến API demo để xử lý các tính năng mẫu.',
  }),
  Object.freeze({
    key: 'demo_retention',
    label: 'Tôi đã đọc nơi lưu và giới hạn thời hạn lưu của dữ liệu demo; API hiện không có thời hạn xóa tự động.',
  }),
  Object.freeze({
    key: 'synthetic_data_only',
    label: 'Tôi chỉ dùng dữ liệu tổng hợp do tôi tự tạo, không nhập thông tin cá nhân hoặc hồ sơ sức khỏe thật.',
  }),
]);

const CONSENT_DISCLOSURE = Object.freeze([
  Object.freeze({
    title: 'Dữ liệu và mục đích',
    body: 'Hồ sơ có thể gồm tuổi, chiều cao, cân nặng, mức vận động, dị ứng, dấu hiệu hoặc ghi chú triệu chứng và khoảng dinh dưỡng bạn tự nhập. Ứng dụng dùng thông tin này để hiển thị hồ sơ và tạo kết quả thực đơn minh họa. Không nhập dữ liệu thật.',
  }),
  Object.freeze({
    title: 'Gửi tới đâu và ai nhận?',
    body: 'Hồ sơ được lưu trên thiết bị. Khi dùng tính năng liên quan, dị ứng và giới hạn dinh dưỡng cùng lựa chọn/ngân sách thực đơn được gửi tới API demo do người chạy ứng dụng cấu hình. Nhật ký bữa ăn và danh sách đi chợ cũng gửi tới API demo. Bản hiện tại không gửi dữ liệu tới dịch vụ AI/LLM bên ngoài và không có tài khoản người dùng.',
  }),
  Object.freeze({
    title: 'Lưu trữ và thời hạn',
    body: 'Hồ sơ và biên nhận lựa chọn được lưu trong SecureStore trên thiết bị này. Nếu API demo bật lưu trữ, nhật ký và danh sách đi chợ nằm trong tệp JSON phát triển của máy chủ theo namespace do ứng dụng gửi. Namespace này không phải tài khoản hay quyền sở hữu. Máy chủ chưa có thời hạn lưu tự động, sao lưu, hay dịch vụ lưu trữ/xóa production; dữ liệu demo có thể còn trong tệp máy chủ cho tới khi purge thành công hoặc người vận hành xóa tệp.',
  }),
  Object.freeze({
    title: 'Rút lựa chọn và xóa dữ liệu',
    body: 'Bạn có thể xem lại lựa chọn, rút lại và yêu cầu xóa dữ liệu demo trong ứng dụng. Ứng dụng chỉ xóa hồ sơ và lựa chọn trên thiết bị sau khi API xác nhận purge cả nhật ký và danh sách đi chợ. Nếu API lỗi hoặc không phản hồi, dữ liệu trên thiết bị được giữ nguyên để bạn thử lại. Đây không phải quy trình xóa tài khoản vì bản hiện tại chưa có tài khoản.',
  }),
  Object.freeze({
    title: 'Giới hạn của bản demo',
    body: 'Chỉ dùng giá trị giả lập. Gợi ý dinh dưỡng là ước tính, không phải chẩn đoán hay điều trị. Nội dung này mô tả cách prototype đang hoạt động, chưa được người phụ trách pháp lý/quyền riêng tư duyệt và không chứng minh tuân thủ pháp luật.',
  }),
]);

function createEmptyConsentChoices() {
  return Object.fromEntries(CONSENT_CHOICES.map(({ key }) => [key, false]));
}

function validateConsentChoices(choices) {
  const errors = {};
  const value = choices && typeof choices === 'object' && !Array.isArray(choices) ? choices : {};
  for (const { key } of CONSENT_CHOICES) {
    if (value[key] !== true) errors[key] = 'Cần chọn mục này để tiếp tục.';
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
    choices: Object.fromEntries(CONSENT_CHOICES.map(({ key }) => [key, true])),
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
