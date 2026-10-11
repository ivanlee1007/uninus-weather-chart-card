import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const url = 'http://snapshot.test/tests/persistent-snapshot.html';
async function open(browser, mode) {
  const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://snapshot.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const filename = path === '/tests/persistent-snapshot.html' ? 'tests/persistent-snapshot.html' : path === '/dist/weather-chart-card-ha.js' ? 'dist/weather-chart-card-ha.js' : /^\/dist\/icons\/[a-z-]+\.svg$/.test(path) ? path.slice(1) : null;
    if (!filename) return route.abort();
    await route.fulfill({ body: await readFile(resolve(filename)), contentType: filename.endsWith('.html') ? 'text/html' : filename.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript' });
  });
  await page.route('https://**', route => route.abort());
  if (mode === 'denied' || mode === 'quota') await page.addInitScript(storageMode => {
    const descriptor = Object.getOwnPropertyDescriptor(Storage.prototype, storageMode === 'denied' ? 'getItem' : 'setItem');
    Object.defineProperty(Storage.prototype, storageMode === 'denied' ? 'getItem' : 'setItem', {
      configurable: true,
      value(...args) {
        if (this === localStorage) throw new DOMException('QA injected storage failure', storageMode === 'denied' ? 'SecurityError' : 'QuotaExceededError');
        return descriptor.value.apply(this, args);
      },
    });
  }, mode);
  await page.goto(url);
  return { context, page, errors };
}

const state = page => page.evaluate(() => {
  const card = window.fixture.card;
  const root = card.shadowRoot;
  return {
    temp: root.querySelector('.current-temp')?.textContent.trim(),
    chart: card.forecastChart?.data.datasets[0].data,
    text: root.querySelector('.text-sensor-content')?.textContent.trim(),
    time: root.querySelector('.snapshot-time')?.getAttribute('datetime'),
    status: root.querySelector('[role="status"]')?.textContent.trim(),
    key: card._snapshotKey,
  };
});

for (const mode of ['denied', 'quota']) test(`built card degrades safely with real-browser ${mode} storage exception`, async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
  try {
    const { context, page, errors } = await open(browser, mode);
    await page.waitForFunction(() => window.fixture.card.forecastChart?.data.datasets[0].data[0] === 24);
    const live = await state(page);
    await page.evaluate(async () => {
      const { card, hass } = window.fixture;
      sessionStorage.setItem('test-outage', 'yes');
      hass.states['weather.home'] = { state: 'unavailable', attributes: {} };
      hass.states['sensor.text'] = { state: 'unavailable', attributes: {} };
      card.hass = hass;
      await card.updateComplete;
    });
    const sameInstance = await state(page);
    assert.equal(sameInstance.temp, '22°C');
    assert.deepEqual(sameInstance.chart, [24]);
    assert.equal(sameInstance.status, '資料暫時不可用');
    assert.equal(sameInstance.time, '2026-10-11T09:00:00Z');
    await page.screenshot({ path: resolve(`tests/qa-storage-${mode}-instance.png`), fullPage: true });
    await page.reload();
    await page.waitForFunction(() => window.fixture.card.shadowRoot.querySelector('[role="status"]'));
    const reloaded = await state(page);
    assert.equal(reloaded.temp, '—');
    assert.ok(!reloaded.chart?.length);
    assert.equal(reloaded.text, undefined);
    assert.equal(reloaded.time, undefined);
    assert.equal(reloaded.status, '資料暫時不可用');
    assert.deepEqual(errors, []);
    console.log('STORAGE_BROWSER_EVIDENCE', JSON.stringify({ mode, live, sameInstance, reloaded, errors }));
    await context.close();
  } finally { await browser.close(); }
});

