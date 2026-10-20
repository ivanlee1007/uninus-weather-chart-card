import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

// Local DOM only: no Home Assistant server or network requests.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'customElements', 'HTMLElement', 'Element', 'Document', 'ShadowRoot', 'CSSStyleSheet']) {
  globalThis[key] = dom.window[key];
}
await import('../src/main.js');
const { render } = await import('lit');

function fixture(options = {}, state = 'sunny', attributes = {}) {
  // Each synthetic fixture is an isolated installation; persistence across
  // rebuilds is covered separately in the real-browser reload suite.
  dom.window.localStorage.clear();
  const card = document.createElement('weather-chart-card');
  card.setConfig({ entity: 'weather.home', animated_icons: false, show_sun: false, ...options });
  let forecastCallback;
  const hass = {
    language: 'en', config: { unit_system: { temperature: '°C', length: 'km' } },
    states: {
      'sun.sun': { state: 'above_horizon', attributes: {} },
      'weather.home': { state, attributes: { temperature_unit: '°C', wind_speed_unit: 'km/h', pressure_unit: 'hPa', supported_features: 3, ...attributes }, last_changed: new Date().toISOString() },
    },
    connection: { subscribeMessage: (callback) => { forecastCallback = callback; return Promise.resolve(() => {}); } },
  };
  card.hass = hass;
  card.forecastItems = 2;
  const root = document.createElement('div');
  return { card, hass, root, get forecastCallback() { return forecastCallback; }, forecast(event) { forecastCallback(event); }, draw(template = card.renderMain()) { render(template, root); return root; } };
}

for (const [name, state, temperature] of [
  ['unknown', 'unknown', 99], ['unavailable with attributes', 'unavailable', 99],
  ['missing', 'sunny', undefined], ['NaN', 'sunny', NaN], ['Infinity', 'sunny', Infinity],
  ['null', 'sunny', null], ['empty', 'sunny', ''], ['whitespace', 'sunny', '  '],
  ['boolean', 'sunny', false], ['malformed', 'sunny', '23oops'],
]) {
  test(`last valid snapshot survives ${name} and clears status on recovery`, () => {
    const f = fixture({ forecast: { condition_icons: false } }, 'sunny', { temperature: -4.2, humidity: 50 });
    const timestamp = f.card.weather.last_changed;
    f.hass.states['weather.home'] = { state, attributes: { temperature }, last_changed: '2026-10-10T12:00:00Z' };
    f.card.hass = f.hass;
    let root = f.draw(f.card.render());
    assert.equal(root.querySelector('.current-temp').textContent.trim(), '-4.2°C');
    assert.equal(root.querySelector('[role="status"]').textContent.trim(), '資料暫時不可用');
    assert.equal(f.card.humidity, 50);
    assert.equal(f.card.weather.last_changed, timestamp);
    f.hass.states['weather.home'] = { state: 'cloudy', attributes: { temperature: 0, temperature_unit: '°C', supported_features: 3 } };
    f.card.hass = f.hass;
    root = f.draw(f.card.render());
    assert.equal(root.querySelector('.current-temp').textContent.trim(), '0°C');
    assert.equal(root.querySelector('[role="status"]'), null);
  });
}

test('weather text remains with the previous snapshot during an outage', () => {
  const f = fixture({ show_text_sensor: true, text_sensor_entity: 'sensor.forecast_text', forecast: { condition_icons: false } }, 'sunny', { temperature: 22 });
  f.hass.states['sensor.forecast_text'] = { state: 'Previous forecast', attributes: { friendly_name: 'Forecast' } };
  f.card.hass = f.hass;
  f.draw(f.card.render());
  f.hass.states['weather.home'] = { state: 'unavailable', attributes: {} };
  f.hass.states['sensor.forecast_text'] = { state: 'unavailable', attributes: {} };
  f.card.hass = f.hass;
  let root = f.draw(f.card.render());
  assert.equal(root.querySelector('.text-sensor-content').textContent.trim(), 'Previous forecast');
  assert.equal(root.querySelector('.weather-data-footer [role="status"]').textContent.trim(), '資料暫時不可用');
  f.card.setConfig({ ...f.card.config, entity: 'weather.other' });
  f.card.hass = f.hass;
  root = f.draw(f.card.render());
  assert.equal(root.querySelector('.text-sensor-content'), null);
});

