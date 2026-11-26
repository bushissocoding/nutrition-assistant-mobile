import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createPushDeviceStorage } from './push-device-storage.cjs';

const pushDeviceStorage = createPushDeviceStorage({ storage: SecureStore });

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

function getProjectId(constants = Constants) {
  return constants.expoConfig?.extra?.eas?.projectId || constants.easConfig?.projectId || null;
}

async function requestCurrentPushDevice({ notifications = Notifications, device = Device, platform = Platform.OS, constants = Constants } = {}) {
  if (!device.isDevice) throw Object.assign(new Error('Thông báo đẩy cần ứng dụng đã cài trên thiết bị thật.'), { code: 'PUSH_DEVICE_REQUIRED' });
  if (!['ios', 'android'].includes(platform)) throw Object.assign(new Error('Thông báo đẩy chỉ khả dụng trên iOS hoặc Android.'), { code: 'PUSH_PLATFORM_UNSUPPORTED' });
  const projectId = getProjectId(constants);
  if (!projectId) throw Object.assign(new Error('Ứng dụng chưa được gắn EAS Project ID để đăng ký thông báo đẩy.'), { code: 'PUSH_PROJECT_ID_REQUIRED' });
  if (platform === 'android') {
    await notifications.setNotificationChannelAsync('default', {
      name: 'Thông báo', importance: notifications.AndroidImportance?.DEFAULT ?? 3,
      vibrationPattern: [0, 200, 100, 200], lightColor: '#3159C9',
    });
  }
  let permission = await notifications.getPermissionsAsync();
  if (!permission.granted && permission.status !== 'granted') permission = await notifications.requestPermissionsAsync();
  if (!permission.granted && permission.status !== 'granted') throw Object.assign(new Error('Bạn chưa cấp quyền gửi thông báo trên thiết bị.'), { code: 'PUSH_PERMISSION_DENIED' });
  const result = await notifications.getExpoPushTokenAsync({ projectId });
  const expoPushToken = result?.data;
  if (typeof expoPushToken !== 'string' || !/^(Expo|Exponent)PushToken\[[A-Za-z0-9+/_=-]{1,480}\]$/.test(expoPushToken)) {
    throw Object.assign(new Error('Không nhận được token thông báo hợp lệ từ Expo.'), { code: 'PUSH_TOKEN_UNAVAILABLE' });
  }
  return { expoPushToken, platform };
}

async function registerPushDevice({ api, userId, storage = pushDeviceStorage, getDevice = requestCurrentPushDevice } = {}) {
  if (!api || typeof api.registerMyPushDevice !== 'function' || typeof userId !== 'string') throw new TypeError('Push registration requires an account API and user ID.');
  const device = await getDevice();
  await api.registerMyPushDevice(device);
  try { await storage.set(userId, device); }
  catch (error) {
    try { await api.unregisterMyPushDevice(device); } catch { /* Keep the secure-store failure as the visible error. */ }
    throw Object.assign(new Error('Không lưu được token thiết bị an toàn. Hãy thử bật lại thông báo.'), { code: 'PUSH_DEVICE_STORAGE_UNAVAILABLE', cause: error });
  }
  return device;
}

async function unregisterPushDevice({ api, userId, storage = pushDeviceStorage } = {}) {
  if (!api || typeof api.unregisterMyPushDevice !== 'function' || typeof userId !== 'string') throw new TypeError('Push removal requires an account API and user ID.');
  const device = await storage.get(userId);
  if (!device) return { removed: false };
  await api.unregisterMyPushDevice(device);
  await storage.clear(userId);
  return { removed: true };
}

export { getProjectId, registerPushDevice, requestCurrentPushDevice, unregisterPushDevice };
