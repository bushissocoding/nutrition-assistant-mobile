'use strict';

const { PUSH_LEASE_HEARTBEAT_INTERVAL_MS, PUSH_LEASE_SECONDS } = require('./push-lease-config');

function safeErrorCode(value, fallback) {
  return typeof value === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(value) ? value : fallback;
}

function startLeaseHeartbeat({ items, renewLease, intervalMs }) {
  const controller = new AbortController();
  let stopped = false;
  let timer;

  async function heartbeat() {
    if (stopped) return;
    try {
      const renewed = await Promise.all(items.map(renewLease));
      if (renewed.some(result => result !== true)) controller.abort(new Error('Push worker lease was lost.'));
    } catch {
      controller.abort(new Error('Push worker lease could not be renewed.'));
    }
    if (!stopped && !controller.signal.aborted) timer = setTimeout(heartbeat, intervalMs);
  }

  timer = setTimeout(heartbeat, intervalMs);
  return {
    signal: controller.signal,
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

function createPushWorker({ repository, gateway, heartbeatIntervalMs = PUSH_LEASE_HEARTBEAT_INTERVAL_MS } = {}) {
  if (!repository || !gateway || typeof repository.claimDeliveryBatch !== 'function'
    || typeof repository.beginDeliveryBatch !== 'function' || typeof repository.renewDeliveryLease !== 'function'
    || typeof repository.recordTicket !== 'function' || typeof repository.claimReceiptBatch !== 'function'
    || typeof repository.renewReceiptLease !== 'function' || typeof repository.recordReceipt !== 'function'
    || typeof gateway.send !== 'function' || typeof gateway.getReceipts !== 'function') {
    throw new TypeError('Push worker requires a fenced repository and Expo Push gateway.');
  }
  if (!Number.isInteger(heartbeatIntervalMs) || heartbeatIntervalMs < 1 || heartbeatIntervalMs >= PUSH_LEASE_SECONDS * 1000) {
    throw new RangeError('Push worker heartbeat interval must be positive and shorter than the lease.');
  }

  return {
    async runOnce() {
      const claimed = await repository.claimDeliveryBatch();
      let tickets = 0;
      if (claimed.length) {
        const heartbeat = startLeaseHeartbeat({
          items: claimed,
          renewLease: item => repository.renewDeliveryLease({ outboxId: item.outbox_id, leaseToken: item.lease_token }),
          intervalMs: heartbeatIntervalMs,
        });
        try {
          const canSend = await repository.beginDeliveryBatch(claimed);
          if (canSend && !heartbeat.signal.aborted) {
            let responses;
            try {
              responses = await gateway.send(claimed.map(item => ({
                to: item.expo_push_token,
                title: 'Nutrition Assistant',
                body: 'Bạn có thông báo mới. Mở ứng dụng để xem.',
              })), { signal: heartbeat.signal });
            } catch (error) {
              const explicitRejection = ['PUSH_PROVIDER_UNAVAILABLE', 'PUSH_PROVIDER_REJECTED'].includes(error?.code);
              const code = explicitRejection ? safeErrorCode(error.code, 'PUSH_PROVIDER_UNAVAILABLE') : 'PUSH_DELIVERY_UNKNOWN';
              await Promise.all(claimed.map(item => repository.recordTicket({
                outboxId: item.outbox_id,
                leaseToken: item.lease_token,
                errorCode: code,
              })));
            }
            if (responses !== undefined) {
              const accepted = await Promise.all(claimed.map(async (item, index) => {
                const result = responses[index];
                if (result?.status === 'ok' && typeof result.id === 'string') {
                  await repository.recordTicket({ outboxId: item.outbox_id, leaseToken: item.lease_token, ticketId: result.id });
                  return true;
                }
                const code = safeErrorCode(result?.details?.error, 'PUSH_TICKET_ERROR');
                await repository.recordTicket({ outboxId: item.outbox_id, leaseToken: item.lease_token, errorCode: code });
                return false;
              }));
              tickets = accepted.filter(Boolean).length;
            }
          }
        } finally {
          heartbeat.stop();
        }
      }

      const receiptRows = await repository.claimReceiptBatch();
      let receipts = 0;
      if (receiptRows.length) {
        const heartbeat = startLeaseHeartbeat({
          items: receiptRows,
          renewLease: row => repository.renewReceiptLease({ outboxId: row.outbox_id, leaseToken: row.lease_token }),
          intervalMs: heartbeatIntervalMs,
        });
        try {
          let byId;
          try {
            byId = await gateway.getReceipts(receiptRows.map(row => row.ticket_id), { signal: heartbeat.signal });
          } catch (error) {
            const code = safeErrorCode(error?.code, 'PUSH_PROVIDER_UNAVAILABLE');
            await Promise.all(receiptRows.map(row => repository.recordReceipt({
              outboxId: row.outbox_id,
              leaseToken: row.lease_token,
              status: 'error',
              errorCode: code,
            })));
          }
          if (byId) {
            const successful = await Promise.all(receiptRows.map(async row => {
              const receipt = byId[row.ticket_id];
              if (receipt?.status === 'ok') {
                await repository.recordReceipt({ outboxId: row.outbox_id, leaseToken: row.lease_token, status: 'ok' });
                return true;
              }
              const code = safeErrorCode(receipt?.details?.error, receipt ? 'PUSH_RECEIPT_ERROR' : 'PUSH_RECEIPT_PENDING');
              await repository.recordReceipt({ outboxId: row.outbox_id, leaseToken: row.lease_token, status: 'error', errorCode: code });
              return false;
            }));
            receipts = successful.filter(Boolean).length;
          }
        } finally {
          heartbeat.stop();
        }
      }
      return { claimed: claimed.length, ticketAccepted: tickets, receiptsChecked: receiptRows.length, receiptOk: receipts };
    },
  };
}

module.exports = { createPushWorker, safeErrorCode, startLeaseHeartbeat };
