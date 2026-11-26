'use strict';

const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { createClient } = require('@supabase/supabase-js');
const { createApiClient, createApiMethods } = require('../../app/src/services/api-client.cjs');
const { readLocalSupabaseSettings } = require('./local-supabase-config.cjs');

const repositoryRoot = path.resolve(__dirname, '../..');
const authOptions = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
let stage = 'read local Supabase status';

function fail(label) {
  const error = new Error(label);
  error.code = 'INTEGRATION_CHECK_FAILED';
  throw error;
}

function ensure(condition, label) {
  if (!condition) fail(label);
}

async function expectStatus(operation, status, label) {
  try {
    await operation();
  } catch (error) {
    if (error?.status === status) return;
    fail(label);
  }
  fail(label);
}

async function findOpenPort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return port;
}

function startApi(port, settings) {
  const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => [
    'PATH', 'Path', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'windir', 'TEMP', 'TMP', 'TMPDIR',
  ].includes(name)));
  const env = {
    ...inheritedEnvironment,
    NODE_ENV: 'test',
    PORT: String(port),
    API_HOST: '127.0.0.1',
    CORS_ORIGIN: `http://127.0.0.1:${port}`,
    DEMO_DATA_ENABLED: 'false',
    SUPABASE_URL: settings.url,
    SUPABASE_PUBLISHABLE_KEY: settings.publishableKey,
    SUPABASE_SECRET_KEY: settings.secretKey,
    PAYOS_CLIENT_ID: '',
    PAYOS_API_KEY: '',
    PAYOS_CHECKSUM_KEY: '',
    PAYOS_RETURN_URL: '',
    PAYOS_CANCEL_URL: '',
    PAYOS_WEBHOOK_URL: '',
    OPENAI_API_KEY: '',
    OPENAI_MODEL: '',
    EXPO_PUSH_ACCESS_TOKEN: '',
  };
  return spawn(process.execPath, ['server/server.js'], {
    cwd: repositoryRoot,
    env,
    stdio: 'ignore',
    windowsHide: true,
  });
}

async function waitForApi(child, baseUrl) {
  const deadline = Date.now() + 30_000;
  let childFailed = false;
  child.once('error', () => { childFailed = true; });
  while (Date.now() < deadline) {
    if (childFailed || child.exitCode !== null || child.signalCode !== null) fail('API server startup');
    try {
      const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        const result = await response.json();
        if (result?.status === 'ok') return;
      }
    } catch { /* The server may still be starting. */ }
    await delay(200);
  }
  fail('API health check');
}

