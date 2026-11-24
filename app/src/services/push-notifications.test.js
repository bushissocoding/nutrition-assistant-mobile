import { getProjectId, registerPushDevice, requestCurrentPushDevice, unregisterPushDevice } from './push-notifications';

jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('expo-constants', () => ({ default: { expoConfig: null, easConfig: null } }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

test('resolves EAS project ID from either supported Expo runtime config', () => {
  expect(getProjectId({ expoConfig: { extra: { eas: { projectId: 'project-one' } } }, easConfig: { projectId: 'project-two' } })).toBe('project-one');
  expect(getProjectId({ expoConfig: null, easConfig: { projectId: 'project-two' } })).toBe('project-two');
  expect(getProjectId({ expoConfig: null, easConfig: null })).toBeNull();
});

test('requests explicit native permission and only then returns a valid Expo token', async () => {
  const notifications = {
    setNotificationChannelAsync: jest.fn(),
    getPermissionsAsync: jest.fn().mockResolvedValue({ granted: false, status: 'undetermined' }),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, status: 'granted' }),
    getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[device-token]' }),
    AndroidImportance: { DEFAULT: 3 },
  };
  const device = await requestCurrentPushDevice({ notifications, device: { isDevice: true }, platform: 'android', constants: { expoConfig: { extra: { eas: { projectId: 'eas-project' } } } } });
  expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith('default', expect.objectContaining({ name: 'Thông báo' }));
  expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'eas-project' });
  expect(device).toEqual({ expoPushToken: 'ExponentPushToken[device-token]', platform: 'android' });
});

test('fails closed for simulators, missing project setup, denied permission and invalid tokens', async () => {
  await expect(requestCurrentPushDevice({ device: { isDevice: false }, platform: 'ios', constants: { expoConfig: null, easConfig: null } })).rejects.toMatchObject({ code: 'PUSH_DEVICE_REQUIRED' });
  await expect(requestCurrentPushDevice({ device: { isDevice: true }, platform: 'ios', constants: { expoConfig: null, easConfig: null } })).rejects.toMatchObject({ code: 'PUSH_PROJECT_ID_REQUIRED' });
  const denied = { getPermissionsAsync: jest.fn().mockResolvedValue({ granted: false, status: 'denied' }), requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: false, status: 'denied' }) };
  const withProject = { expoConfig: { extra: { eas: { projectId: 'eas-project' } } } };
  await expect(requestCurrentPushDevice({ notifications: denied, device: { isDevice: true }, platform: 'ios', constants: withProject })).rejects.toMatchObject({ code: 'PUSH_PERMISSION_DENIED' });
});

test('registers, persists, unregisters and clears only the current account device', async () => {
  const api = { registerMyPushDevice: jest.fn(), unregisterMyPushDevice: jest.fn() };
  const storage = { get: jest.fn(), set: jest.fn(), clear: jest.fn() };
  const device = { expoPushToken: 'ExponentPushToken[device-token]', platform: 'ios' };
  const getDevice = jest.fn().mockResolvedValue(device);
  await registerPushDevice({ api, userId: 'account-a', storage, getDevice });
  expect(api.registerMyPushDevice).toHaveBeenCalledWith(device);
  expect(storage.set).toHaveBeenCalledWith('account-a', device);
  storage.get.mockResolvedValue(device);
  await unregisterPushDevice({ api, userId: 'account-a', storage });
  expect(api.unregisterMyPushDevice).toHaveBeenCalledWith(device);
  expect(storage.clear).toHaveBeenCalledWith('account-a');
});

test('unregisters the server token if secure local persistence fails', async () => {
  const device = { expoPushToken: 'ExponentPushToken[device-token]', platform: 'ios' };
  const api = { registerMyPushDevice: jest.fn(), unregisterMyPushDevice: jest.fn() };
  const storage = { async set() { throw new Error('secure storage failed'); } };
  await expect(registerPushDevice({ api, userId: 'account-a', storage, getDevice: async () => device })).rejects.toMatchObject({ code: 'PUSH_DEVICE_STORAGE_UNAVAILABLE' });
  expect(api.unregisterMyPushDevice).toHaveBeenCalledWith(device);
});
