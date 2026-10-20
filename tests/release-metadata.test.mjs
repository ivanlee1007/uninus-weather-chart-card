import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const filenames = ['uninus-weather-chart-card.js', 'weather-chart-card-ha.js', 'weather-chart-card.js'];

test('v1.6.9 release metadata selects a standalone canonical HACS asset', () => {
  const pkg = JSON.parse(read('../package.json'));
  const lock = JSON.parse(read('../package-lock.json'));
  const hacs = JSON.parse(read('../hacs.json'));
  assert.equal(pkg.name, 'uninus-weather-chart-card');
  assert.equal(lock.name, pkg.name);
  assert.equal(lock.packages[''].name, pkg.name);
  assert.equal(hacs.name, pkg.name);
  assert.equal(hacs.filename, filenames[0]);
  assert.equal(pkg.repository.url, 'https://github.com/ivanlee1007/uninus-weather-chart-card.git');
  assert.equal(pkg.version, '1.6.9');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  for (const name of filenames) {
    const bundle = read(`../dist/${name}`);
    assert.match(bundle.split('\n', 1)[0], /^\/\* uninus-weather-chart-card v1\.6\.9 \*\/$/);
    assert.equal(bundle, read(`../dist/${filenames[0]}`));
    assert.doesNotMatch(bundle, /\bimport\s*(?:\(|['"{*])/);
  }
});

test('all existing icon sets remain shipped byte-for-byte from source', () => {
  for (const set of ['icons', 'icons2']) {
    const source = new URL(`../src/${set}/`, import.meta.url);
    const dist = new URL(`../dist/${set}/`, import.meta.url);
    const names = readdirSync(source).sort();
    assert.equal(names.length, 21);
    assert.deepEqual(readdirSync(dist).sort(), names);
    for (const name of names) assert.equal(readFileSync(new URL(name, dist), 'utf8'), readFileSync(new URL(name, source), 'utf8'));
  }
});

test('validation and release workflows exercise browser regressions and package all entrypoints', () => {
  for (const workflow of ['validate', 'release']) {
    const config = read(`../.github/workflows/${workflow}.yml`);
    assert.match(config, /node-version: '24'/);
    assert.match(config, /npx playwright install --with-deps chromium/);
    assert.match(config, /run: npm test/);
  }
  const release = read('../.github/workflows/release.yml');
  for (const name of filenames) {
    assert.ok(release.includes(`dist/${name}`), `release asset ${name}`);
    assert.ok(release.includes(` ${name}`), `ZIP entry ${name}`);
  }
  assert.match(release, /zip -r .* icons\/ icons2\//);
  assert.match(release, /uninus-weather-chart-card\.zip/);
});
