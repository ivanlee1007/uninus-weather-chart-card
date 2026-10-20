import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('README HACS redirect uses the renamed repository slug and owner', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const links = [...readme.matchAll(/\]\((https:\/\/my\.home-assistant\.io\/redirect\/hacs_repository\/\?[^)]+)\)/g)];
  assert.equal(links.length, 1);
  const url = new URL(links[0][1]);
  assert.equal(url.searchParams.get('repository'), 'uninus-weather-chart-card');
  assert.equal(url.searchParams.get('owner'), 'ivanlee1007');
});
