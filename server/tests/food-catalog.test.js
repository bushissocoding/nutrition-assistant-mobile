const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateFoodCatalog, createChangeReport } = require('../src/services/food-catalog');
const { convertQuantityToGrams, calculatePortion } = require('../src/services/nutrition');
const { calculateTotals } = require('../src/services/nutrition');
const { parseArgs } = require('../scripts/import-food-catalog');

const sourceRegistry = {
  records: [
    {
      id: 'synthetic-fixture',
      kind: 'synthetic-fixture',
      rights: { redistributionStatus: 'permitted-for-tests' },
    },
  ],
};

function makeCatalog() {
  return {
    schemaVersion: 1,
    version: 'synthetic-fixture-1',
    status: 'synthetic-fixture',
    foods: [{
      id: 'synthetic-test-food',
      version: 'synthetic-fixture-1',
      name: 'Synthetic test food',
      aliases: ['fixture food'],
      category: 'fixture',
      allergens: [],
      tags: ['test-only'],
      preparation: { state: 'cooked', maturity: 'not-applicable' },
      serving: {
        amount: 50,
        unit: 'g',
        household: 'one synthetic unit',
        conversions: [{ amount: 1, unit: 'piece', grams: 50, method: 'synthetic-fixture' }],
      },
      nutrition: {
        basis: { amount: 100, unit: 'g', ediblePortion: true },
        values: {
          energyKcal: { value: 0, unit: 'kcal', status: 'reported' },
          proteinG: { value: 2, unit: 'g', status: 'reported' },
          carbohydrateG: { value: null, unit: 'g', status: 'missing', reason: 'not-in-fixture' },
          fatG: { value: 0, unit: 'g', status: 'reported' },
          fiberG: { value: 1, unit: 'g', status: 'reported' },
          sodiumMg: { value: 0, unit: 'mg', status: 'reported' },
        },
      },
      provenance: {
        groups: Object.fromEntries(['identity', 'preparation', 'serving', 'nutrition'].map(group => [group, {
          sourceId: 'synthetic-fixture',
          sourceRecordId: 'synthetic-test-food',
          edition: 'fixture-1',
          method: 'synthetic test fixture',
        }])),
      },
      review: { status: 'fixture-only', reviewedBy: null, reviewedOn: null },
    }],
  };
}

test('catalog validation preserves reported zero separately from missing null', () => {
  const result = validateFoodCatalog(makeCatalog(), { sourceRegistry, strictImport: true });
  assert.deepEqual(result.errors, []);
  assert.equal(result.catalog.foods[0].nutrition.values.energyKcal.value, 0);
  assert.equal(result.catalog.foods[0].nutrition.values.carbohydrateG.value, null);
  assert.equal(result.catalog.foods[0].nutrition.values.carbohydrateG.status, 'missing');
});

test('pending catalogs are valid only while they contain no food values', () => {
  const pending = { ...makeCatalog(), version: 'vietnam-nin-pending-v1', status: 'pending', foods: [] };
  assert.deepEqual(validateFoodCatalog(pending, { sourceRegistry }).errors, []);

  const invalid = { ...pending, foods: makeCatalog().foods };
  assert.match(validateFoodCatalog(invalid, { sourceRegistry }).errors.join(' '), /pending catalogs cannot contain food records/i);
});

test('missing nutrient fields, unexplained nulls and missing provenance are rejected', () => {
  for (const mutate of [
    catalog => { delete catalog.foods[0].nutrition.values.proteinG; },
    catalog => { delete catalog.foods[0].nutrition.values.carbohydrateG.reason; },
    catalog => { catalog.foods[0].nutrition.values.energyKcal.value = null; },
    catalog => { delete catalog.foods[0].provenance.groups.nutrition; },
    catalog => { catalog.foods[0].serving.conversions[0].unit = 'unknown-unit'; },
  ]) {
    const catalog = makeCatalog();
    mutate(catalog);
    assert.ok(validateFoodCatalog(catalog, { sourceRegistry, strictImport: true }).errors.length > 0);
  }
});

test('unknown totals remain null even when other portions contribute known values', () => {
  const missing = makeCatalog().foods[0];
  const known = structuredClone(missing);
  known.id = 'known-food';
  known.nutrition.values.carbohydrateG = { value: 5, unit: 'g', status: 'reported' };
  for (const foods of [[missing, known], [known, missing]]) {
    const totals = calculateTotals(foods.map(food => ({ foodId: food.id, grams: 100 })), foods);
    assert.equal(totals.carbohydrateG, null);
    assert.equal(totals.energyKcal, 0);
    assert.equal(totals.proteinG, 4);
  }
});