test('valid forecast and text arriving during weather outage update independently', () => {
  const f = fixture({ show_text_sensor: true, text_sensor_entity: 'sensor.forecast_text', forecast: { condition_icons: false } }, 'sunny', { temperature: 22 });
  f.card.drawChart = () => {};
  f.forecast({ forecast: [{ datetime: '2026-10-12T12:00:00Z', temperature: 24 }] });
  f.hass.states['weather.home'] = { state: 'unavailable', attributes: {} };
  f.hass.states['sensor.forecast_text'] = { state: 'New text', last_changed: '2026-10-11T10:00:00Z', attributes: { friendly_name: 'Forecast' } };
  f.card.hass = f.hass;
  f.forecast({ forecast: [{ datetime: '2026-10-13T12:00:00Z', temperature: 25 }] });
  const root = f.draw(f.card.render());
  assert.equal(root.querySelector('.text-sensor-content').textContent.trim(), 'New text');
  assert.deepEqual(f.card.computeForecastData().tempHigh, [25]);
  assert.equal(root.querySelector('[role="status"]').textContent.trim(), '資料暫時不可用');
});

test('empty weather state with a numeric temperature cannot poison a valid snapshot', () => {
  const f = fixture({}, 'sunny', { temperature: 22 });
  f.hass.states['weather.home'] = { state: '', attributes: { temperature: 99 } };
  f.card.hass = f.hass;
  assert.equal(f.draw(f.card.render()).querySelector('.current-temp').textContent.trim(), '22°C');
  assert.equal(f.card.weather.state, 'sunny');
});

test('forecast type toggle never displays daily data as hourly before hourly arrives', () => {
  const f = fixture({}, 'sunny', { temperature: 22 });
  f.card.drawChart = () => {};
  f.forecast({ forecast: [{ datetime: '2026-10-12T12:00:00Z', temperature: 24 }] });
  f.card.handleForecastTypeToggle();
  assert.deepEqual(f.card.computeForecastData().tempHigh, []);
});

test('missing forecast payload does not erase the last usable forecast', () => {
  const f = fixture({}, 'sunny', { temperature: 22 });
  f.card.drawChart = () => {};
  f.forecast({ forecast: [{ datetime: '2026-10-11T12:00:00Z', temperature: 24 }] });
  assert.doesNotThrow(() => f.forecast({ forecast: null }));
  assert.doesNotThrow(() => f.forecast({}));
  assert.deepEqual(f.card.computeForecastData().tempHigh, [24]);
});

test('snapshots are per-card and alerts still update while weather is unavailable', () => {
  const f = fixture({ show_alerts: true, alert_entity_1: 'sensor.alert', forecast: { condition_icons: false } }, 'sunny', { temperature: 22 });
  f.hass.states['weather.home'] = { state: 'unknown', attributes: {} };
  f.hass.states['sensor.alert'] = { state: 'active', attributes: { title: 'New alert', severity: 'warning' } };
  f.card.hass = f.hass;
  let root = f.draw(f.card.render());
  assert.equal(root.querySelector('.current-temp').textContent.trim(), '22°C');
  assert.match(root.querySelector('.weather-alert-banner').textContent, /New alert/);
  f.hass.states['sensor.alert'].state = 'inactive';
  f.card.hass = f.hass;
  root = f.draw(f.card.render());
  assert.equal(root.querySelector('.weather-alert-banner'), null);
  const empty = fixture({}, 'unknown', { temperature: 99 });
  assert.equal(empty.draw().querySelector('.current-temp').textContent.trim(), '—');
  delete f.hass.states['weather.home'];
  f.card.hass = f.hass;
  assert.equal(f.draw().querySelector('.current-temp').textContent.trim(), '22°C');
});

test('attached icon retains bundled → custom → MDI fallback and ignores repeated errors', () => {
  const f = fixture({ icons: '/custom/', animated_icons: true }, 'sunny', { temperature: 22 });
  const img = document.createElement('img');
  img.style.width = '150px';
  img.src = 'https://invalid.example/sunny.svg';
  f.root.append(img);
  f.card.handleIconError({ target: img }, 'sunny', 'above_horizon');
  assert.match(img.src, /hacsfiles\/uninus-weather-chart-card\/icons\/clear-day.svg$/);
  f.card.handleIconError({ target: img }, 'sunny', 'above_horizon');
  assert.match(img.src, /custom\/clear-day.svg$/);
  f.card.handleIconError({ target: img }, 'sunny', 'above_horizon');
  assert.equal(f.root.querySelector('ha-icon').getAttribute('icon'), 'hass:weather-sunny');
  assert.equal(f.root.querySelector('ha-icon').style.width, '150px');
  assert.doesNotThrow(() => f.card.handleIconError({ target: img }, 'sunny', 'above_horizon'));
});

