import { addNotificationResponseReceivedListener, getLastNotificationResponseAsync, setNotificationHandler } from './notifications.web';

test('web notifications adapter stays inert without importing native notification APIs', async () => {
  expect(() => setNotificationHandler({})).not.toThrow();
  expect(addNotificationResponseReceivedListener()).toEqual({ remove: expect.any(Function) });
  await expect(getLastNotificationResponseAsync()).resolves.toBeNull();
});