test('synthetic sources cannot be relabeled as a live catalog and legacy validation cannot publish', () => {
  const catalog = makeCatalog();
  catalog.status = 'prototype';
  assert.match(validateFoodCatalog(catalog, { sourceRegistry }).errors.join(' '), /fixture/);
  assert.throws(() => parseArgs(['--input', 'input.json', '--output', 'output.json', '--allow-legacy']), /validation-only/);
  assert.throws(() => parseArgs(['--input', 'input.json', '--output', 'output.json', '--report', 'input.json']), /overwrite/);
  assert.throws(() => parseArgs(['--input', 'licensed.json', '--output', path.join(__dirname, '..', 'data', 'foods.json')]), /active catalog/i);
});

test('invalid imports fail before creating output or a report', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'invalid-food-import-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const input = path.join(directory, 'invalid.json');
  const output = path.join(directory, 'output.json');
  const report = path.join(directory, 'report.json');
  const catalog = makeCatalog();
  delete catalog.foods[0].provenance;
  fs.writeFileSync(input, JSON.stringify(catalog));
  const result = spawnSync(process.execPath, [path.join(__dirname, '../scripts/import-food-catalog.js'), '--input', input, '--output', output, '--report', report, '--check'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /provenance/);
  assert.equal(fs.existsSync(output), false);
  assert.equal(fs.existsSync(report), false);
});

test('catalog validation rejects missing fields, invalid units, duplicate foods and out-of-range values', () => {
  const invalid = makeCatalog();
  invalid.foods[0].nutrition.values.proteinG.unit = 'mg';
  invalid.foods[0].nutrition.values.fatG.value = -1;
  invalid.foods.push(structuredClone(invalid.foods[0]));
  const result = validateFoodCatalog(invalid, { sourceRegistry, strictImport: true });
  assert.match(result.errors.join('\n'), /unit/i);
  assert.match(result.errors.join('\n'), /range/i);
  assert.match(result.errors.join('\n'), /duplicate/i);
});

test('strict import rejects external sources without confirmed redistribution rights and value-level references', () => {
  const catalog = makeCatalog();
  catalog.foods[0].provenance.groups.nutrition = {
    sourceId: 'unlicensed-table',
    sourceRecordId: null,
    edition: '2007',
    method: 'transcribed values',
  };
  const result = validateFoodCatalog(catalog, {
    sourceRegistry: { records: [{ id: 'unlicensed-table', kind: 'external', rights: { redistributionStatus: 'unconfirmed' } }] },
    strictImport: true,
  });
  assert.match(result.errors.join('\n'), /redistribution/i);
  assert.match(result.errors.join('\n'), /sourceRecordId/i);
});

test('strict external-source imports require evidence, explicit reuse permissions, verification, and attribution', () => {
  const catalog = makeCatalog();
  catalog.foods[0].provenance.groups.nutrition = {
    sourceId: 'synthetic-permission-test-source',
    sourceRecordId: 'synthetic-test-row',
    edition: 'synthetic-test-edition',
    sourceReference: 'test-only#nutrition-table-row-1',
    accessedOn: '2026-01-15',
    method: 'Synthetic permission-gate test only.',
  };
  const externalSource = {
    id: 'synthetic-permission-test-source',
    kind: 'external',
    name: 'Synthetic permission-gate source',
    url: 'https://example.test/food-table',
    rights: {
      license: { name: 'Synthetic test permission' },
      redistributionStatus: 'permitted',
      evidenceReference: 'test-only:permission-record',
      permittedActions: ['copy', 'transform', 'redistribute'],
      verifiedBy: 'synthetic-test-reviewer',
      verifiedOn: '2026-01-15',
      attribution: 'Synthetic test attribution only.',
    },
  };
  const registry = { records: [{ id: 'synthetic-fixture', kind: 'synthetic-fixture' }, externalSource] };

  assert.deepEqual(validateFoodCatalog(catalog, { sourceRegistry: registry, strictImport: true }).errors, []);

  const invalidCases = [
    [source => { source.url = null; }, /HTTPS source URL/i],
    [source => { source.rights.evidenceReference = null; }, /evidence reference/i],
    [source => { source.rights.permittedActions = ['copy', 'redistribute']; }, /transform/i],
    [source => { source.rights.permittedActions = ['transform', 'redistribute']; }, /copy/i],
    [source => { source.rights.permittedActions = ['copy', 'transform']; }, /redistribute/i],
    [source => { source.rights.verifiedBy = null; }, /verifier/i],
    [source => { source.rights.verifiedOn = '2026-13-40'; }, /verification date/i],
    [source => { source.rights.attribution = null; }, /attribution/i],
    [source => { source.rights.license = null; }, /license or written permission/i],
    [source => { source.rights.license = { name: '   ' }; }, /license or written permission/i],
  ];

  for (const [mutate, expectedError] of invalidCases) {
    const brokenSource = structuredClone(externalSource);
    mutate(brokenSource);
    const result = validateFoodCatalog(catalog, {
      sourceRegistry: { records: [{ id: 'synthetic-fixture', kind: 'synthetic-fixture' }, brokenSource] },
      strictImport: true,
    });
    assert.match(result.errors.join('\n'), expectedError);
  }
});

