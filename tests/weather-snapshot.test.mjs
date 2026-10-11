import assert from 'node:assert/strict';
import { test } from 'node:test';
import { snapshotKey, readSnapshot, writeSnapshot, normalizeForecast } from '../src/weather-snapshot.js';

const storage = new Map();
globalThis.window = { localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) } };
const config = { entity: 'weather.home', forecast: { type: 'daily' }, text_sensor_entity: 'sensor.text' };
const hass = { config: { location_name: 'Home', latitude: 24, longitude: 121 } };
const weather = { state: 'sunny', last_changed: '2026-10-11T09:00:00Z', attributes: { temperature: 22, temperature_unit: '°C', token: 'DO_NOT_SAVE' } };
const text = { state: 'Forecast text', last_changed: '2026-10-11T09:01:00Z', attributes: { friendly_name: 'Text', secret: 'DO_NOT_SAVE' } };
const forecast = [{ datetime: '2026-10-12T09:00:00Z', temperature: 24, condition: 'sunny', secret: 'DO_NOT_SAVE' }];

test('normalization retains only valid dated measurements and persists identical entries', () => {
  storage.clear();
  const key = snapshotKey(config, hass);
  const input = [
    { datetime: forecast[0].datetime, temperature: '24', templow: 17, condition: 'sunny', secret: 'DO_NOT_SAVE' },
    { datetime: 'not-a-date', temperature: 91 },
    { datetime: '2026-10-14T12:00:00Z', temperature: 'unavailable', templow: 'unknown' },
    null,
  ];
  const clean = normalizeForecast(input);
  assert.deepEqual(clean, [{ datetime: forecast[0].datetime, condition: 'sunny', temperature: 24, templow: 17 }]);
  writeSnapshot(key, { forecast: clean });
  assert.deepEqual(readSnapshot(key).forecast, clean);
});

test('site/entity/type/text isolation and only allowlisted fields persist', () => {
  storage.clear();
  const key = snapshotKey(config, hass);
  writeSnapshot(key, { weather, readings: { temperature: 22, secret: 'DO_NOT_SAVE' }, forecast, text });
  assert.equal(storage.get(key).includes('DO_NOT_SAVE'), false);
  assert.equal(readSnapshot(key).forecast[0].datetime, forecast[0].datetime);
  for (const [differentConfig, differentHass] of [
    [{ ...config, entity: 'weather.other' }, hass],
    [{ ...config, forecast: { type: 'hourly' } }, hass],
    [{ ...config, text_sensor_entity: 'sensor.other' }, hass],
    [config, { config: { ...hass.config, location_name: 'Elsewhere' } }],
  ]) assert.equal(readSnapshot(snapshotKey(differentConfig, differentHass)), null);
});

test('corrupt, incompatible, oversized, disabled and quota storage fail without throwing', () => {
  const key = snapshotKey(config, hass);
  for (const raw of ['{', JSON.stringify({ version: 99, key, weather }), 'x'.repeat(70000)]) {
    storage.set(key, raw);
    assert.equal(readSnapshot(key), null);
  }
  const original = window.localStorage;
  window.localStorage = { getItem() { throw Error('disabled'); }, setItem() { throw Error('quota'); } };
  assert.equal(readSnapshot(key), null);
  assert.doesNotThrow(() => writeSnapshot(key, { weather, forecast, text }));
  window.localStorage = original;
});

test('forecast receipt timestamp is stored separately from forecast point date and invalid timestamp is not restored', () => {
  storage.clear();
  const key = snapshotKey(config, hass);
  const receivedAt = '2026-10-11T09:03:00Z';
  writeSnapshot(key, { forecast, forecastReceivedAt: receivedAt });
  assert.equal(readSnapshot(key).forecastReceivedAt, receivedAt);
  assert.equal(readSnapshot(key).forecast[0].datetime, forecast[0].datetime);
  const raw = JSON.parse(storage.get(key));
  raw.forecastReceivedAt = 'unavailable';
  storage.set(key, JSON.stringify(raw));
  assert.equal(readSnapshot(key).forecastReceivedAt, null);
});

test('independently arriving forecast and text survive without a current weather snapshot', () => {
  storage.clear();
  const key = snapshotKey(config, hass);
  writeSnapshot(key, { forecast, text });
  const restored = readSnapshot(key);
  assert.deepEqual(restored.forecast, [{ datetime: forecast[0].datetime, temperature: 24, condition: 'sunny' }]);
  assert.equal(restored.text.state, 'Forecast text');
  assert.equal(restored.weather, null);
});
