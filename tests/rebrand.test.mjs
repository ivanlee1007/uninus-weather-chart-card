import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'customElements', 'HTMLElement', 'Element', 'Document', 'ShadowRoot', 'CSSStyleSheet', 'Event']) {
  globalThis[key] = dom.window[key];
}
await import('../src/main.js');

test('canonical CDN and HACS fallback paths retain explicit and legacy local icon paths', () => {
  const card = document.createElement('uninus-weather-chart-card');
  card.setConfig({ entity: 'weather.home' });
  assert.equal(card.baseIconPath, 'https://cdn.jsdelivr.net/gh/ivanlee1007/uninus-weather-chart-card@latest/dist/icons/');
  assert.equal(card.getLocalIconPath(), '/hacsfiles/uninus-weather-chart-card/icons/');
  card.setConfig({ entity: 'weather.home', icon_style: 'style2' });
  assert.equal(card.baseIconPath, 'https://cdn.jsdelivr.net/gh/ivanlee1007/uninus-weather-chart-card@latest/dist/icons2/');
  card.setConfig({ entity: 'weather.home', icons: '/custom/' });
  assert.equal(card.baseIconPath, '/custom/');
  for (const path of ['/local/uninus-weather-chart-card.js?v=1', '/hacsfiles/weather-chart-card/weather-chart-card-ha.js?hacstag=1', '/local/legacy/weather-chart-card.js']) {
    const script = document.createElement('script');
    script.src = path;
    document.head.append(script);
    assert.equal(card.getLocalIconPath(), new URL('./icons/', script.src).href);
    script.remove();
  }
});

test('canonical editor and legacy alias preserve config type, unknown keys and stub defaults', () => {
  for (const tag of ['uninus-weather-chart-card', 'weather-chart-card']) {
    const Card = customElements.get(tag);
    const editor = Card.getConfigElement();
    assert.equal(editor.localName, 'uninus-weather-chart-card-editor');
    assert.equal(typeof editor.setConfig, 'function');
    const stub = Card.getStubConfig({}, ['weather.home'], ['weather.other']);
    assert.equal(stub.entity, 'weather.home');
    assert.equal(stub.title, 'uninus-weather-chart-card');
    assert.equal(Card.getStubConfig({}, [], ['weather.other']).entity, 'weather.other');
    assert.equal(Card.getStubConfig({}, [], []).entity, undefined);
    editor.setConfig({ ...stub, type: `custom:${tag}`, future_option: { keep: true } });
    let changed;
    editor.addEventListener('config-changed', (event) => { changed = event; });
    editor._valueChanged({ target: { value: 'Updated' } }, 'title');
    assert.equal(changed.bubbles, true);
    assert.equal(changed.composed, true);
    assert.equal(changed.detail.config.type, `custom:${tag}`);
    assert.deepEqual(changed.detail.config.future_option, { keep: true });
    assert.equal(changed.detail.config.title, 'Updated');
  }
  const legacy = document.createElement('weather-chart-card-editor');
  assert.equal(typeof legacy.setConfig, 'function');
  assert.notEqual(legacy.constructor, customElements.get('uninus-weather-chart-card-editor'));
});

test('canonical and legacy runtime tags have distinct constructors and one canonical picker entry', () => {
  const canonical = customElements.get('uninus-weather-chart-card');
  const legacy = customElements.get('weather-chart-card');
  assert.equal(typeof canonical, 'function');
  assert.equal(typeof legacy, 'function');
  assert.notEqual(canonical, legacy);
  for (const tag of ['uninus-weather-chart-card', 'weather-chart-card']) {
    const card = document.createElement(tag);
    card.setConfig({ type: `custom:${tag}`, entity: 'weather.home' });
    assert.equal(card.config.type, `custom:${tag}`);
    assert.equal(card.config.title, 'uninus-weather-chart-card');
  }
  assert.deepEqual(window.customCards.map(({ type, name }) => ({ type, name })), [
    { type: 'uninus-weather-chart-card', name: 'uninus-weather-chart-card' },
  ]);
});