test('source registry rejects duplicate IDs instead of trusting whichever rights row appears last', () => {
  const catalog = makeCatalog();
  catalog.foods[0].provenance.groups.nutrition = {
    sourceId: 'duplicate-rights-source',
    sourceRecordId: 'synthetic-test-row',
    edition: 'synthetic-test-edition',
    sourceReference: 'test-only#nutrition-row-1',
    accessedOn: '2026-01-15',
    method: 'Synthetic duplicate-rights test only.',
  };
  const permittedSource = {
    id: 'duplicate-rights-source',
    kind: 'external',
    name: 'Synthetic duplicate-rights source',
    url: 'https://example.test/source',
    rights: {
      license: { name: 'Synthetic permission' },
      redistributionStatus: 'permitted',
      evidenceReference: 'test-only:permission',
      permittedActions: ['copy', 'transform', 'redistribute'],
      verifiedBy: 'synthetic-reviewer',
      verifiedOn: '2026-01-15',
      attribution: 'Synthetic test attribution.',
    },
  };
  const registry = {
    records: [
      { id: 'synthetic-fixture', kind: 'synthetic-fixture' },
      { ...structuredClone(permittedSource), rights: { redistributionStatus: 'unconfirmed' } },
      permittedSource,
    ],
  };

  const result = validateFoodCatalog(catalog, { sourceRegistry: registry, strictImport: true });

  assert.match(result.errors.join('\n'), /duplicate source ID/i);
});

test('strict external provenance requires an exact row reference and access date for every group', () => {
  const groups = ['identity', 'preparation', 'serving', 'nutrition'];
  const catalog = makeCatalog();
  for (const group of groups) {
    catalog.foods[0].provenance.groups[group] = {
      sourceId: 'synthetic-provenance-test-source',
      sourceRecordId: `synthetic-row-${group}`,
      edition: 'synthetic-test-edition',
      sourceReference: `test-only#${group}-table-row-1`,
      accessedOn: '2026-01-15',
      method: `Synthetic ${group} test method.`,
    };
  }
  const registry = {
    records: [{
      id: 'synthetic-provenance-test-source',
      kind: 'external',
      name: 'Synthetic provenance-gate source',
      url: 'https://example.test/food-table',
      rights: {
        license: { name: 'Synthetic test permission' },
        redistributionStatus: 'permitted',
        evidenceReference: 'test-only:permission-record',
        permittedActions: ['copy', 'transform', 'redistribute'],
        verifiedBy: 'synthetic-test-reviewer',
        verifiedOn: '2026-01-15',
        attribution: 'Synthetic test attribution only.',
      },
    }],
  };

  assert.deepEqual(validateFoodCatalog(catalog, { sourceRegistry: registry, strictImport: true }).errors, []);

  for (const group of groups) {
    for (const [mutate, expectedError] of [
      [provenance => { provenance.sourceRecordId = 'unknown'; }, /exact sourceRecordId and edition/i],
      [provenance => { provenance.sourceRecordId = '   '; }, /exact sourceRecordId and edition/i],
      [provenance => { provenance.sourceReference = 'unknown'; }, /exact source row\/cell reference/i],
      [provenance => { provenance.accessedOn = 'not-recorded'; }, /valid source access date/i],
    ]) {
      const invalidCatalog = structuredClone(catalog);
      mutate(invalidCatalog.foods[0].provenance.groups[group]);
      const result = validateFoodCatalog(invalidCatalog, { sourceRegistry: registry, strictImport: true });
      assert.match(result.errors.join('\n'), new RegExp(`provenance\\.groups\\.${group} .*${expectedError.source}`));
    }
  }
});

