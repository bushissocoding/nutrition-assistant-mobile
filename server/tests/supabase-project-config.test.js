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
  assert.match(ownerTest, /select plan\(5\)/);
  assert.match(ownerTest, /account one cannot update account two profile/);
  assert.match(ownerTest, /account two reads only its own profile/);
});
