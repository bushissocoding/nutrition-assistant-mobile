const DEFAULT_MAX_CHUNK_BYTES = 1800;

function utf8Length(value) {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}

function splitUtf8(value, maxBytes) {
  const chunks = [];
  let chunk = '';
  let bytes = 0;
  for (const character of value) {
    const size = utf8Length(character);
    if (bytes + size > maxBytes && chunk) {
      chunks.push(chunk);
      chunk = '';
      bytes = 0;
    }
    if (size > maxBytes) throw new RangeError('A character exceeds the secure storage chunk size.');
    chunk += character;
    bytes += size;
  }
  if (chunk || chunks.length === 0) chunks.push(chunk);
  return chunks;
}

function checksum(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function safeSuffix(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function createAuthSessionStorage({ storage, prefix = 'nutrition-assistant.auth.v1', maxChunkBytes = DEFAULT_MAX_CHUNK_BYTES } = {}) {
  if (!storage || !['getItemAsync', 'setItemAsync', 'deleteItemAsync'].every(method => typeof storage[method] === 'function')) {
    throw new TypeError('SecureStore-compatible storage is required.');
  }
  if (!Number.isInteger(maxChunkBytes) || maxChunkBytes < 4) throw new RangeError('maxChunkBytes must be an integer of at least 4.');

  const baseFor = key => `${prefix}.${safeSuffix(String(key))}`;
  const readPointer = async key => storage.getItemAsync(key);

  async function removeGeneration(base, id) {
    if (!id || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) return;
    const metaKey = `${base}.g.${id}.meta`;
    let meta = null;
    try { meta = JSON.parse((await storage.getItemAsync(metaKey)) || 'null'); } catch { /* Remove known metadata and first bounded chunk set below. */ }
    const count = Number.isInteger(meta?.chunks) && meta.chunks >= 0 && meta.chunks <= 128 ? meta.chunks : 128;
    await Promise.all(Array.from({ length: count }, (_, index) => storage.deleteItemAsync(`${base}.g.${id}.${index}`).catch(() => undefined)));
    await storage.deleteItemAsync(metaKey).catch(() => undefined);
  }

  async function readGeneration(base, id) {
    if (!id || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) return null;
    const metaText = await storage.getItemAsync(`${base}.g.${id}.meta`);
    if (!metaText) return null;
    let meta;
    try { meta = JSON.parse(metaText); } catch { return null; }
    if (!Number.isInteger(meta?.chunks) || meta.chunks < 1 || meta.chunks > 128 || typeof meta.checksum !== 'string') return null;
    const values = await Promise.all(Array.from({ length: meta.chunks }, (_, index) => storage.getItemAsync(`${base}.g.${id}.${index}`)));
    if (values.some(value => typeof value !== 'string')) return null;
    const serialized = values.join('');
    if (checksum(serialized) !== meta.checksum) return null;
    try { return JSON.parse(serialized); } catch { return null; }
  }

  return {
    async getItem(key) {
      const base = baseFor(key);
      const active = await readPointer(`${base}.active`);
      const current = await readGeneration(base, active);
      if (current !== null) return JSON.stringify(current);
      const previous = await readPointer(`${base}.previous`);
      const fallback = await readGeneration(base, previous);
      if (fallback === null) return null;
      await storage.setItemAsync(`${base}.active`, previous);
      await storage.deleteItemAsync(`${base}.previous`).catch(() => undefined);
      return JSON.stringify(fallback);
    },

    async setItem(key, value) {
      if (typeof value !== 'string') throw new TypeError('Auth session values must be strings.');
      const base = baseFor(key);
      const serialized = JSON.stringify(JSON.parse(value));
      const chunks = splitUtf8(serialized, maxChunkBytes);
      if (chunks.length > 128) throw new RangeError('Auth session exceeds the secure storage capacity.');
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      const previousActive = await readPointer(`${base}.active`);
      const oldPrevious = await readPointer(`${base}.previous`);
      let generationWritten = false;
      try {
        await Promise.all(chunks.map((chunk, index) => storage.setItemAsync(`${base}.g.${id}.${index}`, chunk)));
        await storage.setItemAsync(`${base}.g.${id}.meta`, JSON.stringify({ chunks: chunks.length, checksum: checksum(serialized) }));
        generationWritten = true;
        if (previousActive && await readGeneration(base, previousActive) !== null) {
          await storage.setItemAsync(`${base}.previous`, previousActive);
        }
        await storage.setItemAsync(`${base}.active`, id);
      } catch (error) {
        if (generationWritten) await removeGeneration(base, id);
        throw error;
      }

      if (oldPrevious && oldPrevious !== previousActive && oldPrevious !== id) await removeGeneration(base, oldPrevious);
      return undefined;
    },

    async removeItem(key) {
      const base = baseFor(key);
      const [active, previous] = await Promise.all([readPointer(`${base}.active`), readPointer(`${base}.previous`)]);
      await Promise.all([
        storage.deleteItemAsync(`${base}.active`),
        storage.deleteItemAsync(`${base}.previous`),
        removeGeneration(base, active),
        removeGeneration(base, previous),
      ]);
    },
  };
}

module.exports = { DEFAULT_MAX_CHUNK_BYTES, createAuthSessionStorage, splitUtf8, utf8Length };
