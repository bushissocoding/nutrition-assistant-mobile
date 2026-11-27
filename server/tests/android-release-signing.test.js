const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Android release signing never falls back to the public debug keystore', () => {
  const gradle = fs.readFileSync(path.join(__dirname, '../../android/app/build.gradle'), 'utf8');
  const releaseBlock = gradle.match(/buildTypes\s*\{[\s\S]*?\n        release\s*\{([\s\S]*?)\n        \}/)?.[1];
  assert.ok(releaseBlock, 'release build type must be configured');
  assert.doesNotMatch(releaseBlock, /signingConfig\s+signingConfigs\.debug/);
  assert.match(releaseBlock, /signingConfig\s+signingConfigs\.release/);
  assert.match(gradle, /if \(createsReleaseArtifact && !hasReleaseSigning\)/);
  assert.match(gradle, /ANDROID_RELEASE_STORE_FILE/);
});