test('missing optional sensor overrides are empty rather than throwing', () => {
  const f = fixture({ humid: 'sensor.missing', press: 'sensor.missing', uv: 'sensor.missing', windspeed: 'sensor.missing', dew_point: 'sensor.missing', wind_gust_speed: 'sensor.missing', visibility: 'sensor.missing' }, 'sunny', { temperature: 22 });
  assert.doesNotThrow(() => f.draw(f.card.render()));
  assert.equal(f.card.pressure, undefined);
  assert.equal(f.card.windSpeed, undefined);
});

test('initial unavailable data with unit overrides does not attempt invalid conversions', () => {
  const f = fixture({ units: { pressure: 'inHg', speed: 'Bft' } }, 'unavailable');
  const root = f.draw(f.card.render());
  assert.doesNotMatch(root.querySelector('.card').textContent, /NaN|Infinity|12 Bft/);
  assert.equal(root.querySelector('.current-temp').textContent.trim(), '—');
  const recovered = fixture({ units: { pressure: 'inHg', speed: 'Bft' } }, 'sunny', { temperature: 22, pressure_unit: undefined, wind_speed_unit: undefined });
  assert.doesNotThrow(() => recovered.draw(recovered.card.render()));
});

test('forecast snapshot cannot be mutated by a later event payload change', () => {
  const f = fixture({}, 'sunny', { temperature: 22 });
  f.card.drawChart = () => {};
  const forecast = [{ datetime: '2026-10-11T12:00:00Z', temperature: 24 }];
  f.forecast({ forecast });
  f.hass.states['weather.home'].state = 'unavailable';
  f.card.hass = f.hass;
  forecast[0].temperature = NaN;
  forecast.length = 0;
  assert.deepEqual(f.card.computeForecastData().tempHigh, [24]);
});

test('missing sun entity does not break initial empty or recovered weather rendering', () => {
  const f = fixture({ animated_icons: true, show_sun: true }, 'unavailable');
  delete f.hass.states['sun.sun'];
  f.card.hass = f.hass;
  assert.doesNotThrow(() => f.draw(f.card.render()));
  f.hass.states['weather.home'] = { state: 'sunny', attributes: { temperature: 22, supported_features: 3 } };
  f.card.hass = f.hass;
  f.card.forecasts = [{ datetime: '2026-10-11T12:00:00Z', condition: 'sunny' }];
  assert.doesNotThrow(() => f.draw(f.card.render()));
  assert.match(f.root.querySelector('.weather-icon img').getAttribute('src'), /clear-day.svg$/);
});

test('unsupported current and forecast conditions use a neutral icon, never undefined.svg', () => {
  const f = fixture({ animated_icons: true }, 'unknown');
  const root = f.draw();
  assert.equal(root.querySelector('img'), null);
  assert.equal(root.querySelector('.weather-icon ha-icon').getAttribute('icon'), 'mdi:help-circle-outline');
  f.card.forecasts = [{ datetime: '2026-10-11T12:00:00Z', condition: 'unknown' }];
  f.draw(f.card.renderForecastConditionIcons());
  assert.equal(root.querySelector('img'), null);
  assert.equal(root.querySelector('ha-icon').getAttribute('icon'), 'mdi:help-circle-outline');
});

test('late image error after removal is a no-op at every fallback stage', () => {
  const { card } = fixture({}, 'sunny', { temperature: 22 });
  for (const stage of ['final', 'custom', 'bundled', '']) {
    const img = document.createElement('img');
    img.src = '/broken.svg';
    if (stage) img.dataset.fallbackAttempted = stage;
    const src = img.src;
    assert.doesNotThrow(() => card.handleIconError({ target: img }, 'sunny', 'above_horizon'));
    assert.equal(img.src, src);
  }
});

test('invalid optional current numbers are omitted and valid zero feels-like remains visible', () => {
  const options = { show_feels_like: true, show_dew_point: true, show_wind_gust_speed: true, show_visibility: true, units: { pressure: 'inHg', speed: 'm/s' } };
  const f = fixture(options, 'sunny', {
    temperature: 22, apparent_temperature: Infinity, humidity: 'unknown', pressure: 'unavailable', uv_index: NaN,
    dew_point: null, wind_gust_speed: Infinity, visibility: 'unknown', wind_speed: 'unavailable', wind_bearing: NaN,
  });
  const root = f.draw(f.card.renderMain());
  assert.equal(root.querySelector('.feels-like'), null);
  f.draw(f.card.renderAttributes());
  assert.doesNotMatch(root.textContent, /NaN|Infinity|unknown|unavailable|null/);
  f.hass.states['weather.home'].attributes.apparent_temperature = 0;
  f.card.hass = f.hass;
  f.draw(f.card.renderMain());
  assert.match(root.querySelector('.feels-like').textContent, /0°C/);
});

