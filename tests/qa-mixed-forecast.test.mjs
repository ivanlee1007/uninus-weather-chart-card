import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

// Independent QA probe: the production-built card is loaded into a real browser.
test('mixed valid/invalid forecast is consistent immediately and after reload', async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('http://snapshot.test/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const filename = path === '/tests/persistent-snapshot.html' ? 'tests/persistent-snapshot.html' : path === '/dist/weather-chart-card-ha.js' ? 'dist/weather-chart-card-ha.js' : /^\/dist\/icons\/[a-z-]+\.svg$/.test(path) ? path.slice(1) : null;
      if (!filename) return route.abort();
      await route.fulfill({ body: await readFile(resolve(filename)), contentType: filename.endsWith('.html') ? 'text/html' : filename.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript' });
    });
    await page.route('https://**', (route) => route.abort());
    await page.addInitScript(() => sessionStorage.setItem('test-outage', 'yes'));
    await page.goto('http://snapshot.test/tests/persistent-snapshot.html');
    const mixed = [
      { datetime: '2026-10-12T12:00:00Z', temperature: 24, templow: 17, condition: 'sunny' },
      { datetime: 'not-a-date', temperature: 91, condition: 'rainy' },
      { datetime: '2026-10-14T12:00:00Z', temperature: 'unavailable', templow: 'unknown', condition: 'sunny' },
    ];
    let callbackError = null;
    try {
      await page.evaluate((payload) => window.latestForecastCallback({ forecast: payload }), mixed);
    } catch (error) {
      callbackError = String(error);
    }
    await page.waitForFunction(() => window.fixture.card.forecasts?.length > 0);
    const capture = () => page.evaluate(() => {
      const card = window.fixture.card;
      return {
        entries: card.forecasts.map((entry) => ({ datetime: entry.datetime, temperature: entry.temperature })),
        labels: card.forecastChart?.data.labels,
        chart: card.forecastChart?.data.datasets[0].data,
        text: card.shadowRoot.textContent,
        stored: JSON.parse(localStorage.getItem(card._snapshotKey))?.forecast,
        status: card.shadowRoot.querySelector('[role="status"]')?.textContent.trim(),
        icons: card.shadowRoot.querySelectorAll('.forecast-item').length,
        geometry: (() => { const host = card.shadowRoot.querySelector('ha-card'); return { width: host.getBoundingClientRect().width, overflow: host.scrollWidth > host.clientWidth }; })(),
      };
    });
    const immediate = await capture();
    await page.evaluate(() => {
      window.latestForecastCallback({ forecast: [{ datetime: 'bad', temperature: 91 }, { datetime: '2026-10-14T12:00:00Z', temperature: 'unavailable' }] });
      window.latestForecastCallback({ forecast: [] });
    });
    const afterInvalid = await capture();
    assert.deepEqual(afterInvalid.entries, immediate.entries, 'all-invalid and empty callbacks preserve last valid forecast');
    assert.deepEqual(afterInvalid.stored, immediate.stored);
    assert.deepEqual(afterInvalid.chart, immediate.chart);
    await page.screenshot({ path: resolve('tests/qa-mixed-forecast-before.png'), fullPage: true });
    await page.reload();
    await page.waitForFunction(() => window.fixture.card.forecastChart?.data.datasets[0].data[0] === 24);
    const restored = await capture();
    const rebuilt = await page.evaluate(async () => {
      const old = window.fixture.card;
      const replacement = document.createElement('weather-chart-card');
      replacement.setConfig(old.config);
      old.remove();
      replacement.hass = window.fixture.hass;
      document.querySelector('#dashboard').append(replacement);
      window.fixture.card = replacement;
      await replacement.updateComplete;
      return { entries: replacement.forecasts.map((entry) => ({ datetime: entry.datetime, temperature: entry.temperature })), chart: replacement.forecastChart?.data.datasets[0].data };
    });
    await page.waitForFunction(() => window.fixture.card.forecastChart?.data.datasets[0].data[0] === 24);
    assert.deepEqual(rebuilt.entries, immediate.entries);
    assert.deepEqual(rebuilt.chart, immediate.chart);
    await page.screenshot({ path: resolve('tests/qa-mixed-forecast-after.png'), fullPage: true });
    const hourly = await page.evaluate(async () => {
      const card = window.fixture.card;
      const lateDaily = window.latestForecastCallback;
      card.setConfig({ ...card.config, forecast: { ...card.config.forecast, type: 'hourly' } });
      card.hass = window.fixture.hass;
      await card.updateComplete;
      window.latestForecastCallback({ forecast: [
        { datetime: '2026-10-12T13:00:00Z', temperature: 18, condition: 'sunny' },
        { datetime: 'bad', temperature: 91, condition: 'rainy' },
      ] });
      lateDaily({ forecast: [{ datetime: '2026-10-13T12:00:00Z', temperature: 99 }] });
      await card.updateComplete;
      return { entries: card.forecasts.map((entry) => entry.temperature), chart: card.forecastChart?.data.datasets[0].data, stored: JSON.parse(localStorage.getItem(card._snapshotKey))?.forecast.map((entry) => entry.temperature) };
    });
    assert.deepEqual(hourly.entries, [18]);
    assert.deepEqual(hourly.chart, [18]);
    assert.deepEqual(hourly.stored, [18]);
    assert.equal(immediate.icons, 1);
    assert.equal(restored.icons, 1);
    assert.equal(immediate.geometry.width, 396);
    assert.equal(immediate.geometry.overflow, false);
    assert.equal(restored.geometry.overflow, false);
    console.log('MIXED_FORECAST_EVIDENCE', JSON.stringify({ callbackError, immediate: { entries: immediate.entries, labels: immediate.labels, chart: immediate.chart, stored: immediate.stored, status: immediate.status, containsInvalid91: immediate.text.includes('91') }, restored: { entries: restored.entries, labels: restored.labels, chart: restored.chart, stored: restored.stored, status: restored.status, containsInvalid91: restored.text.includes('91') }, errors }));
    assert.equal(callbackError, null, 'mixed payload must not throw in the live card');
    assert.deepEqual(errors, []);
    assert.deepEqual(immediate.entries, restored.entries, 'live UI and persisted/reloaded entries must match');
    assert.deepEqual(immediate.chart, restored.chart, 'live and restored charts must match');
    assert.equal(immediate.text.includes('91'), false, 'invalid-date 91 must never appear in the DOM');
    assert.equal(restored.text.includes('91'), false);
  } finally { await browser.close(); }
});
