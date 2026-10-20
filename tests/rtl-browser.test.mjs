import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import locale from '../src/locale.js';

let browser;
before(async () => {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
});
after(async () => { await browser?.close(); });

test('every supported locale translates both forecast toggle labels', () => {
  for (const [language, strings] of Object.entries(locale)) {
    for (const key of ['daily', 'hourly']) {
      assert.equal(typeof strings[key], 'string', `${language}.${key}`);
      assert.ok(strings[key].length > 0, `${language}.${key}`);
    }
  }
});

for (const settings of [
  { language: 'en', direction: 'ltr', daily: 'Daily', hourly: 'Hourly' },
  { language: 'zh-TW', direction: 'ltr', daily: '每日', hourly: '每小時' },
  { language: 'he', direction: 'rtl', daily: 'יומי', hourly: 'שעתי' },
]) {
  test(`shipped card forecast toggle and numeric layout: ${settings.language}/${settings.direction}`, async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.clock.setFixedTime(new Date('2026-10-18T12:00:00Z'));
      await page.route('**/*', async route => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/') {
          const html = readFileSync(new URL('./persistent-snapshot.html', import.meta.url), 'utf8')
            .replace('<meta charset', `<html dir="${settings.direction}" style="--direction:${settings.direction}"><meta charset`)
            .replace("language: 'en'", `language: '${settings.language}'`)
            .replace('show_time: false', `show_time: true, show_forecast_toggle: true, show_day: true, show_date: true, locale: '${settings.language}', timezone: 'UTC'`)
            .replace('animated_icons: true', 'animated_icons: false')
            .replace('condition_icons: true', 'condition_icons: false');
          return route.fulfill({ contentType: 'text/html', body: html });
        }
        if (path === '/dist/weather-chart-card-ha.js') {
          return route.fulfill({ contentType: 'text/javascript', body: readFileSync(new URL('../dist/weather-chart-card-ha.js', import.meta.url), 'utf8') });
        }
        return route.abort();
      });
      await page.goto('http://rtl.test/');
      await page.waitForFunction(() => window.fixture?.card.forecastChart);
      const toggle = page.locator('weather-chart-card .forecast-toggle');
      assert.equal((await toggle.textContent()).trim(), settings.daily);
      const result = await page.evaluate(() => {
        const card = window.fixture.card;
        card.updateClock();
        const rain = card.forecastChart.data.datasets[2];
        return {
          temperatureDirection: getComputedStyle(card.shadowRoot.querySelector('.current-temp')).direction,
          day: card.getLocalizedDayName(new Date('2026-10-18T12:00:00Z'), 'UTC'),
          date: card.shadowRoot.querySelector('.date-text.date').textContent,
          humidityDirection: getComputedStyle(card.shadowRoot.querySelector('.water-percent') || card.shadowRoot.querySelector('.current-temp')).direction,
          rainLabel: rain.datalabels.formatter(0, { dataset: rain, dataIndex: 0 }),
        };
      });
      assert.equal(result.temperatureDirection, 'ltr');
      if (settings.direction === 'rtl') {
        assert.equal(result.day, 'ראשון');
        assert.match(result.date, /^18 /);
        assert.equal(result.humidityDirection, 'ltr');
        assert.match(result.rainLabel, /^\u202B.*\u202C$/);
      } else {
        assert.doesNotMatch(result.rainLabel, /[\u202B\u202C]/);
      }
      await toggle.click();
      await page.waitForFunction(() => window.fixture.card.config.forecast.type === 'hourly');
      assert.equal((await toggle.textContent()).trim(), settings.hourly);
      await toggle.click();
      assert.equal((await toggle.textContent()).trim(), settings.daily);
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
}
