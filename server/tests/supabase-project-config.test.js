const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '../..');

test('checks in a secret-free local Supabase CLI config and ordered migrations', () => {
  const config = fs.readFileSync(path.join(repositoryRoot, 'supabase/config.toml'), 'utf8');
  const activeConfig = config.split(/\r?\n/).filter(line => !line.trim().startsWith('#')).join('\n');
  assert.match(config, /^project_id = "nutrition-assistant-mobile"$/m);
  assert.match(config, /^major_version = 17$/m);
  assert.match(config, /^enabled = false$/m);
  assert.match(config, /^sql_paths = \[\]$/m);
  assert.match(config, /^\[storage\]\n^enabled = true$/m);
  assert.doesNotMatch(activeConfig, /project-ref|secret|service_role|publishableKey/i);

  const migrationNames = fs.readdirSync(path.join(repositoryRoot, 'supabase/migrations')).sort();
  assert.ok(migrationNames.length >= 10);
  assert.ok(migrationNames.every(name => /^\d{12}_[a-z0-9_]+\.sql$/.test(name)));
  const versions = migrationNames.map(name => name.slice(0, 12));
  assert.equal(new Set(versions).size, versions.length);
  const ownerTest = fs.readFileSync(path.join(repositoryRoot, 'supabase/tests/account_owner_isolation.test.sql'), 'utf8');
  assert.match(ownerTest, /select plan\(9\)/);
  assert.match(ownerTest, /RLS enabled on all private application tables/);
  assert.match(ownerTest, /anonymous users cannot read private application tables/);
  assert.match(ownerTest, /health record bucket is private/);
  assert.match(ownerTest, /account one cannot update account two profile/);
  assert.match(ownerTest, /account two reads only its own profile/);
});

test('runs local Supabase migrations and pgTAP in a dedicated CI job', () => {
  const workflow = fs.readFileSync(path.join(repositoryRoot, '.github/workflows/ci.yml'), 'utf8');
  assert.match(workflow, /^  supabase-integration:$/m);
  assert.match(workflow, /uses: supabase\/setup-cli@v3/);
  assert.match(workflow, /version: 2\.84\.2/);
  assert.match(workflow, /^\s+run: supabase start$/m);
  assert.match(workflow, /^\s+run: supabase db reset$/m);
  assert.match(workflow, /^\s+run: supabase test db$/m);
});
