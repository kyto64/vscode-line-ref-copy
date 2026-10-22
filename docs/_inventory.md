# Documentation inventory

Single Source of Truth (SSOT) boundaries for **Line Ref Copy** (`line-ref-copy`, fork [kyto64/vscode-line-ref-copy](https://github.com/kyto64/vscode-line-ref-copy)).

## SSOT boundary table

| Domain | SSOT location | Notes |
|--------|---------------|-------|
| Product requirements | `docs/product/` | Commands, configuration, user-visible behavior |
| Architecture | `docs/architecture/` | Extension activation, modules, VS Code APIs |
| Operations | `docs/operations/` | CI, release, marketplace |
| Development process | `docs/development/` | Workflow, rulesync, ticket-driven setup |
| AI tool settings (SSOT) | `.rulesync/`, `rulesync.jsonc` | **Devin-only** generate (`agentsmd` rules + `agentsskills` skills); committed: `AGENTS.md`, `.agents/skills/` (not aidd-template-lean multi-tool) |
| Application code | `src/`, `test/` | Implementation and tests; `package.json` for manifest |
| Quick start / install blurb | `README.md` | Short user-facing intro (not full spec) |

When documentation and code conflict, **code wins** until docs are updated in the same PR.

## Directory layout

```
docs/
├── _inventory.md          # this file
├── product/
├── architecture/
├── operations/
└── development/
```

## Key source files

| Path | Role |
|------|------|
| `src/extension.ts` | `activate` / `deactivate`; registers commands |
| `src/line-ref-copy.ts` | Selection formatting, clipboard write |
| `package.json` | Extension manifest, commands, configuration |
| `.github/workflows/ci.yml` | `npm ci`, compile, oxlint, tests (`xvfb-run`) |
| `.github/workflows/check_rulesync.yaml` | `npm run rules:generate` + drift check `AGENTS.md` / `.agents/` (every PR) |
| `AGENTS.md`, `.agents/skills/` | Committed rulesync outputs (Devin) |
| `.devin/blueprint.yaml` | Devin environment (Node 24, xvfb, `npm ci`, lint/build/test knowledge); after merge, run a manual **Sync** in the Devin UI (see `docs/development/rulesync.md`) |
| `.github/workflows/scorecard.yml` | OpenSSF Scorecard supply-chain analysis |
| `.github/dependabot.yml` | Weekly npm / github-actions updates |
| `SECURITY.md` | Vulnerability reporting (English; latest version only) |
