'use strict';

function createPushWorkerRepository({ privilegedClient } = {}) {
  if (!privilegedClient || typeof privilegedClient.rpc !== 'function') throw new TypeError('Push worker repository requires a privileged Supabase client.');

  async function rpc(name, args) {
    const { data, error } = await privilegedClient.rpc(name, args);
    if (error) throw new Error(`Push worker database operation failed (${name}).`);
    return data;
  }

  return {
    async claimDeliveryBatch() { return await rpc('claim_push_outbox', { p_limit: 100, p_lease_seconds: 60 }) || []; },
    recordTicket({ outboxId, ticketId = null, errorCode = null }) {
      return rpc('record_push_ticket', { p_outbox_id: outboxId, p_ticket_id: ticketId, p_error_code: errorCode });
    },
    async claimReceiptBatch() { return await rpc('claim_push_receipts', { p_limit: 100, p_lease_seconds: 60 }) || []; },
    recordReceipt({ outboxId, status, errorCode = null }) {
      return rpc('record_push_receipt', { p_outbox_id: outboxId, p_status: status, p_error_code: errorCode });
    },
  };
}

module.exports = { createPushWorkerRepository };