test('built card unit/config change recalculates stale readings and does not persist expired alert', async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
  try {
    const { context, page, errors } = await open(browser);
    await page.waitForFunction(() => window.fixture.card.forecastChart?.data.datasets[0].data[0] === 24);
    const stages = await page.evaluate(async () => {
      const { card, hass } = window.fixture;
      card.setConfig({ ...card.config, units: { ...card.config.units, temperature: '°F' }, show_alerts: true, alert_entity_1: 'sensor.alert' });
      hass.states['sensor.alert'] = { state: 'active', attributes: { title: 'QA active alert', severity: 'warning' } };
      card.hass = hass;
      await card.updateComplete;
      await new Promise(resolve => setTimeout(resolve, 200));
      const live = { temp: card.shadowRoot.querySelector('.current-temp')?.textContent.trim(), chart: card.forecastChart?.data.datasets[0].data, alert: card.shadowRoot.querySelector('.weather-alert-banner')?.textContent };
      sessionStorage.setItem('test-outage', 'yes');
      hass.states['weather.home'] = { state: 'unavailable', attributes: {} };
      hass.states['sensor.alert'].state = 'inactive';
      card.hass = hass;
      await card.updateComplete;
      const stale = { temp: card.shadowRoot.querySelector('.current-temp')?.textContent.trim(), chart: card.forecastChart?.data.datasets[0].data, alert: card.shadowRoot.querySelector('.weather-alert-banner')?.textContent, status: card.shadowRoot.querySelector('[role="status"]')?.textContent.trim(), saved: JSON.parse(localStorage.getItem(card._snapshotKey)) };
      return { live, stale };
    });
    console.log('CONFIG_ALERT_BROWSER_EVIDENCE', JSON.stringify({ live: stages.live, stale: { temp: stages.stale.temp, chart: stages.stale.chart, alert: stages.stale.alert, status: stages.stale.status }, savedHasAlert: JSON.stringify(stages.stale.saved).includes('QA active alert'), errors }));
    assert.match(stages.live.alert, /QA active alert/);
    assert.equal(stages.stale.alert, undefined);
    assert.equal(stages.stale.status, '資料暫時不可用');
    assert.deepEqual(stages.stale.chart, stages.live.chart);
    assert.equal(stages.stale.temp, stages.live.temp);
    assert.doesNotMatch(stages.stale.temp, /NaN|Infinity/);
    assert.doesNotMatch(JSON.stringify(stages.stale.saved), /QA active alert/);
    await page.reload();
    await page.waitForFunction(() => window.fixture.card.shadowRoot.querySelector('[role="status"]'));
    const restored = await state(page);
    const alert = await page.evaluate(() => window.fixture.card.shadowRoot.querySelector('.weather-alert-banner')?.textContent);
    assert.equal(alert, undefined);
    assert.equal(restored.temp, '22°C');
    assert.deepEqual(restored.chart, [24]);
    assert.deepEqual(errors, []);
    console.log('CONFIG_ALERT_BROWSER_EVIDENCE', JSON.stringify({ live: stages.live, stale: { temp: stages.stale.temp, chart: stages.stale.chart, alert: stages.stale.alert, status: stages.stale.status }, restored, errors }));
    await context.close();
  } finally { await browser.close(); }
});

test('built card ignores corrupt or wrong-version stored snapshot on real reload', async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
  try {
    const { context, page, errors } = await open(browser);
    await page.waitForFunction(() => window.fixture.card.forecastChart?.data.datasets[0].data[0] === 24);
    for (const payload of ['{broken json', JSON.stringify({ version: 999, weather: { state: 'sunny', attributes: { temperature: 99 } } })]) {
      await page.evaluate(data => {
        localStorage.setItem(window.fixture.card._snapshotKey, data);
        sessionStorage.setItem('test-outage', 'yes');
      }, payload);
      await page.reload();
      await page.waitForFunction(() => window.fixture.card.shadowRoot.querySelector('[role="status"]'));
      const result = await state(page);
      assert.equal(result.temp, '—');
      assert.ok(!result.chart?.length);
      assert.equal(result.status, '資料暫時不可用');
      assert.equal(result.time, undefined);
      console.log('CORRUPT_BROWSER_EVIDENCE', JSON.stringify({ payload, result }));
    }
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await browser.close(); }
});
