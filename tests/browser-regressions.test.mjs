import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

let browser;
before(async () => {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
});
after(async () => { await browser?.close(); });

async function pageForFixture() {
  const page = await browser.newPage();
  page.fixtureErrors = [];
  page.on('pageerror', (error) => page.fixtureErrors.push(error.stack));
  // Exercise local shipped bundles only; no CDN/HA connections.
  await page.route('https://**', (route) => route.abort());
  await page.goto(pathToFileURL(resolve('tests/clock-stacking.html')).href);
  await page.waitForFunction(() => window.configureClockFixture && document.querySelector('weather-chart-card').forecastChart);

  return page;
}

test('real card and chart retain the valid snapshot during outage and refresh on recovery', async () => {
  const page = await pageForFixture();
  try {
    const result = await page.evaluate(async () => {
      const card = document.querySelector('weather-chart-card');
      await window.configureClockFixture({ show_last_changed: true });
      const before = { temperature: card.shadowRoot.querySelector('.current-temp').textContent.trim(), high: card.computeForecastData().tempHigh, timestamp: card.weather.last_changed };
      const original = hass.states['weather.home'];
      hass.states['weather.home'] = { state: 'unavailable', attributes: {}, last_changed: new Date().toISOString() };
      card.hass = hass;
      await card.updateComplete;
      const outage = { temperature: card.shadowRoot.querySelector('.current-temp').textContent.trim(), high: card.forecastChart.data.datasets[0].data, timestamp: card.weather.last_changed, note: card.shadowRoot.querySelector('[role="status"]').textContent.trim() };
      hass.states['weather.home'] = { ...original, state: 'rainy', attributes: { ...original.attributes, temperature: 18 }, last_changed: '2026-10-10T06:00:00Z' };
      card.hass = hass;
      card.forecasts = [{ datetime: '2026-10-11T12:00:00Z', temperature: 19, templow: 10, precipitation: 0, wind_speed: 5, condition: 'rainy' }];
      await card.updateComplete;
      card.drawChart();
      const recovery = { temperature: card.shadowRoot.querySelector('.current-temp').textContent.trim(), high: card.forecastChart.data.datasets[0].data, timestamp: card.weather.last_changed, note: !!card.shadowRoot.querySelector('[role="status"]') };
      return { before, outage, recovery };
    });
    assert.equal(result.outage.temperature, result.before.temperature);
    assert.deepEqual(result.outage.high, result.before.high);
    assert.equal(result.outage.timestamp, result.before.timestamp);
    assert.equal(result.outage.note, '資料暫時不可用');
    assert.equal(result.recovery.temperature, '18°C');
    assert.deepEqual(result.recovery.high, [19]);
    assert.equal(result.recovery.timestamp, '2026-10-10T06:00:00Z');
    assert.equal(result.recovery.note, false);
    assert.deepEqual(page.fixtureErrors, [], 'unexpected browser errors');
  } finally { await page.close(); }
});

test('existing clock stacking fixture passes desktop and mobile', async () => {
  const page = await pageForFixture();
  try {
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const options of [{}, { title: '', show_time_seconds: true }, { show_day: false, show_date: false }]) {
        const result = await page.evaluate((options) => window.checkStacking(options), options);
        assert.equal(result.pass, true, JSON.stringify(result));
        assert.equal(result.temp, '22°C');
      }
    }
  } finally { await page.close(); assert.deepEqual(page.fixtureErrors, [], 'unexpected browser errors'); }
});

test('missing forecast measurements remain gaps and safe labels in the real chart', async () => {
  const page = await pageForFixture();
  try {
    const result = await page.evaluate(async () => {
      const card = document.querySelector('weather-chart-card');
      card.setConfig({ ...card.config, forecast: { ...card.config.forecast, disable_animation: true } });
      card.forecasts = [
        { datetime: '2026-10-11T12:00:00Z', temperature: 'unavailable', templow: NaN, precipitation: null, precipitation_probability: 'unknown', wind_speed: 'unknown', condition: 'unknown' },
        { datetime: '2026-10-12T12:00:00Z', temperature: 2, templow: 1, precipitation: 0, wind_speed: 0, condition: 'sunny' },
      ];
      await card.updateComplete;
      const data = card.computeForecastData();
      card.drawChart();
      const chart = card.forecastChart;
      const missingContext = { dataIndex: 0, dataset: chart.data.datasets[0] };
      const lowContext = { dataIndex: 0, dataset: chart.data.datasets[1] };
      const precipContext = { dataIndex: 0, dataset: chart.data.datasets[2] };
      return {
        high: data.tempHigh, low: data.tempLow, precip: data.precip,
        wind: Array.from(card.shadowRoot.querySelectorAll('.wind-speed'), (node) => node.textContent),
        showHigh: chart.data.datasets[0].datalabels.display(missingContext),
        highLabel: chart.data.datasets[0].datalabels.formatter(undefined, missingContext),
        lowLabel: chart.data.datasets[1].datalabels.formatter(undefined, lowContext),
        precipLabel: chart.data.datasets[2].datalabels.formatter(undefined, precipContext),
        min: chart.options.scales.TempAxis.suggestedMin,
        max: chart.options.scales.TempAxis.suggestedMax,
      };
    });
    assert.deepEqual(result.high, [undefined, 2]);
    assert.deepEqual(result.low, [undefined, 1]);
    assert.deepEqual(result.precip, [undefined, 0]);
    assert.deepEqual(result.wind, ['—', '0']);
    assert.equal(result.showHigh, false);
    assert.equal(result.highLabel, '');
    assert.equal(result.lowLabel, '');
    assert.equal(result.precipLabel, '');
    assert.equal(Number.isFinite(result.min), true);
    assert.equal(Number.isFinite(result.max), true);
  } finally { await page.close(); assert.deepEqual(page.fixtureErrors, [], 'unexpected browser errors'); }
});
