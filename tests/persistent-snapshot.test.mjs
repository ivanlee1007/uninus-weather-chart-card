import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

async function fixturePage(browser, options = {}) {
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  await page.route('http://snapshot.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const filename = path === '/tests/persistent-snapshot.html' ? 'tests/persistent-snapshot.html' : path === '/dist/weather-chart-card-ha.js' ? 'dist/weather-chart-card-ha.js' : /^\/dist\/icons\/[a-z-]+\.svg$/.test(path) ? path.slice(1) : null;
    if (!filename) return route.abort();
    await route.fulfill({ body: await readFile(resolve(filename)), contentType: filename.endsWith('.html') ? 'text/html' : filename.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript' });
  });
  await page.route('https://**', (route) => route.abort());
  if (options.outage) await page.addInitScript(() => sessionStorage.setItem('test-outage', 'yes'));
  await page.goto('http://snapshot.test/tests/persistent-snapshot.html');
  return page;
}

test('site switch on same card never displays or persists previous site readings', async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
  try {
    const page = await fixturePage(browser);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => window.fixture.card.forecastChart?.data.datasets[0].data[0] === 24);
    const result = await page.evaluate(async () => {
      const { card, hass } = window.fixture;
      const previousKeys = Object.keys(localStorage);
      hass.config = { ...hass.config, location_name: 'Different Site', latitude: 35 };
      hass.connection.subscribeMessage = () => Promise.resolve(() => {});
      hass.states['weather.home'] = { state: 'unavailable', attributes: {} };
      hass.states['sensor.text'] = { state: 'unavailable', attributes: {} };
      card.hass = hass;
      await card.updateComplete;
      return {
        temperature: card.shadowRoot.querySelector('.current-temp')?.textContent.trim(),
        text: card.shadowRoot.querySelector('.text-sensor-content')?.textContent.trim(),
        chart: card.forecastChart?.data.datasets[0].data,
        chartVisible: getComputedStyle(card.shadowRoot.querySelector('.chart-container')).display !== 'none',
        status: card.shadowRoot.querySelector('[role="status"]')?.textContent.trim(),
        previousKeys,
        keys: Object.keys(localStorage),
      };
    });
    assert.equal(result.temperature, '—');
    assert.equal(result.text, undefined);
    assert.ok(!result.chart?.length);
    assert.equal(result.chartVisible, false);
    assert.equal(result.status, '資料暫時不可用');
    assert.deepEqual(result.keys, result.previousKeys);
    const geometry = await page.evaluate(() => {
      const host = window.fixture.card.shadowRoot.querySelector('ha-card');
      return { width: host.getBoundingClientRect().width, overflow: host.scrollWidth > host.clientWidth };
    });
    assert.equal(geometry.width, 396);
    assert.equal(geometry.overflow, false);
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.fixture.card.shadowRoot.querySelectorAll('.forecast-item').length), 0);
    await page.screenshot({ path: resolve('tests/persistent-snapshot-site-isolation.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('late callbacks cannot cross daily/hourly toggles into the displayed chart or storage', async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
  try {
    const page = await fixturePage(browser);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => window.fixture.card.forecastChart?.data.datasets[0].data[0] === 24);
    const stages = await page.evaluate(async () => {
      const { card, hass } = window.fixture;
      card.setConfig({ ...card.config, show_time: true, show_forecast_toggle: true });
      card.hass = hass;
      await card.updateComplete;
      const dailyCallback = window.latestForecastCallback;
      const subscriptions = [];
      hass.connection.subscribeMessage = (callback, options) => {
        subscriptions.push({ callback, type: options.forecast_type });
        return Promise.resolve(() => {});
      };
      const read = () => ({
        type: card.config.forecast.type,
        chart: card.forecastChart?.data.datasets[0].data[0],
        entries: [...card.shadowRoot.querySelectorAll('.forecast-item')].map(node => node.textContent),
        stored: JSON.parse(localStorage.getItem(card._snapshotKey)),
      });
      card.forecastSubscriber = { then(unsubscribe) {
        dailyCallback({ forecast: [{ datetime: '2026-10-13T12:00:00Z', temperature: 91 }] });
        unsubscribe(() => {});
      } };
      card.shadowRoot.querySelector('.forecast-toggle').click();
      await card.updateComplete;
      const hourlyAfterLateDaily = read();
      dailyCallback({ forecast: [{ datetime: '2026-10-13T13:00:00Z', temperature: 93 }] });
      await card.updateComplete;
      const hourlyAfterQueuedDaily = read();
      const hourlyCallback = subscriptions.filter(item => item.type === 'hourly').at(-1)?.callback;
      hourlyCallback?.({ forecast: [{ datetime: '2026-10-12T13:00:00Z', temperature: 18 }] });
      await card.updateComplete;
      const hourlyValid = read();
      card.forecastSubscriber = { then(unsubscribe) {
        hourlyCallback?.({ forecast: [{ datetime: '2026-10-12T14:00:00Z', temperature: 92 }] });
        unsubscribe(() => {});
      } };
      card.shadowRoot.querySelector('.forecast-toggle').click();
      await card.updateComplete;
      const dailyAfterLateHourly = read();
      hourlyCallback?.({ forecast: [{ datetime: '2026-10-12T15:00:00Z', temperature: 94 }] });
      await card.updateComplete;
      const dailyAfterQueuedHourly = read();
      return { hourlyAfterLateDaily, hourlyAfterQueuedDaily, hourlyValid, dailyAfterLateHourly, dailyAfterQueuedHourly, types: subscriptions.map(item => item.type) };
    });
    assert.equal(stages.hourlyAfterLateDaily.type, 'hourly');
    assert.deepEqual(stages.hourlyAfterLateDaily.stored.forecast, []);
    assert.deepEqual(stages.hourlyAfterQueuedDaily.stored.forecast, []);
    assert.notEqual(stages.hourlyAfterLateDaily.chart, 91);
    assert.ok(stages.types.includes('hourly'));
    assert.equal(stages.hourlyValid.stored.forecast[0].temperature, 18);
    assert.equal(stages.hourlyValid.chart, 18);
    assert.equal(stages.dailyAfterLateHourly.type, 'daily');
    assert.equal(stages.dailyAfterLateHourly.stored.forecast[0].temperature, 24);
    assert.equal(stages.dailyAfterQueuedHourly.stored.forecast[0].temperature, 24);
    await page.waitForFunction(() => window.fixture.card.forecastChart?.data.datasets[0].data[0] === 24);
    assert.equal(await page.evaluate(() => window.fixture.card.forecastChart.data.datasets[0].data[0]), 24);
    assert.ok(stages.dailyAfterQueuedHourly.entries.every(text => !text.includes('92')));
    const geometry = await page.evaluate(() => {
      const host = window.fixture.card.shadowRoot.querySelector('ha-card');
      return { width: host.getBoundingClientRect().width, overflow: host.scrollWidth > host.clientWidth };
    });
    assert.equal(geometry.width, 396);
    assert.equal(geometry.overflow, false);
    await page.screenshot({ path: resolve('tests/persistent-snapshot-type-isolation.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('first unavailable current still subscribes to independently arriving forecast and restores it on reload', async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
  try {
    const page = await fixturePage(browser, { outage: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    assert.equal(await page.evaluate(() => window.fixture.card.shadowRoot.querySelector('.current-temp').textContent.trim()), '—');
    await page.evaluate(() => window.latestForecastCallback({ forecast: [{ datetime: '2026-10-12T12:00:00Z', temperature: 24, templow: 17, condition: 'sunny' }] }));
    await page.waitForFunction(() => window.fixture.card.forecastChart?.data.datasets[0].data[0] === 24);
    const receivedAt = await page.evaluate(() => window.fixture.card.shadowRoot.querySelector('.snapshot-forecast-time')?.getAttribute('datetime'));
    assert.ok(receivedAt && !Number.isNaN(Date.parse(receivedAt)));
    assert.notEqual(receivedAt, '2026-10-12T12:00:00Z');
    await page.reload();
    await page.waitForFunction(() => window.fixture.card.forecastChart?.data.datasets[0].data[0] === 24);
    const restored = await page.evaluate(() => ({
      temperature: window.fixture.card.shadowRoot.querySelector('.current-temp').textContent.trim(),
      forecast: window.fixture.card.forecastChart.data.datasets[0].data[0],
      date: window.fixture.card.forecasts[0].datetime,
      forecastTime: window.fixture.card.shadowRoot.querySelector('.snapshot-forecast-time')?.getAttribute('datetime'),
      forecastLabel: window.fixture.card.shadowRoot.querySelector('.snapshot-forecast-time')?.textContent.trim(),
      status: window.fixture.card.shadowRoot.querySelector('[role="status"]').textContent.trim(),
    }));
    assert.equal(restored.temperature, '—');
    assert.equal(restored.forecast, 24);
    assert.equal(restored.date, '2026-10-12T12:00:00Z');
    assert.equal(restored.forecastTime, receivedAt);
    assert.match(restored.forecastLabel, /最後有效預報資料/);
    assert.equal(restored.status, '資料暫時不可用');
    const geometry = await page.evaluate(() => {
      const host = window.fixture.card.shadowRoot.querySelector('ha-card');
      return { width: host.getBoundingClientRect().width, overflow: host.scrollWidth > host.clientWidth };
    });
    assert.equal(geometry.width, 396);
    assert.equal(geometry.overflow, false);
    await page.screenshot({ path: resolve('tests/persistent-snapshot-forecast-only.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('text independently arriving without current or forecast keeps its source timestamp after reload', async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
  try {
    const page = await fixturePage(browser, { outage: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(async () => {
      const { card, hass } = window.fixture;
      hass.states['sensor.text'] = { state: 'Independent advisory', last_changed: '2026-10-11T09:01:00Z', attributes: { friendly_name: 'Advisory' } };
      card.hass = hass;
      await card.updateComplete;
    });
    await page.reload();
    const restored = await page.evaluate(() => {
      const root = window.fixture.card.shadowRoot;
      return {
        temperature: root.querySelector('.current-temp')?.textContent.trim(),
        text: root.querySelector('.text-sensor-content')?.textContent.trim(),
        time: root.querySelector('.snapshot-text-time')?.getAttribute('datetime'),
        label: root.querySelector('.snapshot-text-time')?.textContent.trim(),
        status: root.querySelector('[role="status"]')?.textContent.trim(),
        forecastTime: root.querySelector('.snapshot-forecast-time')?.getAttribute('datetime'),
      };
    });
    assert.equal(restored.temperature, '—');
    assert.equal(restored.text, 'Independent advisory');
    assert.equal(restored.time, '2026-10-11T09:01:00Z');
    assert.match(restored.label, /最後有效文字資料/);
    assert.equal(restored.status, '資料暫時不可用');
    assert.equal(restored.forecastTime, undefined);
    const geometry = await page.evaluate(() => {
      const host = window.fixture.card.shadowRoot.querySelector('ha-card');
      return { width: host.getBoundingClientRect().width, overflow: host.scrollWidth > host.clientWidth };
    });
    assert.equal(geometry.width, 396);
    assert.equal(geometry.overflow, false);
    await page.screenshot({ path: resolve('tests/persistent-snapshot-text-only.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('built card restores current, forecast, text and timestamp after a real page reload', async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
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
  const snapshot = () => page.evaluate(() => {
    const card = window.fixture.card;
    const root = card.shadowRoot;
    const host = root.querySelector('ha-card');
    return {
      temperature: root.querySelector('.current-temp')?.textContent.trim(),
      condition: root.querySelector('.current-condition')?.textContent.trim(),
      icon: root.querySelector('.main .weather-icon img')?.getAttribute('src') || root.querySelector('.main .weather-icon ha-icon')?.getAttribute('icon'),
      iconLoaded: root.querySelector('.main .weather-icon img')?.naturalWidth > 0,
      text: root.querySelector('.text-sensor-content')?.textContent.trim(),
      date: card.forecastChart?.data.labels[0],
      chart: card.forecastChart?.data.datasets[0].data,
      timestamp: root.querySelector('.snapshot-time')?.getAttribute('datetime') || root.querySelector('.updated')?.textContent.trim(),
      staleLabel: root.querySelector('.snapshot-time')?.textContent.trim(),
      relativeFreshness: root.querySelector('.updated')?.textContent.trim(),
      status: root.querySelector('[role="status"]')?.textContent.trim(),
      width: host.getBoundingClientRect().width,
      overflow: host.scrollWidth > host.clientWidth,
    };
  });
  try {
    await page.goto('http://snapshot.test/tests/persistent-snapshot.html');
    await page.waitForFunction(() => window.fixture.card.forecastChart?.data.datasets[0].data[0] === 24 && window.fixture.card.shadowRoot.querySelector('.text-sensor-content'));
    const live = await snapshot();
    await page.evaluate(async () => {
      sessionStorage.setItem('test-outage', 'yes');
      window.fixture.hass.states['weather.home'] = { state: 'unavailable', attributes: {} };
      window.fixture.hass.states['sensor.text'] = { state: 'unavailable', attributes: {} };
      window.fixture.card.hass = window.fixture.hass;
      await window.fixture.card.updateComplete;
    });
    await page.reload();
    await page.waitForFunction(() => window.fixture.card.shadowRoot.querySelector('[role="status"]'));
    const restored = await snapshot();
    assert.equal(live.temperature, '22°C');
    assert.equal(restored.temperature, live.temperature);
    assert.equal(restored.condition, live.condition);
    assert.equal(restored.icon, live.icon);
    assert.ok(restored.icon);
    assert.equal(restored.iconLoaded, true);
    assert.equal(restored.text, live.text);
    assert.deepEqual(restored.chart, live.chart);
    assert.equal(restored.date, live.date);
    assert.equal(restored.timestamp, '2026-10-11T09:00:00Z');
    assert.match(restored.staleLabel, /最後有效資料/);
    assert.equal(restored.relativeFreshness, undefined);
    assert.equal(restored.status, '資料暫時不可用');
    assert.equal(restored.overflow, false);
    await page.screenshot({ path: resolve('tests/persistent-snapshot-reload.png'), fullPage: true });
    const rebuilt = await page.evaluate(async () => {
      const { card, hass } = window.fixture;
      card.remove();
      const next = document.createElement('weather-chart-card');
      next.setConfig({ ...card.config });
      next.hass = hass;
      document.querySelector('#dashboard').append(next);
      await next.updateComplete;
      window.fixture.card = next;
      return next.shadowRoot.querySelector('.current-temp').textContent.trim();
    });
    assert.equal(rebuilt, '22°C');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