async function stopApi(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise(resolve => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

async function createSyntheticAccount(admin, authClient, cleanupIds, label) {
  stage = `create synthetic ${label} Auth account`;
  const email = `api-e2e-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString('base64url');
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { integration_fixture: true },
  });
  if (created.error || typeof created.data?.user?.id !== 'string') fail(`create ${label} Auth account`);
  const userId = created.data.user.id;
  cleanupIds.add(userId);

  stage = `sign in synthetic ${label} Auth account`;
  const signedIn = await authClient.auth.signInWithPassword({ email, password });
  const token = signedIn.data?.session?.access_token;
  if (signedIn.error || typeof token !== 'string' || !token) fail(`sign in ${label} Auth account`);
  return { id: userId, token };
}

function currentLocalDate(timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function runJourney() {
  const settings = readLocalSupabaseSettings();
  const admin = createClient(settings.url, settings.secretKey, authOptions);
  const authClient = createClient(settings.url, settings.publishableKey, authOptions);
  const cleanupIds = new Set();
  const port = await findOpenPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let child = null;
  let activeToken = null;
  const api = createApiMethods(createApiClient({
    baseUrl,
    getAccessToken: async () => activeToken,
    timeoutMs: 10_000,
  }));

  try {
    const first = await createSyntheticAccount(admin, authClient, cleanupIds, 'account A');
    const second = await createSyntheticAccount(admin, authClient, cleanupIds, 'account B');

    stage = 'start loopback API';
    child = startApi(port, settings);
    await waitForApi(child, baseUrl);

    activeToken = first.token;
    stage = 'verify first account identity and consent';
    ensure((await api.getCurrentUser()).user?.id === first.id, 'first account identity');
    ensure((await api.getMyConsent()).consent === null, 'first account starts without consent');
    const firstConsent = {
      profile_processing: true,
      nutrition_processing: true,
      data_lifecycle: true,
      ai_processing: false,
      health_record_storage: true,
    };
    const savedConsent = await api.saveMyConsent(firstConsent);
    ensure(savedConsent.consent?.choices?.health_record_storage === true, 'first account consent save');

    stage = 'save first account profile';
    const profileA = {
      username: `e2e_${randomUUID().replaceAll('-', '').slice(0, 18)}`,
      dateOfBirth: null,
      mode: 'healthy',
      gender: 'unspecified',
      age: 30,
      heightCm: 170,
      weightKg: 65,
      activityLevel: 'moderate',
      conditionType: 'unspecified',
      allergies: [],
      symptomNotes: '',
      redFlags: [],
      diagnosisNotes: '',
      hardLimits: {},
      medicalLimitsConfirmed: false,
    };
    const savedProfileA = (await api.saveMyProfile(profileA)).profile;
    ensure(savedProfileA?.username === profileA.username && savedProfileA.dateOfBirth === null, 'first account profile save with an omitted date of birth');
    stage = 'save first account preferences';
    const personalization = {
      dietaryVariety: 'balanced',
      foodPreferences: ['easy_cook'],
      allergyReminder: true,
      trackConfirmedTargets: false,
    };
    ensure((await api.saveMyPersonalization(personalization)).preferences?.dietaryVariety === 'balanced', 'first account personalization save');
    const notificationPreferences = {
      inAppAppointments: true,
      inAppPayments: true,
      inAppMessages: false,
      pushEnabled: false,
      pushAppointments: true,
      pushPayments: false,
      pushMessages: true,
    };
    ensure((await api.saveMyNotificationPreferences(notificationPreferences)).preferences?.inAppMessages === false, 'notification preference save');
    ensure((await api.getMyNotificationPreferences()).preferences?.pushEnabled === false, 'notification preference read');

    stage = 'verify empty diary and local-timezone report';
    const timeZone = 'Asia/Ho_Chi_Minh';
    const reportDate = currentLocalDate(timeZone);
    const diary = await api.getMyMealEntries({ date: reportDate, timeZone });
    ensure(Array.isArray(diary.items) && diary.items.length === 0, 'empty account diary');
    const report = await api.getMyNutritionReport({ date: reportDate, timeZone, days: 7 });
    ensure(report.requestedDate === reportDate && report.timeZone === timeZone && report.days?.length === 7, 'local-timezone nutrition report');
    ensure((await api.getMyNotifications()).items.length === 0, 'empty account notification inbox');
    ensure((await api.markAllMyNotificationsRead()).updated === 0, 'empty account read-all notification action');

    stage = 'save first account pantry and synthetic health record';
    const pantryResult = await api.createMyPantryItem({ customName: 'Synthetic pantry fixture', amount: 1, unit: 'pack' });
    const pantryId = pantryResult.item?.id;
    ensure(typeof pantryId === 'string', 'first account pantry create');
    ensure((await api.updateMyPantryItem(pantryId, { amount: 2 })).item?.amount === 2, 'first account pantry update');
    ensure((await api.getMyPantryItem(pantryId)).item?.amount === 2, 'first account pantry read');

    const healthRecordResult = await api.saveMyHealthRecord({
      title: 'Synthetic integration record',
      sourceDate: reportDate,
      note: 'Synthetic fixture only.',
      results: [{ name: 'synthetic-marker', value: 'fixture-only', unit: 'test', referenceRange: 'fixture-only', confirmed: true }],
    }, undefined, randomUUID());
    const healthRecordId = healthRecordResult.record?.id;
    ensure(typeof healthRecordId === 'string', 'first account health record create');
    ensure((await api.getMyHealthRecord(healthRecordId)).record?.id === healthRecordId, 'first account health record read');

    stage = 'verify unconfigured providers fail explicitly';
    await api.saveMyAssistantConsent({ version: 'ai-assistant-processing-v1', accepted: true });
    await expectStatus(
      () => api.sendMyAssistantTurn({ clientMessageId: randomUUID(), message: 'Synthetic integration check.' }),
      503,
      'unconfigured assistant returns unavailable',
    );
    await expectStatus(() => api.searchSourcedFoods('synthetic-food'), 503, 'unconfigured food source returns unavailable');

    stage = 'verify account export';
    const firstExport = await api.getMyAccountExport();
    ensure(firstExport.identity?.id === first.id, 'first account export identity');
    ensure(firstExport.profile?.username === profileA.username, 'first account export profile');
    ensure(firstExport.pantryItems?.some(item => item.id === pantryId), 'first account export pantry');
    ensure(firstExport.healthRecords?.some(record => record.id === healthRecordId), 'first account export health record');
    ensure(firstExport.notificationPreferences?.inAppMessages === false, 'first account export notification preferences');

    stage = 'restart API and verify persisted account data';
    await stopApi(child);
    child = null;
    child = startApi(port, settings);
    await waitForApi(child, baseUrl);
    ensure((await api.getMyProfile()).profile?.username === profileA.username, 'profile survives API restart');
    ensure((await api.getMyPantryItem(pantryId)).item?.amount === 2, 'pantry survives API restart');
    ensure((await api.getMyHealthRecord(healthRecordId)).record?.id === healthRecordId, 'health record survives API restart');

    stage = 'verify second account isolation';
    activeToken = second.token;
    ensure((await api.getCurrentUser()).user?.id === second.id, 'second account identity');
    const secondConsent = { ...firstConsent, health_record_storage: false };
    await api.saveMyConsent(secondConsent);
    const profileB = { ...profileA, username: `e2e_${randomUUID().replaceAll('-', '').slice(0, 18)}` };
    ensure((await api.saveMyProfile(profileB)).profile?.username === profileB.username, 'second account profile save');
    ensure((await api.getMyPantry()).items.length === 0, 'second account sees no first account pantry rows');
    ensure((await api.getMyHealthRecords()).items.length === 0, 'second account sees no first account health records');
    await expectStatus(() => api.getMyPantryItem(pantryId), 404, 'second account cannot read first account pantry item');
    await expectStatus(() => api.getMyHealthRecord(healthRecordId), 404, 'second account cannot read first account health record');
    const secondExport = await api.getMyAccountExport();
    ensure(secondExport.identity?.id === second.id && secondExport.profile?.username === profileB.username, 'second account export ownership');
    ensure(!secondExport.pantryItems?.some(item => item.id === pantryId), 'second account export excludes first account pantry');
    ensure(!secondExport.healthRecords?.some(record => record.id === healthRecordId), 'second account export excludes first account record');

    stage = 'delete first account and retain second account';
    activeToken = first.token;
    await api.deleteMyAccount();
    cleanupIds.delete(first.id);
    await expectStatus(() => api.getCurrentUser(), 401, 'deleted first account token is rejected');
    activeToken = second.token;
    ensure((await api.getCurrentUser()).user?.id === second.id, 'second account remains active after first account deletion');
  } finally {
    const operationStage = stage;
    await stopApi(child);
    stage = 'clean up synthetic Auth accounts';
    const cleanupResults = await Promise.all([...cleanupIds].map(userId => admin.auth.admin.deleteUser(userId)));
    if (cleanupResults.some(({ error }) => error && !['user_not_found', 'USER_NOT_FOUND'].includes(error.code))) {
      fail('temporary Auth account cleanup');
    }
    stage = operationStage;
  }
}

runJourney().then(() => {
  process.stdout.write('Authenticated API journey passed against loopback Supabase.\n');
}).catch(() => {
  process.stderr.write(`Authenticated API journey failed at: ${stage}.\n`);
  process.exitCode = 1;
});
