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

const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(port), CORS_ORIGIN: 'http://localhost', DEMO_DATA_ENABLED: 'true', DEMO_DATA_FILE: demoDataFile }, stdio: 'ignore' });
const base = `http://127.0.0.1:${port}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const namespace = `diary-test-${process.pid}`;
const entryPayload = {
  foodId: 'rice-steamed',
  portion: { amount: 100, unit: 'g' },
  mealType: 'LUNCH',
  consumedAt: '2026-11-16T12:15:00+07:00',
  timeZone: 'Asia/Ho_Chi_Minh',
  notes: 'synthetic test note',
};
const scopedHeaders = extra => ({ 'content-type': 'application/json', 'X-Demo-Namespace': namespace, ...(extra || {}) });

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

(async () => {
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(`${base}/health`)).ok) { ready = true; break; } } catch {}
      await sleep(100);
    }
    assert.equal(ready, true, 'server should start');
    const health = await (await fetch(`${base}/health`)).json();
    assert.equal(health.status, 'ok');
    const preflight = await fetch(`${base}/api/v1/meal-entries`, { method: 'OPTIONS', headers: { origin: 'http://localhost', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,x-demo-namespace,idempotency-key' } });
    assert.equal(preflight.status, 204);
    const allowedHeaders = (preflight.headers.get('access-control-allow-headers') || '').toLowerCase().split(',').map(header => header.trim());
    assert.ok(allowedHeaders.includes('content-type'));
    assert.ok(allowedHeaders.includes('x-demo-namespace'));
    assert.ok(allowedHeaders.includes('idempotency-key'));
    const allowedMethods = (preflight.headers.get('access-control-allow-methods') || '').toUpperCase().split(',').map(method => method.trim());
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) assert.ok(allowedMethods.includes(method));
    const search = await (await fetch(`${base}/api/v1/foods?q=cơm`)).json();
    assert.equal(search.count, 1);
    const calcRes = await fetch(`${base}/api/v1/nutrition/calculate`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({items:[{foodId:'rice-steamed',grams:100}]}) });
    const calc = await calcRes.json();
    assert.equal(calc.totals.energyKcal, 130);
    assert.equal(calc.totals.sodiumMg, 1);
    const planRes = await fetch(`${base}/api/v1/meal-plans/generate`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({budgetVnd:120000,allergies:['cá']}) });
    const plan = await planRes.json();
    assert.equal(plan.plan.length, 2, 'fish allergy makes the sample dinner unavailable; other slots remain');
    assert.equal(plan.plan.some(m => m.name.includes('Cá')), false, 'allergy should filter fish meals');
    assert.ok(plan.grocery.length > 0);
    assert.ok(plan.plan.every(m => m.nutrients.energyKcal > 0));
    const constrainedRes = await fetch(`${base}/api/v1/meal-plans/generate`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({budgetVnd:120000,hardLimits:{sodiumMg:{max:500}}}) });
    const constrained = await constrainedRes.json();
    assert.ok(constrained.dailyTotals.sodiumMg <= 500 || constrained.plan.length === 0, 'hard nutrient ceiling must be honored');
    const impossibleRes = await fetch(`${base}/api/v1/meal-plans/generate`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({budgetVnd:120000,hardLimits:{sodiumMg:{max:0}}}) });
    const impossible = await impossibleRes.json();
    assert.equal(impossible.plan.length, 0, 'infeasible clinical hard limits must not be relaxed');
    assert.equal(impossible.planFeasible, false);
    const goalRes = await fetch(`${base}/api/v1/meal-plans/generate`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({budgetVnd:120000,targets:{fiberG:{min:10}}}) });
    const goal = await goalRes.json();
    assert.ok(goal.dailyTotals.fiberG >= 10 || goal.warnings.length > 0, 'goals reported as satisfied or soft-goal warning');
    const invalidTargets = await fetch(`${base}/api/v1/meal-plans/generate`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({targets:{energyKcal:{min:-1}}}) });
    assert.equal(invalidTargets.status, 400);
    const bad = await fetch(`${base}/api/v1/nutrition/calculate`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({items:[{foodId:'missing',grams:10}]}) });
    assert.equal(bad.status, 400);

    const groceryUrl = `${base}/api/v1/shopping-lists`;
    const groceryCurrentUrl = `${groceryUrl}/current`;
    const missingGroceryNamespace = await fetch(`${groceryCurrentUrl}`);
    assert.equal(missingGroceryNamespace.status, 400);
    assert.equal((await missingGroceryNamespace.json()).code, 'DEMO_NAMESPACE_REQUIRED');
    const groceryEmptyResponse = await fetch(groceryCurrentUrl, { headers: { 'X-Demo-Namespace': namespace } });
    assert.equal(groceryEmptyResponse.status, 200);
    assert.equal((await groceryEmptyResponse.json()).list, null);
    const invalidGrocery = await fetch(groceryUrl, { method: 'POST', headers: scopedHeaders({ 'Idempotency-Key': 'grocery-create-0001' }), body: JSON.stringify({ items: [{ foodId: 'rice-steamed', amount: -1, unit: 'g' }] }) });
    assert.equal(invalidGrocery.status, 400);
    assert.equal((await invalidGrocery.json()).code, 'VALIDATION_ERROR');
    const missingGroceryKey = await fetch(groceryUrl, { method: 'POST', headers: scopedHeaders(), body: JSON.stringify({ items: [{ foodId: 'rice-steamed', amount: 100, unit: 'g' }] }) });
    assert.equal(missingGroceryKey.status, 400);
    assert.equal((await missingGroceryKey.json()).code, 'VALIDATION_ERROR');
    const duplicateGroceryFood = await fetch(groceryUrl, { method: 'POST', headers: scopedHeaders({ 'Idempotency-Key': 'grocery-create-0001' }), body: JSON.stringify({ items: [{ foodId: 'rice-steamed', amount: 100, unit: 'g' }, { foodId: 'rice-steamed', amount: 200, unit: 'g' }] }) });
    assert.equal(duplicateGroceryFood.status, 400);
    const groceryPayload = { items: [{ foodId: 'rice-steamed', amount: 300, unit: 'g' }, { foodId: 'egg-boiled', amount: 2, unit: 'piece' }] };
    const groceryCreateHeaders = scopedHeaders({ 'Idempotency-Key': 'grocery-create-0001' });
    const groceryCreatedResponse = await fetch(groceryUrl, { method: 'POST', headers: groceryCreateHeaders, body: JSON.stringify(groceryPayload) });
    assert.equal(groceryCreatedResponse.status, 201);
    const groceryCreated = await groceryCreatedResponse.json();
    assert.equal(groceryCreated.list.source, 'meal-plan');
    assert.equal(groceryCreated.list.items.length, 2);
    assert.equal(groceryCreated.list.items[0].name, 'Cơm trắng');
    assert.equal(groceryCreated.list.items[0].purchased, false);
    assert.ok(groceryCreated.list.items[0].id);
    const groceryReplay = await fetch(groceryUrl, { method: 'POST', headers: groceryCreateHeaders, body: JSON.stringify(groceryPayload) });
    assert.equal(groceryReplay.status, 200);
    assert.equal((await groceryReplay.json()).list.id, groceryCreated.list.id);
    const groceryConflict = await fetch(groceryUrl, { method: 'POST', headers: groceryCreateHeaders, body: JSON.stringify({ items: [{ foodId: 'rice-steamed', amount: 500, unit: 'g' }] }) });
    assert.equal(groceryConflict.status, 409);
    const groceryOtherNamespace = await fetch(groceryCurrentUrl, { headers: { 'X-Demo-Namespace': `${namespace}-other` } });
    assert.equal((await groceryOtherNamespace.json()).list, null);
    const groceryItem = groceryCreated.list.items[0];
    const groceryPatch = await fetch(`${groceryCurrentUrl}/items/${groceryItem.id}`, { method: 'PATCH', headers: scopedHeaders(), body: JSON.stringify({ amount: 450, unit: 'g', purchased: true }) });
    assert.equal(groceryPatch.status, 200);
    const groceryPatched = await groceryPatch.json();
    assert.deepEqual({ amount: groceryPatched.item.amount, unit: groceryPatched.item.unit, purchased: groceryPatched.item.purchased }, { amount: 450, unit: 'g', purchased: true });
    const groceryBadPatch = await fetch(`${groceryCurrentUrl}/items/${groceryItem.id}`, { method: 'PATCH', headers: scopedHeaders(), body: JSON.stringify({ foodId: 'egg-boiled' }) });
    assert.equal(groceryBadPatch.status, 400);
    const groceryCrossPatch = await fetch(`${groceryCurrentUrl}/items/${groceryItem.id}`, { method: 'PATCH', headers: { ...scopedHeaders(), 'X-Demo-Namespace': `${namespace}-other` }, body: JSON.stringify({ purchased: true }) });
    assert.equal(groceryCrossPatch.status, 404);
    const groceryDeleteItem = await fetch(`${groceryCurrentUrl}/items/${groceryItem.id}`, { method: 'DELETE', headers: scopedHeaders() });
    assert.equal(groceryDeleteItem.status, 204);
    const groceryEmptyList = await fetch(groceryCurrentUrl, { headers: { 'X-Demo-Namespace': namespace } });
    assert.deepEqual((await groceryEmptyList.json()).list.items, [groceryCreated.list.items[1]]);
    const groceryDeleteCurrent = await fetch(groceryCurrentUrl, { method: 'DELETE', headers: scopedHeaders() });
    assert.equal(groceryDeleteCurrent.status, 204);
    const groceryDeleteRetry = await fetch(groceryUrl, { method: 'POST', headers: groceryCreateHeaders, body: JSON.stringify(groceryPayload) });
    assert.equal(groceryDeleteRetry.status, 410);
    const groceryReplacementPayload = { items: [{ foodId: 'rice-steamed', amount: 600, unit: 'g' }] };
    const groceryReplacement = await fetch(groceryUrl, { method: 'POST', headers: scopedHeaders({ 'Idempotency-Key': 'grocery-create-0002' }), body: JSON.stringify(groceryReplacementPayload) });
    assert.equal(groceryReplacement.status, 201);
    const staleGroceryRetry = await fetch(groceryUrl, { method: 'POST', headers: groceryCreateHeaders, body: JSON.stringify(groceryPayload) });
    assert.equal(staleGroceryRetry.status, 410);
    const groceryPurge = await fetch(groceryUrl, { method: 'DELETE', headers: scopedHeaders() });
    assert.equal(groceryPurge.status, 204);
    assert.equal((await (await fetch(groceryCurrentUrl, { headers: { 'X-Demo-Namespace': namespace } })).json()).list, null);
    const invalidGroceryJson = await fetch(groceryUrl, { method: 'POST', headers: scopedHeaders({ 'Idempotency-Key': 'grocery-create-0003' }), body: '{' });
    assert.equal(invalidGroceryJson.status, 400);
    assert.equal((await invalidGroceryJson.json()).code, 'VALIDATION_ERROR');

    const missingNamespace = await fetch(`${base}/api/v1/meal-entries?date=2026-11-16&timeZone=Asia%2FHo_Chi_Minh`);
    assert.equal(missingNamespace.status, 400);
    assert.equal((await missingNamespace.json()).code, 'DEMO_NAMESPACE_REQUIRED');
    const missingDate = await fetch(`${base}/api/v1/meal-entries`, { headers: { 'X-Demo-Namespace': namespace } });
    assert.equal(missingDate.status, 400);
    const invalidEntry = await fetch(`${base}/api/v1/meal-entries`, { method: 'POST', headers: scopedHeaders({ 'Idempotency-Key': 'create-entry-0001' }), body: JSON.stringify({ ...entryPayload, portion: { amount: -1, unit: 'g' } }) });
    assert.equal(invalidEntry.status, 400);
    assert.equal((await invalidEntry.json()).code, 'VALIDATION_ERROR');
    const missingKey = await fetch(`${base}/api/v1/meal-entries`, { method: 'POST', headers: scopedHeaders(), body: JSON.stringify(entryPayload) });
    assert.equal(missingKey.status, 400);
    const invalidKey = await fetch(`${base}/api/v1/meal-entries`, { method: 'POST', headers: scopedHeaders({ 'Idempotency-Key': 'bad key' }), body: JSON.stringify(entryPayload) });
    assert.equal(invalidKey.status, 400);
    const missingField = await fetch(`${base}/api/v1/meal-entries`, { method: 'POST', headers: scopedHeaders({ 'Idempotency-Key': 'create-entry-0001' }), body: JSON.stringify({ ...entryPayload, consumedAt: undefined }) });
    assert.equal(missingField.status, 400);
    const invalidJson = await fetch(`${base}/api/v1/meal-entries`, { method: 'POST', headers: scopedHeaders({ 'Idempotency-Key': 'create-entry-0001' }), body: '{' });
    assert.equal(invalidJson.status, 400);
    assert.equal((await invalidJson.json()).code, 'VALIDATION_ERROR');

    const createHeaders = scopedHeaders({ 'Idempotency-Key': 'create-entry-0001' });
    const createdResponse = await fetch(`${base}/api/v1/meal-entries`, { method: 'POST', headers: createHeaders, body: JSON.stringify(entryPayload) });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.item.nutrients.energyKcal, 130);
    const replayResponse = await fetch(`${base}/api/v1/meal-entries`, { method: 'POST', headers: createHeaders, body: JSON.stringify(entryPayload) });
    assert.equal(replayResponse.status, 200);
    assert.equal((await replayResponse.json()).item.id, created.item.id);
    const conflict = await fetch(`${base}/api/v1/meal-entries`, { method: 'POST', headers: createHeaders, body: JSON.stringify({ ...entryPayload, portion: { amount: 200, unit: 'g' } }) });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).code, 'IDEMPOTENCY_CONFLICT');

    const anotherEntry = { ...entryPayload, portion: { amount: 50, unit: 'g' }, consumedAt: '2026-11-16T11:15:00+07:00' };
    const secondBeforeDelete = await fetch(`${base}/api/v1/meal-entries`, { method: 'POST', headers: scopedHeaders({ 'Idempotency-Key': 'create-entry-0002' }), body: JSON.stringify(anotherEntry) });
    assert.equal(secondBeforeDelete.status, 201);

    const hiddenFromOtherNamespace = await fetch(`${base}/api/v1/meal-entries/${created.item.id}`, { headers: { 'X-Demo-Namespace': `${namespace}-other` } });
    assert.equal(hiddenFromOtherNamespace.status, 404);
    const dateUrl = `${base}/api/v1/meal-entries?date=2026-11-16&timeZone=Asia%2FHo_Chi_Minh&limit=1&offset=1`;
    const listedResponse = await fetch(dateUrl, { headers: { 'X-Demo-Namespace': namespace } });
    assert.equal(listedResponse.status, 200);
    const listed = await listedResponse.json();
    assert.deepEqual(listed.items.map(item => item.id), [created.item.id]);
    assert.equal(listed.totals.energyKcal, 195);
    assert.equal(listed.items[0].nutrients.energyKcal, 130);
    const invalidDate = await fetch(`${base}/api/v1/meal-entries?date=2026-02-30&timeZone=Asia%2FHo_Chi_Minh`, { headers: { 'X-Demo-Namespace': namespace } });
    assert.equal(invalidDate.status, 400);
    const invalidZone = await fetch(`${base}/api/v1/meal-entries?date=2026-11-16&timeZone=No%2FZone`, { headers: { 'X-Demo-Namespace': namespace } });
    assert.equal(invalidZone.status, 400);
    const invalidPagination = await fetch(`${base}/api/v1/meal-entries?date=2026-11-16&timeZone=Asia%2FHo_Chi_Minh&limit=101`, { headers: { 'X-Demo-Namespace': namespace } });
    assert.equal(invalidPagination.status, 400);
    const fetched = await fetch(`${base}/api/v1/meal-entries/${created.item.id}`, { headers: { 'X-Demo-Namespace': namespace } });
    assert.equal((await fetched.json()).item.id, created.item.id);

    const updatedResponse = await fetch(`${base}/api/v1/meal-entries/${created.item.id}`, { method: 'PATCH', headers: scopedHeaders(), body: JSON.stringify({ portion: { amount: 200, unit: 'g' }, notes: 'updated note' }) });
    assert.equal(updatedResponse.status, 200);
    const updated = await updatedResponse.json();
    assert.equal(updated.item.nutrients.energyKcal, 260);
    assert.equal(updated.item.notes, 'updated note');
    const rejectedPatch = await fetch(`${base}/api/v1/meal-entries/${created.item.id}`, { method: 'PATCH', headers: scopedHeaders(), body: JSON.stringify({ nutrients: { energyKcal: 1 } }) });
    assert.equal(rejectedPatch.status, 400);
    const crossNamespacePatch = await fetch(`${base}/api/v1/meal-entries/${created.item.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'X-Demo-Namespace': `${namespace}-other` }, body: JSON.stringify({ notes: 'must not update' }) });
    assert.equal(crossNamespacePatch.status, 404);

    const deleted = await fetch(`${base}/api/v1/meal-entries/${created.item.id}`, { method: 'DELETE', headers: { 'X-Demo-Namespace': namespace } });
    assert.equal(deleted.status, 204);
    const deletedAgain = await fetch(`${base}/api/v1/meal-entries/${created.item.id}`, { method: 'DELETE', headers: { 'X-Demo-Namespace': namespace } });
    assert.equal(deletedAgain.status, 204);
    const deletedRetry = await fetch(`${base}/api/v1/meal-entries`, { method: 'POST', headers: createHeaders, body: JSON.stringify(entryPayload) });
    assert.equal(deletedRetry.status, 410);

    const purged = await fetch(`${base}/api/v1/meal-entries`, { method: 'DELETE', headers: { 'X-Demo-Namespace': namespace } });
    assert.equal(purged.status, 204);
    const afterPurge = await fetch(dateUrl, { headers: { 'X-Demo-Namespace': namespace } });
    assert.deepEqual((await afterPurge.json()).items, []);
    await fs.writeFile(demoDataFile, '{ invalid store', 'utf8');
    const storeFailure = await fetch(`${base}/api/v1/meal-entries`, { method: 'POST', headers: scopedHeaders({ 'Idempotency-Key': 'create-entry-0003' }), body: JSON.stringify(entryPayload) });
    assert.equal(storeFailure.status, 503);
    assert.equal((await storeFailure.json()).code, 'DEMO_STORE_UNAVAILABLE');
    const groceryStoreFailure = await fetch(groceryCurrentUrl, { headers: { 'X-Demo-Namespace': namespace } });
    assert.equal(groceryStoreFailure.status, 503);
    assert.equal((await groceryStoreFailure.json()).code, 'DEMO_STORE_UNAVAILABLE');
    // Node documents that SIGTERM cannot be delivered as a catchable signal on Windows.
    // The process-level signal checks therefore run on POSIX CI; unit tests cover both handlers everywhere.
    // https://nodejs.org/download/release/v22.23.0/docs/api/process.html#signal-events
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
