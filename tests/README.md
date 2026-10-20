# Local regression tests

Use Node.js 22.22.2+, 24.15+, or 26+ (tested with Node.js 26.7) and `npm ci`, then `npm test`.
`pretest` runs ESLint and rebuilds all three standalone JavaScript entrypoints before testing.
Only the known module-type autodetection warning is suppressed; test errors are not.

The DOM tests use real Lit templates in jsdom. Browser tests use Playwright with
installed Microsoft Edge on Windows. Elsewhere, install its Chromium browser with
`npx playwright install chromium`. Set `PLAYWRIGHT_CHANNEL` to override the browser
channel. Tests use local files and synthetic state objects, block HTTPS requests,
and never connect to Home Assistant.

Coverage includes:

- Canonical/legacy card and editor registrations with one canonical picker entry.
- All six orders of the three standalone files, repeated module/classic/cache-busted loads, one Lit initialization, and mixed old/new cards rendering Chart.js.
- Editor config/stub behavior and unchanged snapshot keys across old/new type outage reloads.
- Canonical HACS/repository metadata, release assets/ZIP contracts and retained icon sets.

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
