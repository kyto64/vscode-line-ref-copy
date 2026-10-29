# Release plan (manual-first)

This document describes **publish preparation** for **Line Ref Copy** (`line-ref-copy`, publisher `kyto64`). It does **not** automate publishing; kyto must approve every public release.

## Current state (2026-10-14)

| Item | Status |
|------|--------|
| Extension id | `line-ref-copy` (`package.json` `name`) |
| Display name | Line Ref Copy |
| Publisher (VS Code Marketplace) | `kyto64` — publisher account exists |
| Open VSX namespace | **Not** created yet |
| Version | `0.1.2`, `preview: true` |
| Icon | `images/icon.svg` (source) → `images/icon.png` (256×256, Marketplace) |
| LICENSE | MIT — yassh (2017) + kyto64 (2026); credited in README |

## Local packaging (no publish)

After `npm ci` and `npm run compile`:

```bash
npx @vscode/vsce ls          # list files in the VSIX
npm run vsce:package         # produces line-ref-copy-0.1.0.vsix
```

`.vscodeignore` trims dev-only paths (tests, docs, rulesync, CI configs). Do not commit `.vsix` artifacts.

Open VSX (`ovsx`) packaging may be added later when a namespace exists; not required for Marketplace-only preview.

## Marketplace authentication

- Publishing uses a **Personal Access Token** with Marketplace publish scope.
- Microsoft has announced retirement of long-lived Marketplace PATs on **2026-12-01**; plan to migrate to the supported auth flow before that date.
- **Never** commit tokens or store them in the repository.

## Planned automation (not implemented)

A future GitHub Actions workflow may:

1. Run only on manual dispatch or on a tagged release, after kyto approval.
2. Use a GitHub **environment** named `release` with **kyto64 as a required reviewer** before secrets are exposed.
3. Build with `npm ci`, `npm run compile`, `npm test`, then `vsce publish` (and optionally `ovsx publish`).

**This repository intentionally has no publish workflow yet** (see Issue #6). Until automation lands, releases are manual: bump version, update `CHANGELOG.md`, `vsce package`, publish from a trusted machine, then push the tag.

## Pre-publish checklist

- [ ] kyto explicit approval for the version
- [ ] `CHANGELOG.md` entry for the version
- [ ] `npm run lint` and `xvfb-run -a npm test` green on `master`
- [ ] `npm run vsce:package` succeeds; spot-check `vsce ls`
- [ ] README credits yassh; LICENSE notices intact
- [ ] Regenerate `images/icon.png` from `images/icon.svg` if the artwork changes (`npx -p sharp` one-off; see repo `images/`)

## Post-publish

- Create a GitHub release with notes from `CHANGELOG.md`.
- Monitor [GitHub Issues](https://github.com/kyto64/vscode-line-ref-copy/issues) for regressions.
