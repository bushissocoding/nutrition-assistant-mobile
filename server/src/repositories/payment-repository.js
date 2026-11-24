const PAYMENT_COLUMNS = 'id,appointment_id,patient_user_id,order_code,amount_vnd,currency,status,idempotency_key,payment_link_id,checkout_url,qr_code,provider_reference,provider_transaction_at,link_created_at,paid_at,created_at,updated_at';
const PAYMENT_PUBLIC_COLUMNS = 'id,appointment_id,order_code,amount_vnd,currency,status,payment_link_id,checkout_url,qr_code,provider_reference,provider_transaction_at,link_created_at,paid_at,created_at,updated_at';

class PaymentRepositoryError extends Error {
  constructor(message, status = 503, code = 'PAYMENT_UNAVAILABLE') { super(message); this.status = status; this.code = code; }
}

function toPayment(row, holdExpiresAt = null) {
  if (!row) return null;
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    orderCode: Number(row.order_code),
    amount: { value: Number(row.amount_vnd), currency: row.currency },
    status: row.status,
    paymentLinkId: row.payment_link_id,
    checkoutUrl: row.checkout_url,
    qrCode: row.qr_code,
    providerReference: row.provider_reference,
    providerTransactionAt: row.provider_transaction_at,
    linkCreatedAt: row.link_created_at,
    paidAt: row.paid_at,
    holdExpiresAt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPaymentError(error) {
  if (error?.code === '42501') return new PaymentRepositoryError('Không có quyền thanh toán lịch hẹn này hoặc cần đồng ý hiện hành.', 403, 'PAYMENT_FORBIDDEN');
  if (error?.code === '28000') return new PaymentRepositoryError('Cần đăng nhập để tiếp tục.', 401, 'AUTHENTICATION_REQUIRED');
  if (error?.code === 'P0002') return new PaymentRepositoryError('Không tìm thấy lịch hẹn hoặc thanh toán.', 404, 'PAYMENT_NOT_FOUND');
  if (error?.code === '23505' && String(error.message || '').includes('PAYMENT_IDEMPOTENCY_CONFLICT')) return new PaymentRepositoryError('Mã yêu cầu thanh toán đã được dùng khác nội dung.', 409, 'PAYMENT_IDEMPOTENCY_CONFLICT');
  if (error?.code === '55000' && String(error.message || '').includes('APPOINTMENT_PAYMENT_WINDOW_CLOSED')) return new PaymentRepositoryError('Giữ chỗ đã hết hạn hoặc không còn chờ thanh toán.', 409, 'PAYMENT_WINDOW_CLOSED');
  if (error?.code === '55000') return new PaymentRepositoryError('Trạng thái thanh toán chưa cho phép thao tác này.', 409, 'PAYMENT_STATE_CONFLICT');
  if (error?.code === '22023') return new PaymentRepositoryError('Yêu cầu thanh toán không hợp lệ.', 400, 'INVALID_PAYMENT_REQUEST');
  return error;
}

function createPaymentRepository({ privilegedClient } = {}) {
  return {
    async createIntent({ db, appointmentId, idempotencyKey }) {
      const { data, error } = await db.rpc('create_appointment_payment_intent', { p_appointment_id: appointmentId, p_idempotency_key: idempotencyKey });
      if (error) throw mapPaymentError(error);
      if (!data?.payment || typeof data.payment.id !== 'string' || typeof data.replayed !== 'boolean') throw new PaymentRepositoryError('Máy chủ chưa xác nhận yêu cầu thanh toán.');
      return { payment: data.payment, replayed: data.replayed };
    },

    async finishLink({ paymentId, link }) {
      if (!privilegedClient) throw new PaymentRepositoryError('Không thể lưu trạng thái liên kết thanh toán.');
      const { error } = await privilegedClient.rpc('finish_appointment_payment_link', {
        p_payment_id: paymentId, p_payment_link_id: link.paymentLinkId, p_checkout_url: link.checkoutUrl, p_qr_code: link.qrCode,
      });
      if (error) throw mapPaymentError(error);
    },

    async markReconciliationRequired({ paymentId }) {
      if (!privilegedClient) return;
      const { error } = await privilegedClient.rpc('mark_appointment_payment_reconciliation', { p_payment_id: paymentId });
      if (error) throw mapPaymentError(error);
    },

    async getCancelledPaymentLink({ appointmentId }) {
      if (!privilegedClient) return null;
      const { data, error } = await privilegedClient.rpc('get_cancelled_appointment_payment_link', { p_appointment_id: appointmentId });
      if (error) throw mapPaymentError(error);
      if (!data) return null;
      if (!Number.isSafeInteger(data.orderCode) || typeof data.paymentLinkId !== 'string') throw new PaymentRepositoryError('Thông tin liên kết cần hủy không hợp lệ.');
      return { orderCode: data.orderCode, paymentLinkId: data.paymentLinkId };
    },

    async getOwnPayment({ db, userId, appointmentId }) {
      const { error: expiryError } = await db.rpc('expire_own_appointment_payment_hold', { p_appointment_id: appointmentId });
      if (expiryError) throw mapPaymentError(expiryError);
      const { data, error } = await db.from('appointment_payments').select(PAYMENT_PUBLIC_COLUMNS)
        .eq('patient_user_id', userId).eq('appointment_id', appointmentId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: appointment, error: appointmentError } = await db.from('appointments').select('hold_expires_at,status')
        .eq('patient_user_id', userId).eq('id', appointmentId).maybeSingle();
      if (appointmentError) throw appointmentError;
      return { payment: toPayment(data, appointment?.hold_expires_at || null), appointmentStatus: appointment?.status || null };
    },

    async processVerifiedEvent(event) {
      if (!privilegedClient) throw new PaymentRepositoryError('Xử lý thanh toán chưa được cấu hình.');
      const { data, error } = await privilegedClient.rpc('process_payos_payment_event', {
        p_event_key: event.eventKey,
        p_order_code: event.orderCode,
        p_payment_link_id: event.paymentLinkId,
        p_reference: event.reference,
        p_amount_vnd: event.amount,
        p_currency: event.currency,
        p_event_code: event.eventCode,
        p_success: event.success,
        p_transaction_at: event.transactionDateTime,
      });
      if (error) throw mapPaymentError(error);
      if (!['paid', 'not_successful', 'duplicate', 'unmatched', 'mismatch', 'late_payment'].includes(data)) throw new PaymentRepositoryError('Máy chủ chưa xác nhận sự kiện thanh toán.');
      return data;
    },
  };
}

module.exports = { PAYMENT_COLUMNS, PAYMENT_PUBLIC_COLUMNS, PaymentRepositoryError, createPaymentRepository, mapPaymentError, toPayment };
