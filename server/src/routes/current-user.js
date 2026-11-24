const express = require('express');

function createCurrentUserRouter(authMiddleware) {
  if (typeof authMiddleware !== 'function') throw new TypeError('Current-user route requires verified identity middleware.');

  const router = express.Router();
  router.get('/', authMiddleware, (req, res) => {
    const id = req.auth?.user?.id;
    if (typeof id !== 'string' || !id) {
      return res.status(401).json({ error: 'Cần đăng nhập để tiếp tục.', code: 'AUTHENTICATION_REQUIRED' });
    }
    return res.json({ user: { id } });
  });
  return router;
}

module.exports = { createCurrentUserRouter };
