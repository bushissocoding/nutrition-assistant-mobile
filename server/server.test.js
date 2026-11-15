const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const port = 4400 + Math.floor(Math.random() * 1000);
const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT: String(port), CORS_ORIGIN: 'http://localhost' }, stdio: 'ignore' });
const base = `http://127.0.0.1:${port}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
    const goalRes = await fetch(`${base}/api/v1/meal-plans/generate`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({budgetVnd:120000,targets:{fiberG:{min:10}}}) });
    const goal = await goalRes.json();
    assert.ok(goal.dailyTotals.fiberG >= 10 || goal.warnings.length > 0, 'goals reported as satisfied or soft-goal warning');
    const invalidTargets = await fetch(`${base}/api/v1/meal-plans/generate`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({targets:{energyKcal:{min:-1}}}) });
    assert.equal(invalidTargets.status, 400);
    const bad = await fetch(`${base}/api/v1/nutrition/calculate`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({items:[{foodId:'missing',grams:10}]}) });
    assert.equal(bad.status, 400);
    console.log('Backend smoke tests passed.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally { child.kill(); }
})();
