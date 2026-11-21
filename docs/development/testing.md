# Integration testing

Extension behavior is verified with `@vscode/test-electron` (see `test/runTest.ts`).

## Running tests locally

```bash
npm run compile
xvfb-run -a npm test   # Linux headless CI uses the same command
```

## Layout

| Path | Role |
|------|------|
| `test/runTest.ts` | Launches VS Code twice: single-root folder workspace, then multi-root `.code-workspace` |
| `test/suite/copy-with-line-numbers.test.ts` | Command matrix, clipboard assertions via `vscode.env.clipboard.readText` |
| `test/suite/copy-with-line-numbers.multi-root.test.ts` | Relative path when multiple workspace folders are open |
| `test/suite/package-manifest.test.ts` | `package.json` context menu contributions |
| `test/fixtures/` | Sample files (UTF-8, CRLF, in/out of workspace) |

Tests assert the full clipboard string, including `File:` headers, zero-padded line numbers, and multi-selection `---` separators.

## Quality gates in CI

`.github/workflows/ci.yml` runs these jobs on every pull request to `master`:

| Job | What it checks |
|-----|----------------|
| `build` | `npm ci`, `npm run compile` (TypeScript), `npm run lint` (Oxlint), `xvfb-run -a npm test` |
| `comment-check` | Comments added or changed by the PR, parsed per language by `.github/comment-check/` (plus that tool's own tests) |
| `verify-lockfile` | `.github/workflows/actions.lock` matches the workflows |

`check-rulesync` (`.github/workflows/check_rulesync.yaml`) verifies that the rulesync outputs are up to date.

Run the comment check locally:

```bash
npm ci --prefix .github/comment-check --ignore-scripts
node .github/comment-check/src/cli.mjs --base origin/master
```

Comments are not added by default. Allowed exceptions (license notices, public API docs, `INVARIANT:` / `SECURITY:` / `EXTERNAL:` constraints, tool directives) are written in English and listed in the PR. The rules are in `.claude/rules/code-quality.md` (generated from `.rulesync/rules/code-quality.md`).
