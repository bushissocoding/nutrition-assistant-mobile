const CHAT_TURN_COLUMNS = 'id,request_key,user_message,assistant_message,status,created_at';
const APPOINTMENT_MESSAGE_COLUMNS = 'id,appointment_id,sender_user_id,client_message_id,body,created_at';

class ChatRepositoryError extends Error {
  constructor(message, status = 503, code = 'CHAT_UNAVAILABLE') { super(message); this.status = status; this.code = code; }
}

function mapChatError(error) {
  const message = String(error?.message || '');
  if (error?.code === '28000') return new ChatRepositoryError('Cần đăng nhập để tiếp tục.', 401, 'AUTHENTICATION_REQUIRED');
  if (error?.code === '42501' && message.includes('AI_ASSISTANT_CONSENT_REQUIRED')) return new ChatRepositoryError('Hãy xác nhận chia sẻ nội dung hội thoại với trợ lý AI trước khi gửi.', 403, 'AI_ASSISTANT_CONSENT_REQUIRED');
  if (error?.code === '42501') return new ChatRepositoryError('Không có quyền truy cập hội thoại này hoặc cần đồng ý hiện hành.', 403, 'CHAT_FORBIDDEN');
  if (error?.code === 'P0002') return new ChatRepositoryError('Không tìm thấy hội thoại hoặc lịch hẹn.', 404, 'CHAT_NOT_FOUND');
  if (error?.code === '22023') return new ChatRepositoryError('Nội dung hội thoại không hợp lệ.', 400, 'INVALID_CHAT_REQUEST');
  if (error?.code === '23505' && message.includes('IDEMPOTENCY_CONFLICT')) return new ChatRepositoryError('Mã tin nhắn đã được dùng với nội dung khác.', 409, 'CHAT_IDEMPOTENCY_CONFLICT');
  if (error?.code === '55000' && message.includes('APPOINTMENT_CHAT_UNAVAILABLE')) return new ChatRepositoryError('Lịch hẹn này không còn mở hội thoại.', 409, 'APPOINTMENT_CHAT_UNAVAILABLE');
  if (error?.code === '55000') return new ChatRepositoryError('Trạng thái hội thoại chưa cho phép thao tác này.', 409, 'CHAT_STATE_CONFLICT');
  return error;
}

function toAssistantTurn(row) {
  return {
    id: row.id,
    clientMessageId: row.request_key,
    userMessage: row.user_message,
    assistantMessage: row.assistant_message,
    status: row.status,
    createdAt: row.created_at,
  };
}

function toAppointmentMessage(row) {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    senderUserId: row.sender_user_id,
    clientMessageId: row.client_message_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

function createChatRepository() {
  return {
    async getAssistantThread({ db, userId }) {
      const { data: thread, error: threadError } = await db.rpc('get_or_create_assistant_thread');
      if (threadError) throw mapChatError(threadError);
      if (!thread || typeof thread.threadId !== 'string' || typeof thread.aiConsent !== 'boolean') throw new ChatRepositoryError('Không thể tải hội thoại trợ lý.');
      const { data, error } = await db.from('assistant_turns').select(CHAT_TURN_COLUMNS)
        .eq('user_id', userId).eq('thread_id', thread.threadId)
        .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(100);
      if (error) throw error;
      return { threadId: thread.threadId, aiConsent: thread.aiConsent, turns: (data || []).map(toAssistantTurn) };
    },

    async recordAssistantConsent({ db, version, accepted }) {
      const { data, error } = await db.rpc('record_assistant_ai_consent', { p_version: version, p_accepted: accepted });
      if (error) throw mapChatError(error);
      if (!data || typeof data.accepted !== 'boolean') throw new ChatRepositoryError('Không thể lưu lựa chọn trợ lý AI.');
      return data;
    },

    async beginAssistantTurn({ db, requestKey, userMessage }) {
      const { data, error } = await db.rpc('begin_assistant_turn', { p_request_key: requestKey, p_user_message: userMessage });
      if (error) throw mapChatError(error);
      if (!data?.turn || typeof data.threadId !== 'string' || typeof data.shouldGenerate !== 'boolean') throw new ChatRepositoryError('Máy chủ chưa xác nhận tin nhắn trợ lý.');
      return data;
    },

    async getAssistantHistory({ db, userId, threadId, excludeTurnId, limit = 12 }) {
      let query = db.from('assistant_turns').select(CHAT_TURN_COLUMNS).eq('user_id', userId)
        .eq('thread_id', threadId).eq('status', 'completed');
      if (excludeTurnId) query = query.neq('id', excludeTurnId);
      const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(Math.min(24, Math.max(1, limit)));
      if (error) throw error;
      return (data || []).reverse().flatMap(turn => [
        { role: 'user', content: turn.user_message },
        { role: 'assistant', content: turn.assistant_message },
      ]);
    },

    async completeAssistantTurn({ db, turnId, message }) {
      const { data, error } = await db.rpc('complete_assistant_turn', { p_turn_id: turnId, p_assistant_message: message });
      if (error) throw mapChatError(error);
      if (!data || typeof data.assistantMessage !== 'string') throw new ChatRepositoryError('Máy chủ chưa lưu câu trả lời trợ lý.');
      return toAssistantTurn({ ...data, request_key: data.requestKey, user_message: data.userMessage, assistant_message: data.assistantMessage, created_at: data.createdAt });
    },

    async failAssistantTurn({ db, turnId }) {
      const { error } = await db.rpc('fail_assistant_turn', { p_turn_id: turnId });
      if (error) throw mapChatError(error);
    },

    async getAppointmentMessages({ db, userId, appointmentId }) {
      const { data: appointment, error: appointmentError } = await db.from('appointments')
        .select('id,status,patient_user_id,provider_id').eq('id', appointmentId).maybeSingle();
      if (appointmentError) throw appointmentError;
      if (!appointment) return null;
      if (appointment.patient_user_id !== userId) {
        const { data: provider, error: providerError } = await db.from('care_providers').select('id')
          .eq('id', appointment.provider_id).eq('user_id', userId).eq('verification_status', 'verified').maybeSingle();
        if (providerError) throw providerError;
        if (!provider) return null;
      }
      if (!['confirmed', 'completed'].includes(appointment.status)) throw new ChatRepositoryError('Lịch hẹn này không còn mở hội thoại.', 409, 'APPOINTMENT_CHAT_UNAVAILABLE');
      const { data, error } = await db.from('appointment_messages').select(APPOINTMENT_MESSAGE_COLUMNS)
        .eq('appointment_id', appointmentId).order('created_at', { ascending: true }).order('id', { ascending: true }).limit(100);
      if (error) throw error;
      return { appointmentId, items: (data || []).map(toAppointmentMessage) };
    },

    async sendAppointmentMessage({ db, appointmentId, clientMessageId, body }) {
      const { data, error } = await db.rpc('send_appointment_message', {
        p_appointment_id: appointmentId, p_client_message_id: clientMessageId, p_body: body,
      });
      if (error) throw mapChatError(error);
      if (!data?.message || typeof data.replayed !== 'boolean') throw new ChatRepositoryError('Máy chủ chưa xác nhận tin nhắn.');
      return { message: toAppointmentMessage(data.message), replayed: data.replayed };
    },
  };
}

module.exports = { APPOINTMENT_MESSAGE_COLUMNS, CHAT_TURN_COLUMNS, ChatRepositoryError, createChatRepository, mapChatError, toAppointmentMessage, toAssistantTurn };
