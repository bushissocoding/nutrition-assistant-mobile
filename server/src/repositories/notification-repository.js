'use strict';

class NotificationRepositoryError extends Error {
  constructor(message, status = 503, code = 'NOTIFICATIONS_UNAVAILABLE') {
    super(message);
    this.name = 'NotificationRepositoryError';
    this.status = status;
    this.code = code;
  }
}

const DEFAULT_PREFERENCES = Object.freeze({
  inAppAppointments: true,
  inAppPayments: true,
  inAppMessages: true,
  pushEnabled: false,
  pushAppointments: true,
  pushPayments: true,
  pushMessages: true,
});

function throwIfError(error) {
  if (!error) return;
  throw new NotificationRepositoryError('Không thể đọc hoặc cập nhật thông báo lúc này. Hãy thử lại sau.');
}

function createNotificationRepository() {
  async function getPreferences({ db, userId }) {
    const { data, error } = await db.from('notification_preferences')
      .select('in_app_appointments,in_app_payments,in_app_messages,push_enabled,push_appointments,push_payments,push_messages,updated_at')
      .eq('user_id', userId).maybeSingle();
    throwIfError(error);
    if (!data) return { ...DEFAULT_PREFERENCES, updatedAt: null };
    return {
      inAppAppointments: data.in_app_appointments,
      inAppPayments: data.in_app_payments,
      inAppMessages: data.in_app_messages,
      pushEnabled: data.push_enabled,
      pushAppointments: data.push_appointments,
      pushPayments: data.push_payments,
      pushMessages: data.push_messages,
      updatedAt: data.updated_at,
    };
  }

  async function list({ db, userId, limit, offset, unreadOnly }) {
    const preferences = await getPreferences({ db, userId });
    const visibleKinds = [
      preferences.inAppAppointments && 'appointment',
      preferences.inAppPayments && 'payment',
      preferences.inAppMessages && 'message',
    ].filter(Boolean);
    if (!visibleKinds.length) return { items: [], total: 0, limit, offset };
    let query = db.from('notifications').select('id,kind,reference_id,title,body,read_at,created_at', { count: 'exact' })
      .eq('user_id', userId).in('kind', visibleKinds)
      .order('created_at', { ascending: false }).order('id', { ascending: false });
    if (unreadOnly) query = query.is('read_at', null);
    query = query.range(offset, offset + limit - 1);
    const { data, error, count } = await query;
    throwIfError(error);
    return {
      items: (data || []).map(row => ({
        id: row.id,
        kind: row.kind,
        referenceId: row.reference_id,
        title: row.title,
        body: row.body,
        readAt: row.read_at,
        createdAt: row.created_at,
      })),
      total: Number.isInteger(count) ? count : (data || []).length,
      limit,
      offset,
    };
  }

  async function markRead({ db, userId, notificationId = null }) {
    const { data, error } = await db.rpc('mark_notifications_read', { p_notification_id: notificationId });
    throwIfError(error);
    const updated = Number.isSafeInteger(data) && data >= 0 ? data : 0;
    if (notificationId && updated === 0) {
      const { data: owned, error: lookupError } = await db.from('notifications').select('id')
        .eq('user_id', userId).eq('id', notificationId).maybeSingle();
      throwIfError(lookupError);
      if (!owned) return { found: false, changed: false, updated: 0 };
    }
    return { found: true, changed: updated > 0, updated };
  }

  async function savePreferences({ db, preferences }) {
    const { data, error } = await db.rpc('save_notification_preferences', { p_preferences: preferences });
    throwIfError(error);
    return data;
  }

  async function registerDevice({ db, expoPushToken, platform }) {
    const { data, error } = await db.rpc('register_notification_device', { p_expo_push_token: expoPushToken, p_platform: platform });
    if (error?.code === '42501') throw new NotificationRepositoryError('Hãy bật thông báo đẩy trong cài đặt trước khi đăng ký thiết bị.', 409, 'PUSH_OPT_IN_REQUIRED');
    throwIfError(error);
    return data;
  }

  async function unregisterDevice({ db, expoPushToken }) {
    const { error } = await db.rpc('unregister_notification_device', { p_expo_push_token: expoPushToken });
    throwIfError(error);
  }

  return { getPreferences, list, markRead, registerDevice, savePreferences, unregisterDevice };
}

module.exports = { DEFAULT_PREFERENCES, NotificationRepositoryError, createNotificationRepository };
