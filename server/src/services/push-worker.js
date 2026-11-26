'use strict';

function safeErrorCode(value, fallback) {
  return typeof value === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(value) ? value : fallback;
}

function createPushWorker({ repository, gateway } = {}) {
  if (!repository || !gateway || typeof repository.claimDeliveryBatch !== 'function'
    || typeof repository.recordTicket !== 'function' || typeof repository.claimReceiptBatch !== 'function'
    || typeof repository.recordReceipt !== 'function' || typeof gateway.send !== 'function' || typeof gateway.getReceipts !== 'function') {
    throw new TypeError('Push worker requires a durable repository and Expo Push gateway.');
  }

  return {
    async runOnce() {
      const claimed = await repository.claimDeliveryBatch();
      let tickets = 0;
      if (claimed.length) {
        try {
          const responses = await gateway.send(claimed.map(item => ({
            to: item.expo_push_token,
            title: 'Nutrition Assistant',
            body: 'Bạn có thông báo mới. Mở ứng dụng để xem.',
          })));
          for (let index = 0; index < claimed.length; index += 1) {
            const result = responses[index];
            if (result?.status === 'ok' && typeof result.id === 'string') {
              await repository.recordTicket({ outboxId: claimed[index].outbox_id, ticketId: result.id });
              tickets += 1;
            } else {
              const code = safeErrorCode(result?.details?.error, 'PUSH_TICKET_ERROR');
              await repository.recordTicket({ outboxId: claimed[index].outbox_id, errorCode: code });
            }
          }
        } catch {
          for (const item of claimed) await repository.recordTicket({ outboxId: item.outbox_id, errorCode: 'PUSH_PROVIDER_UNAVAILABLE' });
        }
      }

      const receiptRows = await repository.claimReceiptBatch();
      let receipts = 0;
      if (receiptRows.length) {
        try {
          const byId = await gateway.getReceipts(receiptRows.map(row => row.ticket_id));
          for (const row of receiptRows) {
            const receipt = byId[row.ticket_id];
            if (receipt?.status === 'ok') {
              await repository.recordReceipt({ outboxId: row.outbox_id, status: 'ok' });
              receipts += 1;
            } else {
              const code = safeErrorCode(receipt?.details?.error, receipt ? 'PUSH_RECEIPT_ERROR' : 'PUSH_RECEIPT_PENDING');
              await repository.recordReceipt({ outboxId: row.outbox_id, status: 'error', errorCode: code });
            }
          }
        } catch {
          for (const row of receiptRows) await repository.recordReceipt({ outboxId: row.outbox_id, status: 'error', errorCode: 'PUSH_PROVIDER_UNAVAILABLE' });
        }
      }
      return { claimed: claimed.length, ticketAccepted: tickets, receiptsChecked: receiptRows.length, receiptOk: receipts };
    },
  };
}

module.exports = { createPushWorker, safeErrorCode };
