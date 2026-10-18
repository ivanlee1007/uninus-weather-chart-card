# Deployment Notes

This repository is published to HACS as **UNiNUS Weather Chart Card**.

## Canonical identifiers

- Repository: `ivanlee1007/weather-chart-card`
- HACS name: `UNiNUS Weather Chart Card`
- Canonical Lovelace type: `custom:weather-chart-card`
- Published frontend filename: `weather-chart-card-ha.js`

## Development checks

Use the Node.js version and browser setup documented in [tests/README.md](tests/README.md).
Install dependencies from the lockfile, then run the regression suite:

```bash
cd /path/to/weather-chart-card
npm ci
npm test
```

`npm test` also lints and builds the card. Review `git diff` and stage only intended
files; do not commit local credentials, logs, browser reports, or release ZIPs.
Submit changes for review before merging into `master`.

## Release workflow

After the reviewed changes are merged and checks pass, create a tag from the
intended `master` commit (replace `vX.Y.Z` with the package version):

```bash
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

The `.github/workflows/release.yml` workflow creates the GitHub release and
automatically uploads:

- `dist/weather-chart-card-ha.js`
- `weather-chart-card-ha.zip` (root: `weather-chart-card-ha.js`, `icons/`, `icons2/`)

The workflow creates and uploads these only after the release tag is pushed. The local build does not publish anything.

## HACS expectations

`hacs.json` currently points to:

- `filename: weather-chart-card-ha.js`

HACS loads the built `dist/weather-chart-card-ha.js`; keep the filename and README consistent when changing build outputs.

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
