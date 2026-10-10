# Local regression tests

Use Node.js 22.19+ (tested with Node.js 26.7) and `npm ci`, then `npm test`.
`pretest` runs ESLint and rebuilds both shipped JavaScript bundles before testing.
Only the known module-type autodetection warning is suppressed; test errors are not.

The DOM tests use real Lit templates in jsdom. Browser tests use Playwright with
installed Microsoft Edge on Windows. Elsewhere, install its Chromium browser with
`npx playwright install chromium`. Set `PLAYWRIGHT_CHANNEL` to override the browser
channel. Tests use local files and synthetic state objects, block HTTPS requests,
and never connect to Home Assistant.

Coverage includes:

- Live → unavailable/unknown/missing/non-finite → recovered weather.
- In-memory, per-instance, entity-scoped last-valid display data and freshness.
- Exact outage note `資料暫時不可用`, including initial no-snapshot placeholders.
- Entity changes, late old-entity forecast events, and payload mutation isolation.
- Weather-independent alert updates, zero and negative measurements, unit overrides.
- Missing optional sensors/sun, invalid condition icons, detached image errors,
  and attached bundled/custom/MDI fallback.
- Real Chart.js rendering of measurement gaps without fabricated zeros or invalid
  labels, and the existing desktop/mobile clock/modal stacking fixture.

`clock-stacking.html` initializes configuration before connecting the custom
card. Its helper is named `configureClockFixture` to avoid shadowing the shipped
bundle's global ChartDataLabels `configure` function.
