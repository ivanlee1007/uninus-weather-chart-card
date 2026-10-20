import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

let browser;
before(async () => {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
});
after(async () => { await browser?.close(); });

async function isolatedPage() {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (/multiple versions of Lit/.test(message.text())) errors.push(message.text());
  });
  await page.route('**/*', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/demo.html') return route.fulfill({ contentType: 'text/html', body: readFileSync(new URL('../test.html', import.meta.url), 'utf8') });
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' });
    if (!/^\/dist\/(uninus-weather-chart-card|weather-chart-card-ha|weather-chart-card)\.js$/.test(path)) return route.abort();
    return route.fulfill({ contentType: 'text/javascript', body: readFileSync(new URL(`..${path}`, import.meta.url), 'utf8') });
  });
  await page.goto('http://rebrand.test/');
  return { page, errors };
}

test('comprehensive development fixture loads the canonical card and renders a real chart', async () => {
  const { page, errors } = await isolatedPage();
  try {
    await page.goto('http://rebrand.test/demo.html');
    await page.waitForFunction(() => document.querySelector('uninus-weather-chart-card')?.forecastChart);
    assert.equal(await page.locator('uninus-weather-chart-card .current-temp').count(), 1);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('multiple legacy entrypoints execute bundled dependencies only once', async () => {
  const { page, errors } = await isolatedPage();
  try {
    for (const filename of ['weather-chart-card-ha.js', 'weather-chart-card.js', 'weather-chart-card-ha.js?v=again']) {
      await page.addScriptTag({ url: `http://rebrand.test/dist/${filename}`, type: 'module' });
    }
    assert.deepEqual(await page.evaluate(() => ({ lit: window.litHtmlVersions.length, element: window.litElementVersions.length, picker: window.customCards.length })), { lit: 1, element: 1, picker: 1 });
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

const filenames = ['uninus-weather-chart-card.js', 'weather-chart-card-ha.js', 'weather-chart-card.js'];
const orders = filenames.flatMap((first) => filenames.filter((name) => name !== first).map((second) => [first, second, filenames.find((name) => name !== first && name !== second)]));
for (const order of orders) {
  test(`standalone and mixed/cache-busted entrypoints: ${order.join(' → ')}`, async () => {
    const { page, errors } = await isolatedPage();
    try {
      await page.addScriptTag({ url: `http://rebrand.test/dist/${order[0]}`, type: 'module' });
      // The first file must supply the whole card, editor and dependencies alone.
      assert.deepEqual(await page.evaluate(() => ['uninus-weather-chart-card', 'weather-chart-card', 'uninus-weather-chart-card-editor', 'weather-chart-card-editor'].map((tag) => typeof customElements.get(tag))), Array(4).fill('function'));
      const firstConstructor = await page.evaluateHandle(() => customElements.get('uninus-weather-chart-card'));
      for (const name of order.slice(1)) await page.addScriptTag({ url: `http://rebrand.test/dist/${name}`, type: 'module' });
      await Promise.all(order.map((name) => page.addScriptTag({ url: `http://rebrand.test/dist/${name}?v=cachebust`, type: 'module' })));
      await page.addScriptTag({ url: `http://rebrand.test/dist/${order[0]}?v=classic` });
      assert.equal(await page.evaluate((ctor) => customElements.get('uninus-weather-chart-card') === ctor, firstConstructor), true);
      const result = await page.evaluate(async () => {
        const hass = {
          language: 'en', config: { unit_system: { temperature: '°C', length: 'km' } },
          states: { 'weather.home': { state: 'sunny', attributes: { temperature: 22, temperature_unit: '°C', supported_features: 3 }, last_changed: '2026-10-11T09:00:00Z' } },
          connection: { subscribeMessage(callback) {
            setTimeout(() => callback({ forecast: [{ datetime: '2026-10-12T12:00:00Z', temperature: 24, templow: 17, precipitation: 0 }] }), 0);
            return Promise.resolve(() => {});
          } },
        };
        const cards = ['uninus-weather-chart-card', 'weather-chart-card'].map((tag) => {
          const card = document.createElement(tag);
          card.setConfig({ entity: 'weather.home', type: `custom:${tag}`, show_sun: false, animated_icons: false, show_time: false, forecast: { condition_icons: false, disable_animation: true } });
          card.hass = hass;
          document.body.append(card);
          return card;
        });
        await Promise.all(cards.map((card) => card.updateComplete));
        const editors = [];
        for (const card of cards) {
          const editor = card.constructor.getConfigElement();
          editor.hass = hass;
          editor.setConfig({ ...card.config, future_option: 'retained' });
          document.body.append(editor);
          await editor.updateComplete;
          let changed;
          editor.addEventListener('config-changed', (event) => { changed = { config: event.detail.config, bubbles: event.bubbles, composed: event.composed }; });
          editor._valueChanged({ target: { value: 'Edited' } }, 'title');
          editors.push({ tag: editor.localName, type: changed.config.type, title: changed.config.title, future: changed.config.future_option, bubbles: changed.bubbles, composed: changed.composed, form: !!editor.shadowRoot.querySelector('ha-form'), stubEntity: card.constructor.getStubConfig(hass, ['weather.home'], []).entity });
        }
        window.mixedCards = cards;
        return { temperatures: cards.map((card) => card.shadowRoot.querySelector('.current-temp').textContent.trim()), editors, picker: window.customCards, lit: window.litHtmlVersions.length, element: window.litElementVersions.length };
      });
      await page.waitForFunction(() => window.mixedCards.every((card) => card.forecastChart?.data.datasets[0].data[0] === 24));
      assert.deepEqual(result.temperatures, ['22°C', '22°C']);
      assert.equal(result.lit, 1);
      assert.equal(result.element, 1);
      assert.equal(result.picker.length, 1);
      assert.equal(result.picker[0].type, 'uninus-weather-chart-card');
      assert.equal(result.picker[0].name, 'uninus-weather-chart-card');
      assert.deepEqual(result.editors, ['uninus-weather-chart-card', 'weather-chart-card'].map((tag) => ({ tag: 'uninus-weather-chart-card-editor', type: `custom:${tag}`, title: 'Edited', future: 'retained', bubbles: true, composed: true, form: true, stubEntity: 'weather.home' })));
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
}

for (const [from, to] of [['weather-chart-card', 'uninus-weather-chart-card'], ['uninus-weather-chart-card', 'weather-chart-card']]) {
  test(`persisted last-valid snapshot survives ${from} → ${to} and outage reload`, async () => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let tag = from;
    await page.route('**/*', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/') {
        const filename = tag === 'weather-chart-card' ? 'weather-chart-card-ha.js' : 'uninus-weather-chart-card.js';
        const html = readFileSync(new URL('./persistent-snapshot.html', import.meta.url), 'utf8')
          .replace('../dist/weather-chart-card-ha.js', `./dist/${filename}`)
          .replace("document.createElement('weather-chart-card')", `document.createElement('${tag}')`)
          .replace('animated_icons: true', 'animated_icons: false').replace('condition_icons: true', 'condition_icons: false');
        return route.fulfill({ contentType: 'text/html', body: html });
      }
      if (/^\/dist\/(uninus-weather-chart-card|weather-chart-card-ha)\.js$/.test(path)) return route.fulfill({ contentType: 'text/javascript', body: readFileSync(new URL(`..${path}`, import.meta.url), 'utf8') });
      return route.abort();
    });
    try {
      await page.goto('http://rebrand.test/');
      await page.waitForFunction(() => window.fixture?.card.forecastChart?.data.datasets[0].data[0] === 24);
      const before = await page.evaluate(() => ({ key: window.fixture.card._snapshotKey, keys: Object.keys(localStorage), timestamp: window.fixture.card.weather.last_changed }));
      assert.equal(before.keys.length, 1);
      assert.match(before.key, /^weather-chart-card:snapshot:v1:/);
      tag = to;
      await page.evaluate(() => sessionStorage.setItem('test-outage', 'yes'));
      await page.reload();
      await page.waitForFunction(() => window.fixture?.card.forecastChart?.data.datasets[0].data[0] === 24);
      const restored = await page.evaluate(() => {
        const card = window.fixture.card;
        return { tag: card.localName, key: card._snapshotKey, keys: Object.keys(localStorage), temperature: card.shadowRoot.querySelector('.current-temp').textContent.trim(), text: card.shadowRoot.querySelector('.text-sensor-content').textContent.trim(), status: card.shadowRoot.querySelector('[role="status"]').textContent.trim(), timestamp: card.weather.last_changed };
      });
      assert.deepEqual(restored, { tag: to, key: before.key, keys: before.keys, temperature: '22°C', text: 'Tomorrow is sunny', status: '資料暫時不可用', timestamp: before.timestamp });
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
}
