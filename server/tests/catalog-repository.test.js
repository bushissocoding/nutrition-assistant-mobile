const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadCatalog } = require('../src/repositories/catalog');

function writeCatalogFiles(t, catalog, sources) {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'food-catalog-serving-'));
  t.after(() => fs.rmSync(dataDirectory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dataDirectory, 'foods.json'), `${JSON.stringify(catalog)}\n`);
  fs.writeFileSync(path.join(dataDirectory, 'meals.json'), '[]\n');
  fs.writeFileSync(path.join(dataDirectory, 'sources.json'), `${JSON.stringify(sources)}\n`);
  return dataDirectory;
}

function makeSyntheticExternalCatalog(reviewStatus = 'pending-review') {
  const fixturePath = path.join(__dirname, '..', 'data', 'fixtures', 'synthetic-foods.json');
  const catalog = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  catalog.status = 'licensed';
  catalog.version = 'synthetic-loader-test-v1';
  catalog.foods[0].version = catalog.version;
  catalog.foods[0].review = reviewStatus === 'approved'
    ? { status: 'approved', reviewedBy: 'synthetic-reviewer', reviewedOn: '2026-02-01' }
    : { status: reviewStatus, reviewedBy: null, reviewedOn: null };
  for (const [group, provenance] of Object.entries(catalog.foods[0].provenance.groups)) {
    provenance.sourceId = 'synthetic-approved-source-test';
    provenance.sourceRecordId = `synthetic-row-${group}`;
    provenance.edition = 'synthetic-source-edition';
    provenance.sourceReference = `test-only#${group}-row-1`;
    provenance.accessedOn = '2026-01-15';
  }

  const sources = {
    records: [{
      id: 'synthetic-approved-source-test',
      kind: 'external',
      name: 'Synthetic source for repository tests',
      url: 'https://example.test/food-table',
      dataset: 'Synthetic test rows only',
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
  return { catalog, sources };
}

test('the active empty pending catalog still loads', () => {
  const { foods, catalog } = loadCatalog();

  assert.deepEqual(foods, []);
  assert.equal(catalog.status, 'pending');
});

test('the active catalog loader refuses the synthetic fixture', t => {
  const fixturePath = path.join(__dirname, '..', 'data', 'fixtures', 'synthetic-foods.json');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const dataDirectory = writeCatalogFiles(t, fixture, {
    records: [{ id: 'synthetic-fixture', kind: 'synthetic-fixture', name: 'Test fixture' }],
  });

  assert.throws(() => loadCatalog({ dataDirectory }), /Synthetic fixture catalogs cannot be served/);
});

test('external food records without approved review cannot be served', t => {
  const { catalog, sources } = makeSyntheticExternalCatalog();
  const dataDirectory = writeCatalogFiles(t, catalog, sources);

  assert.throws(() => loadCatalog({ dataDirectory }), /approved review before serving external source data/);
});

test('external food records load only after rights, provenance, and reviewer approval are complete', t => {
  const { catalog: approvedCatalog, sources } = makeSyntheticExternalCatalog('approved');
  const dataDirectory = writeCatalogFiles(t, approvedCatalog, sources);

  const result = loadCatalog({ dataDirectory });

  assert.equal(result.foods.length, 1);
  assert.equal(result.catalog.status, 'licensed');
  assert.equal(result.foods[0].source.id, 'synthetic-approved-source-test');
  assert.equal(result.foods[0].source.redistributionStatus, 'permitted');
});
