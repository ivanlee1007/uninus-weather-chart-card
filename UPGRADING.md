# Upgrading to uninus-weather-chart-card

## Status

Version **v1.6.9** introduces this compatibility-preserving rebrand. Existing
published v1.6.8 assets are historical and do not include these changes; they
remain unchanged. No Home Assistant installation is changed by building or
publishing this repository. Live HACS/HA migration has not been verified.

## Names and compatibility

| Surface | Canonical | Retained compatibility |
| --- | --- | --- |
| Repository | `ivanlee1007/uninus-weather-chart-card` | GitHub rename handling is separate from HA resource URLs |
| HACS/card picker display name | `uninus-weather-chart-card` | Only one picker entry is added by this build |
| YAML type | `custom:uninus-weather-chart-card` | `custom:weather-chart-card` remains supported |
| Frontend | `uninus-weather-chart-card.js` | `weather-chart-card-ha.js` and `weather-chart-card.js` remain standalone build/release assets |
| Editor element | `uninus-weather-chart-card-editor` | `weather-chart-card-editor` remains an alias |

All three JavaScript files contain the same self-contained bundle. No internal
shared `.js` file or network import is required. A page-global once guard runs
before bundled Lit/Chart initialization; repeated loads of these new files,
including cache-busting URLs, do not register duplicate constructors or picker
entries. The first loaded build wins until a **full browser reload**. This guard
cannot retrofit protection into older, already-published unguarded bundles or an
unrelated upstream card. Do not intentionally keep multiple resources installed.

Existing YAML options and explicit titles are preserved. New default/stub titles
use `uninus-weather-chart-card`. The storage prefix remains
`weather-chart-card:snapshot:v1:`; no key migration or storage clearing is needed.
Last-valid snapshots remain usable with either YAML type on the same origin and
with the same site/entity/forecast/text identity. Browser storage remains
best-effort; changing the HA origin or clearing storage loses that history.

## HACS upgrade checklist (v1.6.9 and later)

1. Back up dashboard/resource configuration and note the current repository and
   resource URLs before updating. Confirm the renamed repository in HACS; a
   GitHub repository rename does not guarantee every HACS installation migrates
   its stored namespace automatically.
2. Install v1.6.9 or later through HACS. `hacs.json` selects
   **`uninus-weather-chart-card.js`**. HACS may download **only that selected
   JavaScript**, not the compatibility filenames or either icon directory, even
   when they are all present as release assets/in the ZIP.
3. Inspect Dashboard resources. The canonical HACS resource is
   `/hacsfiles/uninus-weather-chart-card/uninus-weather-chart-card.js` with type
   **JavaScript module** (HACS may append a cache tag). Verify the actual installed
   resource returns JavaScript. If HACS retained an old installation namespace,
   inspect the actual installed path rather than guessing a redirect.
4. Remove stale resources under old namespaces such as
   `/hacsfiles/weather-chart-card/weather-chart-card-ha.js` or
   `/hacsfiles/weather-chart-card-ha/weather-chart-card-ha.js`, and keep **exactly
   one** working canonical resource. A file alias inside a release does not make
   an old `/hacsfiles/...` directory exist. **Old resource URLs are not guaranteed
   to redirect or keep working.** A manual resource URL update may be required.
5. Hard-refresh/reload the browser completely. Check both existing legacy cards
   and the single `uninus-weather-chart-card` picker entry. Existing YAML can
   remain `custom:weather-chart-card`; use the canonical type for new cards or
   change it later without changing the other configuration.

This checklist is guidance, not a claim of a live HACS/HA migration test. Local
regressions use isolated synthetic HA state and installed Edge.

## Manual/offline installation

Use `uninus-weather-chart-card.zip` and extract its three standalone
JavaScript files plus `icons/` and `icons2/`. Put the canonical file in `<config>/www/`
and load `/local/uninus-weather-chart-card.js` as a module. If retaining a manual
legacy resource, copy the corresponding legacy file to its existing path; either
file supports both YAML types. Load only one resource.

For fully offline icons, copy both icon directories alongside the script, then
set `icons: /local/icons/` (style1) or `icons: /local/icons2/` (style2), adjusting the
path if using a subdirectory. Setting `animated_icons: false` uses HA/MDI icons.
The JavaScript itself needs no CDN, but animated SVG icons default to the
repository's jsDelivr CDN. CDN caches may take time to update after a release;
use the explicit local icon paths above when offline access is required.
Local fallback is best-effort and cannot supply icon files HACS did not install.
