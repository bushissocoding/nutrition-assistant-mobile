import { deleteItemAsync, getItemAsync, setItemAsync } from './secure-storage.web';

test('web secure storage keeps values only in the current JavaScript session', async () => {
  const key = `test-${Date.now()}`;
  await setItemAsync(key, 'session-only-value');
  await expect(getItemAsync(key)).resolves.toBe('session-only-value');
  await deleteItemAsync(key);
  await expect(getItemAsync(key)).resolves.toBeNull();
});
