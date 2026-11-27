// Browser storage lets Supabase restore sessions after a page reload. Unlike
// native SecureStore, localStorage is readable by page JavaScript.
function getBrowserStorage() {
  if (typeof globalThis.localStorage === 'undefined') {
    throw new Error('Browser storage is unavailable.');
  }
  return globalThis.localStorage;
}

export async function getItemAsync(key) {
  return getBrowserStorage().getItem(String(key));
}

export async function setItemAsync(key, value) {
  if (typeof value !== 'string') throw new TypeError('Storage values must be strings.');
  getBrowserStorage().setItem(String(key), value);
}

export async function deleteItemAsync(key) {
  getBrowserStorage().removeItem(String(key));
}

export async function isAvailableAsync() {
  try {
    getBrowserStorage();
    return true;
  } catch {
    return false;
  }
}
