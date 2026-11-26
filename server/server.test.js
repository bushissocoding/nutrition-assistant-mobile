const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const port = 4400 + Math.floor(Math.random() * 1000);
const demoDataFile = path.join(os.tmpdir(), `nutrition-assistant-api-${process.pid}-${port}.json`);
const invalidConfig = spawnSync(process.execPath, [path.join(__dirname, 'server.js')], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PORT: 'invalid-port', DEMO_DATA_ENABLED: 'false' },
  encoding: 'utf8',
  timeout: 10000,
});
const invalidConfigOutput = `${invalidConfig.stdout || ''}${invalidConfig.stderr || ''}`;
assert.equal(invalidConfig.status, 1, 'server should reject invalid configuration before listening');
assert.match(invalidConfigOutput, /PORT must be an integer between 1 and 65535/);
assert.doesNotMatch(invalidConfigOutput, /invalid-port/);

const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PORT: String(port), CORS_ORIGIN: 'http://localhost', DEMO_DATA_ENABLED: 'true', DEMO_DATA_FILE: demoDataFile },
  stdio: 'ignore',
});
const base = `http://127.0.0.1:${port}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const namespace = `nutrition-pending-test-${process.pid}`;

async function verifySignalShutdown(signal, portOffset) {
  const signalPort = port + portOffset;
  const signalChild = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(signalPort), DEMO_DATA_ENABLED: 'false' },
    stdio: 'ignore',
  });
  const signalBase = `http://127.0.0.1:${signalPort}`;

  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(`${signalBase}/health`)).ok) { ready = true; break; } } catch {}
      await sleep(100);
    }
    assert.equal(ready, true, `server should start before ${signal} test`);

    const exit = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`${signal} shutdown did not finish in time`)), 5000);
      signalChild.once('exit', (code, exitSignal) => {
        clearTimeout(timeout);
        resolve({ code, signal: exitSignal });
      });
    });
    assert.equal(signalChild.kill(signal), true, `should send ${signal}`);
    const result = await exit;
    assert.equal(result.code, 0, `${signal} should close the server cleanly`);
    assert.equal(result.signal, null, `${signal} should be handled by the process`);
  } finally {
    if (signalChild.exitCode === null && signalChild.signalCode === null) signalChild.kill();
  }
}

const scopedHeaders = extra => ({ 'content-type': 'application/json', 'X-Demo-Namespace': namespace, ...(extra || {}) });

