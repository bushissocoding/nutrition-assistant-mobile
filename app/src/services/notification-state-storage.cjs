'use strict';

const STORAGE_KEY = 'nutrition-assistant.notification-read-state.v1';

function cloneNotifications(items) {
  return items.map(item => ({ ...item }));
}

function createNotificationStateStorage({ storage, initialItems }) {
  if (!storage || typeof storage.getItemAsync !== 'function' || typeof storage.setItemAsync !== 'function'
    || typeof storage.deleteItemAsync !== 'function' || !Array.isArray(initialItems)) {
    throw new TypeError('Notification storage requires SecureStore methods and initial sample items.');
  }
  const knownIds = new Set(initialItems.map(item => item.id));

  async function load() {
    const raw = await storage.getItemAsync(STORAGE_KEY);
    if (raw === null || raw === undefined) return { items: cloneNotifications(initialItems), warning: '' };

    let saved;
    try { saved = JSON.parse(raw); }
    catch { saved = null; }
    const valid = Array.isArray(saved)
      && saved.length === knownIds.size
      && saved.every(item => item && typeof item.id === 'string' && knownIds.has(item.id) && typeof item.unread === 'boolean')
      && new Set(saved.map(item => item.id)).size === knownIds.size;
    if (!valid) {
      await storage.deleteItemAsync(STORAGE_KEY);
      return { items: cloneNotifications(initialItems), warning: 'Trạng thái thông báo lưu trên thiết bị không hợp lệ; đã khôi phục thông báo mẫu.' };
    }

    const unreadById = new Map(saved.map(item => [item.id, item.unread]));
    return {
      items: initialItems.map(item => ({ ...item, unread: unreadById.get(item.id) })),
      warning: '',
    };
  }

  async function save(items) {
    if (!Array.isArray(items)) throw new TypeError('Notification state must be an array.');
    const unreadById = new Map(items.map(item => [item?.id, item?.unread]));
    const state = initialItems.map(item => {
      const unread = unreadById.get(item.id);
      if (typeof unread !== 'boolean') throw new TypeError('Notification read state is incomplete.');
      return { id: item.id, unread };
    });
    await storage.setItemAsync(STORAGE_KEY, JSON.stringify(state));
  }

  return { load, save };
}

module.exports = { STORAGE_KEY, createNotificationStateStorage };
