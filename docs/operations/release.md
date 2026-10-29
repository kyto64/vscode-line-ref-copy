# Release plan

This document describes **publish preparation** for **Line Ref Copy** (`line-ref-copy`, publisher `kyto64`). Publishing is automated through Trusted Publishing, but every publish requires kyto's approval in the `release` environment.

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

Open VSX (`ovsx`) is not supported yet (to be considered after the namespace is created).

## Marketplace authentication (Trusted Publishing)

- Publishing runs from GitHub Actions (`.github/workflows/publish.yml`) using **Trusted Publishing (OIDC)**. Personal Access Tokens (PATs) are **no longer used**, and no secrets are stored in the repository.
- Use `@vscode/vsce publish --oidc` (requires 4.1.0 or later; pinned in `devDependencies` of `package.json`).
- Reference: [Publishing Extensions — Secure automated publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

## Automated publishing (publish.yml)

- Triggers: a push of a tag `v*`, or `workflow_dispatch` (required input `tag`). Both check out `refs/tags/<tag>` and never publish from a branch HEAD (the run fails if the tag does not exist).
- The job uses `environment: release`, so it does not start until kyto64 approves it.
- Steps: lint → `xvfb-run -a npm test` → compile → guards → `vsce publish --oidc`.
- Pre-publish guards:
  - Fails if the `version` in `package.json` does not match the tag name (without the leading `v`).
  - Fails if the same version already exists on the Marketplace (prevents re-publishing an existing tag; `vsce publish` itself also fails for the same version).
- Concurrent publishes are prevented with `concurrency` (`cancel-in-progress: false`).

## First-time setup (done manually by kyto)

1. **Register a Trusted Publisher policy on the Marketplace**: in the [publisher management page](https://marketplace.visualstudio.com/manage), go to publisher `kyto64` → Trusted Publishing → Create:
   - Repository owner: `kyto64`
   - Repository: `vscode-line-ref-copy`
   - Workflow: `publish.yml`
   - Environment: `release`
2. **Create the GitHub environment**: in the repository's Settings → Environments, create `release` and set `kyto64` as a required reviewer.

## Release procedure

1. Merge the PR that bumps the version and updates `CHANGELOG.md`.
2. kyto creates and pushes the tag `vX.Y.Z` (or runs `Publish` via `workflow_dispatch` from Actions and enters an existing tag as `tag`).
3. kyto approves the run in the `release` environment.
4. `publish.yml` publishes to the Marketplace.
5. Create a GitHub Release with the contents of `CHANGELOG.md`.

## Fallback (manual VSIX upload)

If Trusted Publishing is unavailable, upload manually as before: build the VSIX with `npm run vsce:package` and upload it from the Marketplace management page.

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