test('serving conversion uses metric factors and explicit per-food piece weights', () => {
  const food = makeCatalog().foods[0];
  assert.equal(convertQuantityToGrams(0.5, 'kg'), 500);
  assert.equal(convertQuantityToGrams(250, 'mg'), 0.25);
  assert.throws(() => convertQuantityToGrams(100, 'ml'), /conversion/i);
  assert.equal(calculatePortion(food, { amount: 2, unit: 'piece' }).proteinG, 2);
  assert.equal(calculatePortion(food, { amount: 1, unit: 'kg' }).proteinG, 20);
  assert.equal(calculatePortion(food, { amount: 1, unit: 'piece' }).energyKcal, 0);
  assert.equal(calculatePortion(food, { amount: 2, unit: 'piece' }).carbohydrateG, null);
});

test('change report identifies added, updated, removed and unchanged foods deterministically', () => {
  const previous = makeCatalog();
  const next = structuredClone(previous);
  next.version = 'synthetic-fixture-2';
  next.foods[0].version = next.version;
  next.foods[0].name = 'Renamed synthetic test food';
  next.foods.push({ ...structuredClone(next.foods[0]), id: 'added-food', name: 'Added synthetic food' });
  previous.foods.push({ ...structuredClone(previous.foods[0]), id: 'removed-food', name: 'Removed synthetic food' });
  previous.foods.push({ ...structuredClone(previous.foods[0]), id: 'unchanged-food', name: 'Unchanged synthetic food' });
  next.foods.push({ ...structuredClone(next.foods[0]), id: 'unchanged-food', name: 'Unchanged synthetic food' });
  next.foods.at(-1).version = previous.version;

  const report = createChangeReport(previous, next);
  assert.deepEqual(report.added, ['added-food']);
  assert.deepEqual(report.removed, ['removed-food']);
  assert.equal(report.updated[0].id, 'synthetic-test-food');
  assert.ok(report.updated[0].changedFields.includes('name'));
  assert.deepEqual(report.unchanged, ['unchanged-food']);
  assert.deepEqual(report, createChangeReport(previous, next));
});

test('synthetic fixture check reports deterministic changes without writing catalog files', t => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'food-catalog-import-'));
  t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));
  const fixture = path.join(__dirname, '..', 'data', 'fixtures', 'synthetic-foods.json');
  const sourceRegistryFile = path.join(__dirname, '..', 'data', 'sources.json');
  const script = path.join(__dirname, '..', 'scripts', 'import-food-catalog.js');
  const output = path.join(temporaryDirectory, 'catalog.json');
  const reportFile = path.join(temporaryDirectory, 'report.json');
  const args = [script, '--input', fixture, '--sources', sourceRegistryFile, '--previous', fixture, '--check'];

  const firstRun = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(firstRun.status, 0, firstRun.stderr);
  const report = JSON.parse(firstRun.stdout).report;
  assert.equal(report.counts.unchanged, 1);
  assert.equal(report.counts.added, 0);
  const secondRun = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(secondRun.status, 0, secondRun.stderr);
  assert.equal(secondRun.stdout, firstRun.stdout);
  assert.equal(fs.existsSync(output), false);
  assert.equal(fs.existsSync(reportFile), false);
});

test('import command refuses to write synthetic fixture data or a change report', t => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'food-catalog-fixture-write-'));
  t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));
  const fixture = path.join(__dirname, '..', 'data', 'fixtures', 'synthetic-foods.json');
  const sourceRegistryFile = path.join(__dirname, '..', 'data', 'sources.json');
  const script = path.join(__dirname, '..', 'scripts', 'import-food-catalog.js');
  const output = path.join(temporaryDirectory, 'catalog.json');
  const reportFile = path.join(temporaryDirectory, 'report.json');
  const result = spawnSync(process.execPath, [script, '--input', fixture, '--sources', sourceRegistryFile, '--output', output, '--report', reportFile], { encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /synthetic fixture catalogs are validation-only/i);
  assert.equal(fs.existsSync(output), false);
  assert.equal(fs.existsSync(reportFile), false);
});
