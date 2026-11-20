const express = require('express');
const {
  normalizeShoppingListInput,
  normalizeShoppingListItemPatch,
} = require('../services/shopping-lists');
const { createShoppingListRepository } = require('../repositories/shopping-list-repository');

const DISCLAIMER = 'Danh sách là ước tính từ thực đơn mẫu; không phải tư vấn y tế.';

function sendRouteError(req, res, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR';
  if (status >= 500) console.error('Shopping list API operation failed', { method: req.method, path: req.path, code });
  const message = status === 500
    ? 'Không thể xử lý danh sách đi chợ lúc này. Hãy thử lại sau.'
    : error.message;
  return res.status(status).json({ error: message, code });
}

function asyncRoute(handler) {
  return (req, res) => Promise.resolve(handler(req, res)).catch(error => sendRouteError(req, res, error));
}

function createShoppingListRouter({ foods, demoContext, repository = createShoppingListRepository({ store: demoContext?.store }) } = {}) {
  if (!Array.isArray(foods) || typeof demoContext?.requireScope !== 'function') {
    throw new TypeError('Shopping list routes require a catalog and demo context.');
  }

  const router = express.Router();
  router.use((req, res, next) => demoContext.requireScope(req, res, next));

  router.get('/current', asyncRoute(async (req, res) => {
    const list = await repository.getCurrent(req.demoNamespace);
    return res.json({ list, disclaimer: DISCLAIMER });
  }));

  router.post('/', asyncRoute(async (req, res) => {
    const items = normalizeShoppingListInput(req.body, foods);
    const result = await repository.create(req.demoNamespace, items, foods, req.get('Idempotency-Key'));
    return res.status(result.replayed ? 200 : 201).json({ list: result.list, disclaimer: DISCLAIMER });
  }));

  router.patch('/current/items/:itemId', asyncRoute(async (req, res) => {
    const patch = normalizeShoppingListItemPatch(req.body);
    const item = await repository.updateItem(req.demoNamespace, req.params.itemId, patch);
    if (!item) return sendRouteError(req, res, Object.assign(new Error('Không tìm thấy mục trong danh sách đi chợ.'), { status: 404, code: 'SHOPPING_LIST_ITEM_NOT_FOUND' }));
    return res.json({ item, disclaimer: DISCLAIMER });
  }));

  router.delete('/current/items/:itemId', asyncRoute(async (req, res) => {
    const removed = await repository.deleteItem(req.demoNamespace, req.params.itemId);
    if (!removed) return sendRouteError(req, res, Object.assign(new Error('Không tìm thấy mục trong danh sách đi chợ.'), { status: 404, code: 'SHOPPING_LIST_ITEM_NOT_FOUND' }));
    return res.sendStatus(204);
  }));

  router.delete('/current', asyncRoute(async (req, res) => {
    await repository.deleteCurrent(req.demoNamespace);
    return res.sendStatus(204);
  }));

  router.delete('/', asyncRoute(async (req, res) => {
    await repository.purge(req.demoNamespace);
    return res.sendStatus(204);
  }));

  return router;
}

module.exports = { createShoppingListRouter };
