---
root: true
targets:
  - '*'
globs:
  - '**/*'
---
<!--
  SSOT: Edit .rulesync/ and run `npm run rules:generate`.
  Generated for Devin: AGENTS.md and .agents/skills/ (see rulesync.jsonc targets).
-->
# Project overview

**Line Ref Copy** (`line-ref-copy`) — VS Code extension that copies the current selection to the clipboard with line numbers (and optional file path). Fork maintained at [kyto64/vscode-line-ref-copy](https://github.com/kyto64/vscode-line-ref-copy); upstream by [yassh](https://github.com/yassh/vscode-copy-with-line-numbers).

## Setup and quality gates

Node.js 24 (matches CI). Devin environment: `.devin/blueprint.yaml`.

```bash
npm ci
npm run lint
npm run compile
xvfb-run -a npm test   # Linux headless; elsewhere `npm test`
npm run rules:generate # after .rulesync/ edits; must leave no diff
```

CI required checks: `build` (`.github/workflows/ci.yml`) and `check-rulesync` (`.github/workflows/check_rulesync.yaml`).

## Tech stack

- Runtime: VS Code Extension API (`vscode` module)
- Language: TypeScript (compile to `out/`)
- Clipboard: `vscode.env.clipboard.writeText` (no native `copy-paste` module at runtime)
- Quality: Oxlint + TypeScript 7; CI in `.github/workflows/ci.yml` (compile, lint, `xvfb-run` tests); supply-chain: SHA-pinned Actions, Dependabot, OpenSSF Scorecard (see `docs/operations/security.md`)
- Issue tracking: GitHub Issues + `gh`
- AI settings: rulesync (`.rulesync/` → `npm run rules:generate`)

## Documentation (SSOT)

Markdown under `docs/` is the Single Source of Truth for specifications. When docs and code disagree, code wins unless you explicitly update docs in the same PR.

- [docs/_inventory.md](./docs/_inventory.md) — inventory and SSOT boundaries
- [docs/product/index.md](./docs/product/index.md) — product
- [docs/architecture/index.md](./docs/architecture/index.md) — architecture
- [docs/operations/index.md](./docs/operations/index.md) — operations
- [docs/development/index.md](./docs/development/index.md) — development

User-facing install/usage summary remains in [README.md](./README.md).

## Development workflow

Ticket-driven development using GitHub Issues. Setup: [docs/development/ticket-driven-setup.md](./docs/development/ticket-driven-setup.md).

Skills live under `.rulesync/skills/` (SSOT). This repo’s `rulesync.jsonc` generates **Devin-facing outputs only** (`agentsmd` rules + `agentsskills` skills); Cursor/Claude/Codex outputs are not generated here (differs from [aidd-template-lean](https://github.com/kyto64/aidd-template-lean)).

- `@skills:start-ticket <issue-number>` — start issue, plan, implement, open PR
- `@skills:address-pr-feedback <pr-number>` — address review feedback
- `@skills:close-ticket <issue-number>` — post-merge docs update
- `@skills:spec-lookup` — answer from `docs/` (code when needed)

### Devin

- Project rules: `.rulesync/rules/` (all `root: true`) → `npm run rules:generate` → single root `AGENTS.md`
- Skills: `.rulesync/skills/` → `npm run rules:generate` → `.agents/skills/*/SKILL.md`
- Environment: `.devin/blueprint.yaml` (Node 24, xvfb + VS Code test libraries, `npm ci`, lint/build/test knowledge)

## AI settings changes

Edit `.rulesync/` only, then `npm run rules:generate`. Commit `.rulesync/`, `rulesync.jsonc`, **`AGENTS.md`**, and **`.agents/skills/`** (see `docs/development/rulesync.md`). Keep `AGENTS.md` under 16 KiB.

## Language

- `README.md` and `docs/`: English
- GitHub Issues and PRs: Japanese
- Code comments: English

See [docs/development/language-policy.md](./docs/development/language-policy.md).
