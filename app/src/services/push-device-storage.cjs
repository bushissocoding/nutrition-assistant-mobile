'use strict';

const STORAGE_PREFIX = 'nutrition-assistant.push-device.v1.';

function storageKey(userId) {
  if (typeof userId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(userId)) throw new TypeError('Push-device storage requires a valid account ID.');
  return STORAGE_PREFIX + userId;
}

function createPushDeviceStorage({ storage } = {}) {
  if (!storage || typeof storage.getItemAsync !== 'function' || typeof storage.setItemAsync !== 'function' || typeof storage.deleteItemAsync !== 'function') {
    throw new TypeError('Push-device storage requires SecureStore methods.');
  }
  return {
    async get(userId) {
      const raw = await storage.getItemAsync(storageKey(userId));
      if (!raw) return null;
      try {
        const value = JSON.parse(raw);
        if (value?.version === 1 && value.userId === userId && typeof value.expoPushToken === 'string'
          && /^(Expo|Exponent)PushToken\[[A-Za-z0-9+/_=-]{1,480}\]$/.test(value.expoPushToken)
          && ['ios', 'android'].includes(value.platform)) return { expoPushToken: value.expoPushToken, platform: value.platform };
      } catch { /* Invalid local token data is removed before the caller retries registration. */ }
      await storage.deleteItemAsync(storageKey(userId));
      return null;
    },
    async set(userId, device) {
      if (!device || !/^(Expo|Exponent)PushToken\[[A-Za-z0-9+/_=-]{1,480}\]$/.test(device.expoPushToken) || !['ios', 'android'].includes(device.platform)) {
        throw new TypeError('Push-device record is invalid.');
      }
      await storage.setItemAsync(storageKey(userId), JSON.stringify({ version: 1, userId, ...device }));
    },
    async clear(userId) { await storage.deleteItemAsync(storageKey(userId)); },
  };
}

module.exports = { STORAGE_PREFIX, createPushDeviceStorage, storageKey };
