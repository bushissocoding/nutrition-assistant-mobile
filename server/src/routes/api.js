const express = require('express');
const { calculateFood, calculateTotals } = require('../services/nutrition');
const { generatePlan, validateMealPlanRequest } = require('../services/meal-planner');
const { createMealEntryRouter } = require('./meal-entries');
const { createShoppingListRouter } = require('./shopping-lists');
const { createCurrentUserRouter } = require('./current-user');
const { createProfileRouter } = require('./profiles');
const { createConsentRouter } = require('./consent');
const { createAccountRouter } = require('./account');
const { createSourcedFoodRouter } = require('./sourced-foods');
const { createMealPlanRouter } = require('./meal-plans');
const { createAccountMealEntryRouter } = require('./account-meal-entries');
const { createNutritionReportRouter } = require('./nutrition-report');
const { createAccountGroceryRouter } = require('./account-grocery');
const { createCareBookingRouter, createPayosWebhookRouter } = require('./care-bookings');
const { createChatRouter } = require('./chat');
const { createHealthRecordRouter } = require('./health-records');
const { createNotificationRouter } = require('./notifications');
const { createPersonalizationRouter } = require('./personalization');
const { PENDING_DATASET_MESSAGE } = require('../services/food-source');
const { unavailable } = require('../services/sourced-meal-plans');

function createApiRouter({ foods, mealTemplates, catalog }, demoContext, { authMiddleware, deleteAccount, foodSource, careBookingRepository, paymentRepository, payosGateway, payosConfig, requireCurrentConsent, chatRepository, assistantProvider, healthRecordRepository, notificationRepository, personalizationRepository } = {}) {
  const hasStoreMethods = ['readCollection', 'updateCollection', 'writeCollection']
    .every(method => typeof demoContext?.store?.[method] === 'function');
  if (!hasStoreMethods || typeof demoContext.requireScope !== 'function') {
    throw new TypeError('A complete demo context is required to compose the API router.');
  }

  const router = express.Router();
  router.use((req, _res, next) => {
    req.demoContext = demoContext;
    return next();
  });
  if (authMiddleware) {
    router.use('/me', createCurrentUserRouter(authMiddleware));
    router.use('/me', createAccountRouter({ authMiddleware, deleteAccount }));
    router.use('/me/consent', authMiddleware, createConsentRouter());
    router.use('/me/profile', authMiddleware, createProfileRouter());
    router.use('/me/meal-plans', authMiddleware, createMealPlanRouter({ foods, mealTemplates, catalog, foodSource }));
    router.use('/me/meal-entries', authMiddleware, createAccountMealEntryRouter({ foodSource }));
    router.use('/me/nutrition-report', authMiddleware, createNutritionReportRouter());
    router.use('/me/grocery', authMiddleware, createAccountGroceryRouter({ foodSource }));
    router.use('/me/care', authMiddleware, createCareBookingRouter({ repository: careBookingRepository, paymentRepository, payosGateway, requireCurrentConsent }));
    router.use('/me/chat', authMiddleware, createChatRouter({ repository: chatRepository, assistantProvider, requireCurrentConsent }));
    router.use('/me/health-records', authMiddleware, createHealthRecordRouter({ repository: healthRecordRepository }));
    router.use('/me/notifications', authMiddleware, createNotificationRouter({ repository: notificationRepository }));
    router.use('/me/personalization', authMiddleware, createPersonalizationRouter({ repository: personalizationRepository }));
  }
  router.use('/webhooks/payos', createPayosWebhookRouter({ paymentRepository, checksumKey: payosConfig?.checksumKey }));
  router.use(createSourcedFoodRouter({ foodSource }));
  router.get('/foods', (req, res) => {
    const query = String(req.query.q || '').trim().toLocaleLowerCase('vi');
    const category = String(req.query.category || '').trim().toLocaleLowerCase('vi');
    const items = foods.filter(food => ((!query || [food.name, ...(food.aliases || [])].some(name => name.toLocaleLowerCase('vi').includes(query))) && (!category || food.category.toLocaleLowerCase('vi') === category)));
    res.json({ items, count: items.length, catalog, disclaimer: 'Dữ liệu MVP tham khảo, không phải hướng dẫn điều trị.' });
  });
  router.get('/foods/:id', (req, res) => {
    const food = foods.find(item => item.id === req.params.id);
    if (!food) return res.status(404).json({ error: 'Không tìm thấy thực phẩm.' });
    res.json({ ...food, catalogVersion: catalog?.version || null });
  });
  router.post('/nutrition/calculate', (req, res) => {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0 || items.length > 100) return res.status(400).json({ error: 'items phải là danh sách 1–100 thực phẩm.' });
    for (const item of items) if (!item || typeof item !== 'object' || Array.isArray(item) || !foods.some(food => food.id === item.foodId) || !Number.isFinite(item.grams) || item.grams <= 0 || item.grams > 5000) return res.status(400).json({ error: 'foodId hoặc khối lượng không hợp lệ.' });
    res.json({ totals: calculateTotals(items, foods), items: items.map(item => ({ food: foods.find(food => food.id === item.foodId).name, grams: item.grams, nutrients: calculateFood(foods.find(food => food.id === item.foodId), item.grams) })), sources: [...new Set(items.map(item => foods.find(food => food.id === item.foodId).source.name))], catalog });
  });
  router.post('/meal-plans/generate', (req, res) => {
    let request;
    try {
      request = validateMealPlanRequest(req.body, { foods });
    } catch (error) {
      if (error.code !== 'INVALID_MEAL_PLAN_REQUEST') throw error;
      return res.status(400).json({ error: 'Dữ liệu tạo thực đơn không hợp lệ.', code: error.code, issues: error.issues });
    }
    if (catalog?.status === 'pending') {
      return res.json({ ...unavailable('FOOD_SOURCE_UNAVAILABLE', PENDING_DATASET_MESSAGE, catalog.version), catalog });
    }
    return res.json({ ...generatePlan({ foods, mealTemplates, catalog, request }), catalog });
  });
  router.use('/meal-entries', createMealEntryRouter({ foods, demoContext }));
  router.use('/shopping-lists', createShoppingListRouter({ foods, demoContext }));
  return router;
}

module.exports = { createApiRouter };