(async () => {
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(`${base}/health`)).ok) { ready = true; break; } } catch {}
      await sleep(100);
    }
    assert.equal(ready, true, 'server should start');

    const healthResponse = await fetch(`${base}/health`);
    assert.equal((await healthResponse.json()).status, 'ok');
    assert.equal(healthResponse.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(healthResponse.headers.get('x-frame-options'), 'DENY');
    assert.equal(healthResponse.headers.get('x-powered-by'), null);
    const rejectedOrigin = await fetch(`${base}/api/v1/foods`, { headers: { origin: 'https://attacker.example.test' } });
    assert.equal(rejectedOrigin.status, 403);
    const anonymousIdentity = await fetch(`${base}/api/v1/me`);
    assert.equal(anonymousIdentity.status, 401);
    assert.equal((await anonymousIdentity.json()).code, 'AUTHENTICATION_REQUIRED');
    const unconfiguredIdentity = await fetch(`${base}/api/v1/me`, { headers: { authorization: 'Bearer synthetic-test-token' } });
    assert.equal(unconfiguredIdentity.status, 503);
    assert.equal((await unconfiguredIdentity.json()).code, 'AUTH_PROVIDER_UNAVAILABLE');
    const preflight = await fetch(`${base}/api/v1/meal-entries`, { method: 'OPTIONS', headers: { origin: 'http://localhost', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,x-demo-namespace,idempotency-key' } });
    assert.equal(preflight.status, 204);
    const allowedHeaders = (preflight.headers.get('access-control-allow-headers') || '').toLowerCase().split(',').map(header => header.trim());
    for (const header of ['content-type', 'x-demo-namespace', 'idempotency-key', 'authorization']) assert.ok(allowedHeaders.includes(header));
    const allowedMethods = (preflight.headers.get('access-control-allow-methods') || '').toUpperCase().split(',').map(method => method.trim());
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) assert.ok(allowedMethods.includes(method));

    const catalogResponse = await fetch(`${base}/api/v1/foods?q=cơm`);
    const catalog = await catalogResponse.json();
    assert.equal(catalogResponse.status, 200);
    assert.equal(catalog.count, 0);
    assert.equal(catalog.catalog.status, 'pending');
    assert.match(catalog.catalog.notice, /Viện Dinh dưỡng/);
    assert.match(catalog.catalog.notice, /quyền tái phân phối/);

    const searchResponse = await fetch(`${base}/api/v1/foods/search?q=rau`);
    assert.equal(searchResponse.status, 503);
    assert.equal((await searchResponse.json()).code, 'FOOD_SOURCE_UNAVAILABLE');
    const detailResponse = await fetch(`${base}/api/v1/foods/vietnam-nin/record-1`);
    assert.equal(detailResponse.status, 503);
    assert.equal((await detailResponse.json()).code, 'FOOD_SOURCE_UNAVAILABLE');

    const calculationResponse = await fetch(`${base}/api/v1/nutrition/calculate-sourced`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [{ foodId: 'vietnam-nin:record-1', grams: 100 }] }),
    });
    assert.equal(calculationResponse.status, 503);
    assert.equal((await calculationResponse.json()).code, 'FOOD_SOURCE_UNAVAILABLE');
    const invalidCalculation = await fetch(`${base}/api/v1/nutrition/calculate`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [{ foodId: 'missing', grams: 10 }] }),
    });
    assert.equal(invalidCalculation.status, 400);

    const planResponse = await fetch(`${base}/api/v1/meal-plans/generate`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contractVersion: 1 }),
    });
    const plan = await planResponse.json();
    assert.equal(plan.status, 'unavailable');
    assert.equal(plan.unavailability.code, 'FOOD_SOURCE_UNAVAILABLE');
    assert.deepEqual(plan.plan, []);
    const invalidPlan = await fetch(`${base}/api/v1/meal-plans/generate`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ preferences: 12 }),
    });
    assert.equal(invalidPlan.status, 400);
    assert.equal((await invalidPlan.json()).code, 'INVALID_MEAL_PLAN_REQUEST');

    const missingDiaryNamespace = await fetch(`${base}/api/v1/meal-entries?date=2026-11-16&timeZone=Asia%2FHo_Chi_Minh`);
    assert.equal(missingDiaryNamespace.status, 400);
    assert.equal((await missingDiaryNamespace.json()).code, 'DEMO_NAMESPACE_REQUIRED');
    const missingGroceryNamespace = await fetch(`${base}/api/v1/shopping-lists/current`);
    assert.equal(missingGroceryNamespace.status, 400);
    assert.equal((await missingGroceryNamespace.json()).code, 'DEMO_NAMESPACE_REQUIRED');
    const emptyGroceryList = await fetch(`${base}/api/v1/shopping-lists/current`, { headers: { 'X-Demo-Namespace': namespace } });
    assert.equal(emptyGroceryList.status, 200);
    assert.equal((await emptyGroceryList.json()).list, null);

    const invalidDemoDiary = await fetch(`${base}/api/v1/meal-entries`, {
      method: 'POST', headers: scopedHeaders({ 'Idempotency-Key': 'create-entry-0001' }),
      body: JSON.stringify({ foodId: 'vietnam-nin:record-1', portion: { amount: 100, unit: 'g' }, mealType: 'LUNCH', consumedAt: '2026-11-16T12:15:00+07:00', timeZone: 'Asia/Ho_Chi_Minh' }),
    });
    assert.equal(invalidDemoDiary.status, 400);

    const invalidDemoShopping = await fetch(`${base}/api/v1/shopping-lists`, {
      method: 'POST', headers: scopedHeaders({ 'Idempotency-Key': 'grocery-create-0001' }),
      body: JSON.stringify({ items: [{ foodId: 'vietnam-nin:record-1', amount: 100, unit: 'g' }] }),
    });
    assert.equal(invalidDemoShopping.status, 400);

    await fs.writeFile(demoDataFile, '{ invalid store', 'utf8');
    const diaryStoreFailure = await fetch(`${base}/api/v1/meal-entries?date=2026-11-16&timeZone=Asia%2FHo_Chi_Minh`, { headers: { 'X-Demo-Namespace': namespace } });
    assert.equal(diaryStoreFailure.status, 503);
    assert.equal((await diaryStoreFailure.json()).code, 'DEMO_STORE_UNAVAILABLE');
    const groceryStoreFailure = await fetch(`${base}/api/v1/shopping-lists/current`, { headers: { 'X-Demo-Namespace': namespace } });
    assert.equal(groceryStoreFailure.status, 503);
    assert.equal((await groceryStoreFailure.json()).code, 'DEMO_STORE_UNAVAILABLE');

    if (process.platform !== 'win32') {
      await verifySignalShutdown('SIGINT', 10000);
      await verifySignalShutdown('SIGTERM', 11000);
    }
    console.log('Backend smoke tests passed.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    child.kill();
    await fs.rm(demoDataFile, { force: true });
  }
})();
