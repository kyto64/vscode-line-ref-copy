# Operations overview

## Repository

- **GitHub**: [kyto64/vscode-line-ref-copy](https://github.com/kyto64/vscode-line-ref-copy)
- **Default branch**: `master`
- **License**: MIT (Copyright yassh and kyto64; see `LICENSE`)

## CI

Workflow: `.github/workflows/ci.yml`

| Step | Command |
|------|---------|
| Install | `npm ci` |
| Compile | `npm run compile` |
| Lint | `npm run lint` (`oxlint` via `.oxlintrc.json`) |
| Test | `xvfb-run -a npm test` |

Permissions: `contents: read` at workflow scope; jobs use least privilege. Actions are pinned to commit SHAs; checkout sets `persist-credentials: false`.

| Workflow | Role |
|----------|------|
| `ci.yml` | `npm ci`, compile, oxlint, `xvfb-run` tests |
| `check_rulesync.yaml` | `npm run rules:generate` (rulesync 33.0.0 + Devin frontmatter adapter) + drift check `AGENTS.md` / `.agents/` on every PR |
| `scorecard.yml` | OpenSSF Scorecard (weekly + `master` push) |

Dependabot (weekly, grouped minor/patch): `.github/dependabot.yml`. Security policy: `SECURITY.md`. Details: [security.md](./security.md).

### Node.js version (CI and types)

As of **2026-10-14**, [Node.js releases](https://nodejs.org/en/about/previous-releases) list **v24 (Krypton)** as **LTS** and **v26** as **Current** (not yet LTS). Production-style CI therefore pins **`node-version: "24"`** explicitly in `ci.yml` and `check_rulesync.yaml` (no `lts/*` vs `"22"` split).

| Runtime | Node major | Notes |
|---------|------------|--------|
| GitHub Actions (`npm ci`, compile, lint, test) | **24** | Active LTS line for toolchain |
| VS Code extension host (`engines.vscode` `^1.74.0` minimum) | **16** | [vscode-versions](https://github.com/ewanharris/vscode-versions) for 1.74.x |

`@types/node` **major** is kept aligned with **CI Node** (24), not with the newest npm major (e.g. 26) nor with the oldest extension-host Node. That keeps TypeScript checking consistent with how we build and test, while avoiding Dependabot jumps ahead of CI. Extension code should stick to APIs available in the supported VS Code host (primarily `vscode` APIs); do not rely on Node APIs newer than the minimum host without guards.

Dependabot ignores `@types/node` **major** bumps in `.github/dependabot.yml`; bump `@types/node` major when CI Node major changes.

## Local verification

```bash
npm ci
npm run compile
npm run lint
npm test          # headless Linux: xvfb-run -a npm test
```

`npm test` compiles TypeScript then runs `@vscode/test-electron` via `test/runTest.ts` (suite under `test/suite/`). On Linux CI, tests run under `xvfb-run` for a virtual display.

## Toolchain (summary)

| Tool | Role |
|------|------|
| TypeScript 7.x | Compile `src/` → `out/` |
| Oxlint | Lint (`.oxlintrc.json`; ignores `out/`, `node_modules/`, `.vscode-test/`). Oxlint has no rules for `semi: never` or `max-len: 120`, so they are not enforced by lint (a formatter is out of scope for now) |
| `@vscode/test-electron` | Download VS Code build and run extension tests |
| `engines.vscode` | `^1.74.0` (`@types/vscode` ~1.74.0) |
| Node.js (CI) | **24** (Active LTS); `@types/node` ^24 |

## Release / marketplace

Publisher id in `package.json`: `kyto64`. Extension id: `line-ref-copy` (**Line Ref Copy**). See [release.md](./release.md) for manual-first publishing (no automated workflow yet). Document version bumps in `CHANGELOG.md` when cutting releases.

## Incident response

- **Broken clipboard on remote**: Confirm VS Code version supports `vscode.env.clipboard`; check user error toast from catch block.
- **CI test failure on Linux**: Confirm `xvfb-run` is available (GitHub-hosted runners include it); inspect `@vscode/test-electron` download logs.
