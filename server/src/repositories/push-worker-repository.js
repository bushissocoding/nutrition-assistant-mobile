'use strict';

const { PUSH_LEASE_SECONDS, PUSH_WORKER_BATCH_LIMIT } = require('../services/push-lease-config');

function createPushWorkerRepository({ privilegedClient } = {}) {
  if (!privilegedClient || typeof privilegedClient.rpc !== 'function') throw new TypeError('Push worker repository requires a privileged Supabase client.');

  async function rpc(name, args) {
    const { data, error } = await privilegedClient.rpc(name, args);
    if (error) throw new Error(`Push worker database operation failed (${name}).`);
    return data;
  }

  return {
    async claimDeliveryBatch() {
      return await rpc('claim_push_outbox', { p_limit: PUSH_WORKER_BATCH_LIMIT, p_lease_seconds: PUSH_LEASE_SECONDS }) || [];
    },
    async beginDeliveryBatch(items) {
      const data = await rpc('begin_push_delivery', {
        p_outbox_ids: items.map(item => item.outbox_id),
        p_lease_tokens: items.map(item => item.lease_token),
      });
      return data === true;
    },
    async renewDeliveryLease({ outboxId, leaseToken }) {
      const data = await rpc('renew_push_outbox_lease', {
        p_outbox_id: outboxId,
        p_lease_token: leaseToken,
        p_lease_seconds: PUSH_LEASE_SECONDS,
      });
      return data === true;
    },
    recordTicket({ outboxId, leaseToken, ticketId = null, errorCode = null }) {
      return rpc('record_push_ticket', {
        p_outbox_id: outboxId,
        p_lease_token: leaseToken,
        p_ticket_id: ticketId,
        p_error_code: errorCode,
      });
    },
    async claimReceiptBatch() {
      return await rpc('claim_push_receipts', { p_limit: PUSH_WORKER_BATCH_LIMIT, p_lease_seconds: PUSH_LEASE_SECONDS }) || [];
    },
    async renewReceiptLease({ outboxId, leaseToken }) {
      const data = await rpc('renew_push_receipt_lease', {
        p_outbox_id: outboxId,
        p_lease_token: leaseToken,
        p_lease_seconds: PUSH_LEASE_SECONDS,
      });
      return data === true;
    },
    recordReceipt({ outboxId, leaseToken, status, errorCode = null }) {
      return rpc('record_push_receipt', {
        p_outbox_id: outboxId,
        p_lease_token: leaseToken,
        p_status: status,
        p_error_code: errorCode,
      });
    },
  };
}

module.exports = { createPushWorkerRepository };
