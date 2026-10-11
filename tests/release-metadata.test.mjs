import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('v1.6.8 metadata and built bundles agree', () => {
  const pkg = JSON.parse(read('../package.json'));
  const lock = JSON.parse(read('../package-lock.json'));
  assert.equal(pkg.version, '1.6.8');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  for (const name of ['weather-chart-card.js', 'weather-chart-card-ha.js']) {
    assert.match(read(`../dist/${name}`).split('\n', 1)[0], /^\/\* weather-chart-card v1\.6\.8 \*\/$/);
  }
});