test('changing entity clears snapshot and ignores a late old-entity forecast callback', () => {
  const f = fixture({ forecast: { condition_icons: false } }, 'sunny', { temperature: 22 });
  f.card.drawChart = () => {};
  f.forecast({ forecast: [{ datetime: '2026-10-11T12:00:00Z', temperature: 24 }] });
  const oldCallback = f.forecastCallback;
  f.hass.states['weather.other'] = { state: 'unknown', attributes: {} };
  f.card.setConfig({ ...f.card.config, entity: 'weather.other' });
  f.card.hass = f.hass;
  let root = f.draw(f.card.render());
  assert.equal(root.querySelector('.current-temp').textContent.trim(), '—');
  assert.equal(root.querySelector('[role="status"]').textContent.trim(), '資料暫時不可用');
  assert.deepEqual(f.card.computeForecastData().tempHigh, []);
  f.hass.states['weather.other'] = { state: 'rainy', attributes: { temperature: 10, supported_features: 3 } };
  f.card.hass = f.hass;
  oldCallback({ forecast: [{ datetime: '2026-10-11T12:00:00Z', temperature: 99 }] });
  root = f.draw(f.card.render());
  assert.equal(root.querySelector('.current-temp').textContent.trim(), '10°C');
  assert.deepEqual(f.card.computeForecastData().tempHigh, []);
});

test('unavailable weather without temperature shows no-data instead of NaN°C', () => {
  const { draw } = fixture({}, 'unavailable');
  const root = draw();
  assert.equal(root.querySelector('.current-temp').textContent.trim(), '—');
  assert.equal(root.querySelector('.current-condition').textContent.trim(), 'Unavailable');
  assert.doesNotMatch(root.textContent, /NaN|Infinity|0°C/);
});

test('initial unavailable render has safe empty data, status and no fabricated freshness', () => {
  const f = fixture({ forecast: { condition_icons: false }, show_last_changed: true }, 'unavailable');
  const root = f.draw(f.card.render());
  assert.equal(root.querySelector('.current-temp').textContent.trim(), '—');
  assert.equal(root.querySelector('[role="status"]').textContent.trim(), '資料暫時不可用');
  assert.match(root.textContent, /尚無有效資料/);
  assert.equal(root.querySelector('.updated'), null);
  assert.doesNotMatch(root.textContent, /NaN|Infinity|undefined|null|Invalid Date|0°C/);
});

test('live → unavailable → recovery preserves current, forecast and freshness with an explicit note', () => {
  const f = fixture({ forecast: { condition_icons: false }, show_last_changed: true }, 'sunny', { temperature: 22, humidity: 65, pressure: 1013, wind_speed: 15 });
  // Skip chart creation, but exercise the actual subscription callback and computed data.
  f.card.drawChart = () => {};
  const goodForecast = [{ datetime: '2026-10-11T12:00:00Z', temperature: 24, templow: 16, wind_speed: 12, precipitation: 1 }];
  f.forecast({ forecast: goodForecast });
  const timestamp = f.card.weather.last_changed;
  f.hass.states['weather.home'] = { state: 'unavailable', attributes: {}, last_changed: '2026-10-10T12:00:00Z' };
  f.card.hass = f.hass;
  f.forecast({ forecast: [] });
  const root = f.draw(f.card.render());
  assert.equal(root.querySelector('.current-temp').textContent.trim(), '22°C');
  assert.equal(root.querySelector('.current-condition').textContent.trim(), 'Sunny');
  assert.equal(root.querySelector('[role="status"]').textContent.trim(), '資料暫時不可用');
  assert.equal(f.card.weather.last_changed, timestamp);
  assert.deepEqual(f.card.computeForecastData().tempHigh, [24]);
  f.hass.states['weather.home'] = { state: 'rainy', attributes: { temperature: 18, temperature_unit: '°C', supported_features: 3 }, last_changed: '2026-10-10T13:00:00Z' };
  f.card.hass = f.hass;
  f.forecast({ forecast: [{ ...goodForecast[0], temperature: 19 }] });
  f.draw(f.card.renderMain());
  assert.equal(root.querySelector('.current-temp').textContent.trim(), '18°C');
  assert.equal(root.querySelector('.current-condition').textContent.trim(), 'Rainy');
  assert.equal(root.querySelector('[role="status"]'), null);
  assert.equal(f.card.weather.last_changed, '2026-10-10T13:00:00Z');
  assert.deepEqual(f.card.computeForecastData().tempHigh, [19]);
});
