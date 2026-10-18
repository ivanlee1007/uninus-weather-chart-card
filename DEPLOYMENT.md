# Deployment Notes

The target repository/HACS/card name is **uninus-weather-chart-card**. The rebrand
is unreleased; see [UPGRADING.md](UPGRADING.md) for resource migration and HACS
single-file installation limitations. No remote rename, release or HA deployment
is performed by a local build.

## Canonical identifiers

- Repository: `ivanlee1007/uninus-weather-chart-card`
- HACS name: `uninus-weather-chart-card`
- Canonical Lovelace type: `custom:uninus-weather-chart-card`
- Published frontend filename: `uninus-weather-chart-card.js`

## Development checks

Use the Node.js version and browser setup documented in [tests/README.md](tests/README.md).
Install dependencies from the lockfile, then run the regression suite:

```bash
cd /path/to/uninus-weather-chart-card
npm ci
npm test
```

`npm test` also lints and builds the card. Review `git diff` and stage only intended
files; do not commit local credentials, logs, browser reports, or release ZIPs.
Submit changes for review before merging into `master`.

## Release workflow (separate authorization required)

The package version remains `1.6.8` for this working-tree rebrand. Do not retag or
overwrite the existing v1.6.8 release. Before any future release, choose an unused
version and update package/lock metadata, regression expectations and release
notes together; the commands below are not authorization to publish.

After the reviewed changes are merged and checks pass, create a tag from the
intended `master` commit (replace `vX.Y.Z` with the package version):

```bash
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

The `.github/workflows/release.yml` workflow creates the GitHub release and
automatically uploads:

- `dist/uninus-weather-chart-card.js`
- `dist/weather-chart-card-ha.js` and `dist/weather-chart-card.js` (standalone legacy assets)
- `uninus-weather-chart-card.zip` (root: all three JS files, `icons/`, `icons2/`)

The workflow creates and uploads these only after the release tag is pushed. The local build does not publish anything.

## HACS expectations

`hacs.json` currently points to:

- `filename: uninus-weather-chart-card.js`

HACS selects the canonical `dist/uninus-weather-chart-card.js` release asset and
may download only that file, excluding aliases/icons. Each JS entrypoint is
self-contained; extra JS files and icons are available in the manual ZIP, but
release assets alone do not guarantee HACS installs them. Existing resource URLs
may need manual migration; old HACS paths are not guaranteed to redirect. Keep
exactly one working canonical resource after upgrading. The new CDN paths may
404 until the remote rename and publication are complete.

## Before calling a release done

- version bumped in `package.json`
- `npm test` passed (includes lint and build)
- repo contains updated docs for user-visible changes
- runtime bundle on the target HA instance matches the release
- hard-refresh browser test passed
- GUI editor changes were verified in a fresh browser context

## Repository housekeeping

- Delete completed feature branches only after confirming their changes are in
  `master`. Squash merges produce different commit IDs; compare file trees with
  the merge result instead of relying only on ahead/behind counts.
- Keep open contributor PRs for review; an open PR is not an obsolete branch.
- Keep source assets, shipped `dist/` files, regression fixtures, screenshots,
  license notices, changelogs, and release history. Similar filenames alone do
  not make them disposable.
