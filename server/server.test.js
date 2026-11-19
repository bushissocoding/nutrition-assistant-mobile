const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const port = 4400 + Math.floor(Math.random() * 1000);
const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(port), CORS_ORIGIN: 'http://localhost' }, stdio: 'ignore' });
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
    const planRes = await fetch(`${base}/api/v1/meal-plans/generate`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({contractVersion:'1.0',budgetVnd:120000,allergies:[]}) });
    const plan = await planRes.json();
    assert.equal(plan.plan.length, 3, 'a feasible request returns a full day');
    assert.equal(plan.feasibility.status, 'feasible');
    assert.ok(plan.grocery.length > 0);
    assert.ok(plan.plan.every(m => m.nutrients.energyKcal > 0 && m.portions.every(p => p.source.name)));
    const allergyRes = await fetch(`${base}/api/v1/meal-plans/generate`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({contractVersion:'1.0',budgetVnd:120000,allergies:['cá']}) });
    const allergy = await allergyRes.json();
    assert.equal(allergy.plan.length, 0, 'allergy constraints are never relaxed into a partial plan');
    assert.equal(allergy.feasibility.status, 'infeasible');
    assert.equal(allergy.feasibility.code, 'NO_SAFE_RECIPE_FOR_EACH_MEAL');
    const constrainedRes = await fetch(`${base}/api/v1/meal-plans/generate`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({contractVersion:'1.0',budgetVnd:120000,hardLimits:{sodiumMg:{max:500}}}) });
    const constrained = await constrainedRes.json();
    assert.ok(constrained.dailyTotals.sodiumMg <= 500 || constrained.plan.length === 0, 'hard nutrient ceiling must be honored');
    const impossibleRes = await fetch(`${base}/api/v1/meal-plans/generate`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({contractVersion:'1.0',budgetVnd:120000,hardLimits:{sodiumMg:{max:0}}}) });
    const impossible = await impossibleRes.json();
    assert.equal(impossible.plan.length, 0, 'infeasible clinical hard limits must not be relaxed');
    assert.equal(impossible.planFeasible, false);
    assert.equal(impossible.feasibility.status, 'infeasible');
    assert.equal(impossible.feasibility.code, 'HARD_LIMITS_UNSATISFIABLE');
    const goalRes = await fetch(`${base}/api/v1/meal-plans/generate`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({contractVersion:'1.0',budgetVnd:120000,targets:{fiberG:{min:10}}}) });
    const goal = await goalRes.json();
    assert.ok(goal.dailyTotals.fiberG >= 10 || goal.warnings.length > 0, 'goals reported as satisfied or soft-goal warning');
    const invalidTargets = await fetch(`${base}/api/v1/meal-plans/generate`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({contractVersion:'1.0',budgetVnd:120000,targets:{energyKcal:{min:-1}}}) });
    assert.equal(invalidTargets.status, 400);
    const invalidContract = await fetch(`${base}/api/v1/meal-plans/generate`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({contractVersion:'2.0',budgetVnd:120000}) });
    const missingContract = await fetch(`${base}/api/v1/meal-plans/generate`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({budgetVnd:120000}) });
    const missingContractBody = await missingContract.json();
    assert.equal(missingContract.status, 400);
    assert.equal(missingContractBody.error.code, 'INVALID_INPUT');
    const invalidContractBody = await invalidContract.json();
    assert.equal(invalidContract.status, 400);
    assert.equal(invalidContractBody.error.code, 'UNSUPPORTED_CONTRACT_VERSION');
    const invalidBudget = await fetch(`${base}/api/v1/meal-plans/generate`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({contractVersion:'1.0',budgetVnd:'120000'}) });
    const invalidBudgetBody = await invalidBudget.json();
    assert.equal(invalidBudget.status, 400);
    assert.equal(invalidBudgetBody.error.code, 'INVALID_INPUT');
    const invalidJson = await fetch(`${base}/api/v1/meal-plans/generate`, { method: 'POST', headers: {'content-type':'application/json'}, body: '{' });
    const invalidJsonBody = await invalidJson.json();
    assert.equal(invalidJson.status, 400);
    assert.equal(invalidJsonBody.error.code, 'INVALID_JSON');
    const bad = await fetch(`${base}/api/v1/nutrition/calculate`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({items:[{foodId:'missing',grams:10}]}) });
    assert.equal(bad.status, 400);
    console.log('Backend smoke tests passed.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally { child.kill(); }
})();
