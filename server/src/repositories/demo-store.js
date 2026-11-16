const fs = require('node:fs/promises');
const path = require('node:path');

const STORE_VERSION = 1;
const namespacePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const collectionPattern = /^[a-z][a-z0-9_-]{0,63}$/;
const defaultFilePath = path.join(__dirname, '..', '..', '.local-data', 'demo-store.json');

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertNamespace(namespace) {
  if (typeof namespace !== 'string' || !namespacePattern.test(namespace)) {
    throw new TypeError('Demo namespace must contain 1–128 letters, numbers, hyphens, or underscores.');
  }
}

function assertCollection(collection) {
  if (typeof collection !== 'string' || !collectionPattern.test(collection)) {
    throw new TypeError('Demo collection name must start with a lowercase letter and contain only letters, numbers, hyphens, or underscores.');
  }
}

function emptyStore() {
  return { version: STORE_VERSION, namespaces: Object.create(null) };
}

function copyJson(value) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (error) {
    throw new TypeError(`Demo data must be JSON serializable: ${error.message}`, { cause: error });
  }
  if (typeof serialized !== 'string') throw new TypeError('Demo data must be JSON serializable.');
  return JSON.parse(serialized);
}

function normalizeStore(value) {
  if (!isRecord(value) || value.version !== STORE_VERSION || !isRecord(value.namespaces)) {
    throw new Error('Demo data store has an unsupported or invalid structure.');
  }

  const namespaces = Object.create(null);
  for (const [namespace, collections] of Object.entries(value.namespaces)) {
    assertNamespace(namespace);
    if (!isRecord(collections)) throw new Error(`Demo data for namespace "${namespace}" is invalid.`);
    const normalizedCollections = Object.create(null);
    for (const [collection, records] of Object.entries(collections)) {
      assertCollection(collection);
      if (!Array.isArray(records)) throw new Error(`Demo collection "${collection}" must contain an array.`);
      normalizedCollections[collection] = records;
    }
    namespaces[namespace] = normalizedCollections;
  }

  return { version: STORE_VERSION, namespaces };
}

function createDemoStore({ filePath = process.env.DEMO_DATA_FILE || defaultFilePath } = {}) {
  const resolvedFilePath = path.resolve(filePath);
  let writeQueue = Promise.resolve();
  let temporaryFileSequence = 0;

  async function readStore() {
    let content;
    try {
      content = await fs.readFile(resolvedFilePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return emptyStore();
      throw error;
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new Error('Demo data store must contain valid JSON.', { cause: error });
    }
    return normalizeStore(parsed);
  }

  async function writeStore(store) {
    const directory = path.dirname(resolvedFilePath);
    await fs.mkdir(directory, { recursive: true });
    const temporaryPath = `${resolvedFilePath}.tmp-${process.pid}-${temporaryFileSequence++}`;
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      await fs.rename(temporaryPath, resolvedFilePath);
    } catch (error) {
      await fs.rm(temporaryPath, { force: true }).catch(() => {});
      throw error;
    }
  }

  function serializeWrite(operation) {
    const result = writeQueue.then(operation);
    writeQueue = result.catch(() => {});
    return result;
  }

  async function readCollection(namespace, collection) {
    assertNamespace(namespace);
    assertCollection(collection);
    const store = await readStore();
    return copyJson(store.namespaces[namespace]?.[collection] || []);
  }

  async function updateCollection(namespace, collection, update) {
    assertNamespace(namespace);
    assertCollection(collection);
    if (typeof update !== 'function') throw new TypeError('Collection update must be a function.');

    return serializeWrite(async () => {
      const store = await readStore();
      const current = copyJson(store.namespaces[namespace]?.[collection] || []);
      const next = await update(current);
      if (!Array.isArray(next)) throw new TypeError('Demo collection updates must return an array.');

      const records = copyJson(next);
      const collections = store.namespaces[namespace] || Object.create(null);
      collections[collection] = records;
      store.namespaces[namespace] = collections;
      await writeStore(store);
      return copyJson(records);
    });
  }

  function writeCollection(namespace, collection, records) {
    if (!Array.isArray(records)) throw new TypeError('Demo collections must be arrays.');
    return updateCollection(namespace, collection, () => records);
  }

  return { readCollection, updateCollection, writeCollection };
}

module.exports = { createDemoStore };
