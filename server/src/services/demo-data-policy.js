const namespacePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const collectionPattern = /^[a-z][a-z0-9_-]{0,63}$/;

function isDemoDataEnabled(env = process.env) {
  const environment = String(env.NODE_ENV || '').toLowerCase();
  return environment !== 'production' && env.DEMO_DATA_ENABLED === 'true';
}

function isValidDemoNamespace(namespace) {
  return typeof namespace === 'string' && namespacePattern.test(namespace);
}

function assertDemoNamespace(namespace) {
  if (!isValidDemoNamespace(namespace)) {
    throw new TypeError('Demo namespace must contain 1–128 letters, numbers, hyphens, or underscores.');
  }
}

function assertDemoCollection(collection) {
  if (typeof collection !== 'string' || !collectionPattern.test(collection)) {
    throw new TypeError('Demo collection name must start with a lowercase letter and contain only letters, numbers, hyphens, or underscores.');
  }
}

module.exports = { assertDemoCollection, assertDemoNamespace, isDemoDataEnabled, isValidDemoNamespace };
