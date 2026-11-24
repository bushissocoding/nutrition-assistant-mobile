const express = require('express');
const { exportAccount } = require('../services/account-lifecycle');

function createAccountRouter({ deleteAccount } = {}) {
  const router = express.Router();
  router.get('/export', async (req, res) => {
    try {
      const data = await exportAccount({ db: req.userDatabase, user: req.auth.user });
      return res.json(data);
    } catch {
      return res.status(503).json({ error: 'Không thể tạo bản xuất dữ liệu lúc này.', code: 'ACCOUNT_EXPORT_UNAVAILABLE' });
    }
  });
  router.delete('/', async (req, res) => {
    if (typeof deleteAccount !== 'function') {
      return res.status(503).json({ error: 'Yêu cầu xóa tài khoản chưa được cấu hình.', code: 'ACCOUNT_DELETE_UNAVAILABLE' });
    }
    try {
      await deleteAccount({ userId: req.auth.user.id, db: req.userDatabase });
      return res.status(204).end();
    } catch {
      return res.status(503).json({ error: 'Chưa thể hoàn tất xóa tài khoản. Dữ liệu vẫn được giữ lại để bạn thử lại.', code: 'ACCOUNT_DELETE_PENDING' });
    }
  });
  return router;
}

module.exports = { createAccountRouter };
