const { createHash, randomUUID } = require('node:crypto');
const { createShoppingList, updateShoppingListItem } = require('../services/shopping-lists');

class ShoppingListRepositoryError extends Error {
  constructor(message, status = 503, code = 'DEMO_STORE_UNAVAILABLE') {
    super(message);
    this.name = 'ShoppingListRepositoryError';
    this.status = status;
    this.code = code;
  }
}

function publicList(row) {
  if (!row) return null;
  const { kind: _kind, ...list } = row;
  return list;
}

function fingerprint(input) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function assertIdempotencyKey(key) {
  if (typeof key !== 'string' || key.length < 8 || key.length > 128 || !/^[A-Za-z0-9_.:-]+$/.test(key)) {
    throw new ShoppingListRepositoryError('Idempotency-Key phải có 8–128 ký tự ASCII chữ, số, _, -, ., hoặc :.', 400, 'VALIDATION_ERROR');
  }
}

function preserveOrWrap(error) {
  if (error instanceof ShoppingListRepositoryError || (Number.isInteger(error?.status) && typeof error?.code === 'string')) return error;
  return new ShoppingListRepositoryError('Không thể lưu danh sách demo lúc này. Hãy kiểm tra kết nối và thử lại.');
}

function createShoppingListRepository({ store, idFactory = randomUUID, itemIdFactory = randomUUID, clock = () => new Date() } = {}) {
  if (!store || typeof store.readCollection !== 'function' || typeof store.updateCollection !== 'function') {
    throw new TypeError('Shopping list repository requires a demo collection store.');
  }

  async function create(namespace, items, foods, key) {
    assertIdempotencyKey(key);
    const requestFingerprint = fingerprint(items);
    let result;
    try {
      await store.updateCollection(namespace, 'shopping_lists', rows => {
        const ledger = rows.find(row => row.kind === 'idempotency' && row.key === key);
        if (ledger) {
          if (ledger.fingerprint !== requestFingerprint) {
            throw new ShoppingListRepositoryError('Idempotency-Key đã được dùng với nội dung khác.', 409, 'IDEMPOTENCY_CONFLICT');
          }
          const current = rows.find(row => row.kind === 'current' && row.id === ledger.resourceId);
          if (!current) {
            throw new ShoppingListRepositoryError('Danh sách của lần gửi trước đã bị thay hoặc xóa; hãy tạo ý định mới.', 410, 'IDEMPOTENT_RESULT_DELETED');
          }
          result = { list: publicList(current), replayed: true };
          return rows;
        }

        const list = createShoppingList(items, foods, idFactory(), itemIdFactory, clock());
        const ledgerRow = {
          kind: 'idempotency',
          key,
          fingerprint: requestFingerprint,
          resourceId: list.id,
          createdAt: new Date(clock()).toISOString(),
        };
        result = { list, replayed: false };
        return [...rows.filter(row => row.kind !== 'current'), { kind: 'current', ...list }, ledgerRow];
      });
      return result;
    } catch (error) {
      throw preserveOrWrap(error);
    }
  }

  async function getCurrent(namespace) {
    try {
      const rows = await store.readCollection(namespace, 'shopping_lists');
      return publicList(rows.find(row => row.kind === 'current'));
    } catch (error) {
      throw preserveOrWrap(error);
    }
  }

  async function updateItem(namespace, itemId, patch) {
    let result = null;
    try {
      await store.updateCollection(namespace, 'shopping_lists', rows => {
        const listIndex = rows.findIndex(row => row.kind === 'current');
        if (listIndex < 0) return rows;
        const current = rows[listIndex];
        const itemIndex = current.items.findIndex(item => item.id === itemId);
        if (itemIndex < 0) return rows;
        const updatedItem = updateShoppingListItem(current.items[itemIndex], patch, clock());
        const updatedList = { ...current, updatedAt: new Date(clock()).toISOString(), items: [...current.items] };
        updatedList.items[itemIndex] = updatedItem;
        result = updatedItem;
        const next = [...rows];
        next[listIndex] = { kind: 'current', ...updatedList };
        return next;
      });
      return result;
    } catch (error) {
      throw preserveOrWrap(error);
    }
  }

  async function deleteItem(namespace, itemId) {
    let removed = false;
    try {
      await store.updateCollection(namespace, 'shopping_lists', rows => {
        const listIndex = rows.findIndex(row => row.kind === 'current');
        if (listIndex < 0) return rows;
        const current = rows[listIndex];
        const items = current.items.filter(item => {
          if (item.id === itemId) removed = true;
          return item.id !== itemId;
        });
        if (!removed) return rows;
        const updated = { ...current, items, updatedAt: new Date(clock()).toISOString() };
        const next = [...rows];
        next[listIndex] = { kind: 'current', ...updated };
        return next;
      });
      return removed;
    } catch (error) {
      throw preserveOrWrap(error);
    }
  }

  async function deleteCurrent(namespace) {
    let removed = false;
    try {
      await store.updateCollection(namespace, 'shopping_lists', rows => rows.filter(row => {
        if (row.kind === 'current') removed = true;
        return row.kind !== 'current';
      }));
      return removed;
    } catch (error) {
      throw preserveOrWrap(error);
    }
  }

  async function purge(namespace) {
    try {
      await store.updateCollection(namespace, 'shopping_lists', () => []);
    } catch (error) {
      throw preserveOrWrap(error);
    }
  }

  return { create, getCurrent, updateItem, deleteItem, deleteCurrent, purge };
}

module.exports = { ShoppingListRepositoryError, createShoppingListRepository };
