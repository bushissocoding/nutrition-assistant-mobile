const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MAX_HISTORY_ITEMS = 24;
const MAX_INPUT_LENGTH = 4000;
const MAX_OUTPUT_LENGTH = 4000;
const ASSISTANT_INSTRUCTIONS = [
  'Bạn là trợ lý hướng dẫn sử dụng ứng dụng dinh dưỡng, chỉ cung cấp thông tin tổng quát, không chẩn đoán bệnh, không đề xuất điều trị hoặc thay thế nhân viên y tế.',
  'Không suy đoán dữ liệu sức khỏe hoặc danh tính người dùng. Chỉ trả lời dựa trên nội dung hội thoại đã cung cấp; không khẳng định đã đọc hồ sơ, nhật ký, xét nghiệm hay đặt lịch.',
  'Nếu người dùng mô tả dấu hiệu cấp cứu như khó thở, đau ngực dữ dội, ngất hoặc phản ứng dị ứng nặng, khuyên họ liên hệ dịch vụ cấp cứu tại địa phương ngay.',
  'Nêu rõ khi không chắc chắn, trả lời ngắn gọn bằng tiếng Việt và không yêu cầu thông tin định danh.',
].join(' ');

class AssistantProviderError extends Error {
  constructor(message = 'Trợ lý AI tạm thời chưa khả dụng.', code = 'ASSISTANT_PROVIDER_UNAVAILABLE') {
    super(message);
    this.name = 'AssistantProviderError';
    this.code = code;
    this.status = 503;
  }
}

function extractResponseText(response) {
  if (typeof response?.output_text === 'string') {
    const text = response.output_text.trim();
    if (text && text.length <= MAX_OUTPUT_LENGTH) return text;
  }
  const chunks = [];
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const part of item.content) if (part?.type === 'output_text' && typeof part.text === 'string') chunks.push(part.text);
  }
  const text = chunks.join('\n').trim();
  if (!text || text.length > MAX_OUTPUT_LENGTH) throw new AssistantProviderError('Trợ lý AI trả về nội dung không hợp lệ.', 'ASSISTANT_PROVIDER_INVALID_RESPONSE');
  return text;
}

function validateHistory(history) {
  if (!Array.isArray(history) || history.length < 1 || history.length > MAX_HISTORY_ITEMS) {
    throw new AssistantProviderError('Lịch sử hội thoại không hợp lệ.', 'INVALID_ASSISTANT_HISTORY');
  }
  const normalized = history.map(item => {
    if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string'
      || !item.content.trim() || item.content.length > MAX_INPUT_LENGTH) {
      throw new AssistantProviderError('Lịch sử hội thoại không hợp lệ.', 'INVALID_ASSISTANT_HISTORY');
    }
    return { role: item.role, content: item.content.trim() };
  });
  if (normalized[normalized.length - 1].role !== 'user') throw new AssistantProviderError('Cần một tin nhắn người dùng mới.', 'INVALID_ASSISTANT_HISTORY');
  return normalized;
}

function createAssistantProvider({ config, fetchImpl = globalThis.fetch, timeoutMs = 12000 } = {}) {
  const configured = Boolean(config?.apiKey && config?.model);
  return {
    configured,
    async generateReply(history) {
      if (!configured) throw new AssistantProviderError('Trợ lý AI chưa được cấu hình.', 'ASSISTANT_UNAVAILABLE');
      if (typeof fetchImpl !== 'function') throw new AssistantProviderError();
      const input = validateHistory(history);
      let response;
      try {
        response = await fetchImpl(OPENAI_RESPONSES_URL, {
          method: 'POST',
          headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ model: config.model, instructions: ASSISTANT_INSTRUCTIONS, input, store: false, max_output_tokens: 500 }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new AssistantProviderError();
      }
      if (!response?.ok) throw new AssistantProviderError();
      let body;
      try { body = await response.json(); }
      catch { throw new AssistantProviderError('Trợ lý AI trả về dữ liệu không hợp lệ.', 'ASSISTANT_PROVIDER_INVALID_RESPONSE'); }
      return extractResponseText(body);
    },
  };
}

module.exports = {
  ASSISTANT_INSTRUCTIONS,
  AssistantProviderError,
  MAX_HISTORY_ITEMS,
  OPENAI_RESPONSES_URL,
  createAssistantProvider,
  extractResponseText,
  validateHistory,
};
