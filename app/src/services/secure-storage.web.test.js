test('web secure storage persists values across adapter reloads', async () => {
  const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
      setItem(key, value) { values.set(String(key), String(value)); },
      removeItem(key) { values.delete(String(key)); },
    },
  });

  try {
    let storage = require('./secure-storage.web');
    const key = `test-${Date.now()}`;
    await storage.setItemAsync(key, 'persisted-session-value');

    jest.resetModules();
    storage = require('./secure-storage.web');
    await expect(storage.getItemAsync(key)).resolves.toBe('persisted-session-value');

    await storage.deleteItemAsync(key);
    await expect(storage.getItemAsync(key)).resolves.toBeNull();
  } finally {
    jest.resetModules();
    if (previousDescriptor) Object.defineProperty(globalThis, 'localStorage', previousDescriptor);
    else delete globalThis.localStorage;
  }
});
