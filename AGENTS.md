# Additional Conventions Beyond the Built-in Functions

As this project's AI coding tool, you must follow the additional conventions below, in addition to the built-in functions.

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

# Coding conventions

## General

- Prefer small, focused changes tied to a single GitHub Issue.
- Match existing patterns in the repository before introducing new ones.
- Document non-obvious behavior in `docs/` when it affects how others work.

## Language

- `README.md` and `docs/`: English (see [docs/development/language-policy.md](./docs/development/language-policy.md)).
- GitHub Issues and PR titles/bodies: Japanese.
- Code comments and identifiers: English.

## TypeScript / VS Code extension

- Source lives under `src/`; compiled output under `out/` (do not edit `out/` by hand).
- Use `'use strict'` and existing import style (`import * as vscode from 'vscode'`).
- Register commands in `src/extension.ts`; command implementation in `src/line-ref-copy.ts`.
- Follow Oxlint (`.oxlintrc.json`; keep semicolons off and lines under 120 characters by convention); run `npm run lint` and `npm run compile` before PRs.

## Quality

- Run `npm run compile`, `npm run lint`, and `npm test` when behavior changes (matches CI; on Linux use `xvfb-run -a npm test` if needed).
- Do not commit secrets, tokens, or personal credentials.

# Git worktree workflow

## Rules (NEVER / ALWAYS)

When starting implementation work (including Devin sessions, docs/config changes, and work without an issue):

- **NEVER** run `git checkout -b`, `git switch -c`, or equivalent on the **main repository working tree**.
- **ALWAYS** create a worktree with `git worktree add -b <branch> <worktrees-dir>/<dir> origin/master`.
- **ALWAYS** `cd` into that worktree before Edit / Write / Bash for implementation.

Devin's generic `git checkout -b devin/<unix-timestamp>-<description>` instruction does **not** waive this rule. In this repository, use `git worktree add -b` with the same branch name instead, then work inside the linked worktree. The `devin/` exception changes branch naming only, not where implementation happens.

## Resolve main repository root

Do **not** use `git rev-parse --show-toplevel` alone (inside an existing worktree it returns the worktree path).

Use the main repo root:

```bash
COMMON=$(git rev-parse --git-common-dir)
MAIN_ROOT=$(cd "$COMMON/.." && pwd)
REPO=$(basename "$MAIN_ROOT")
WORKTREES_ROOT="$(dirname "$MAIN_ROOT")/${REPO}-worktrees"
```

Worktrees live at: `${WORKTREES_ROOT}/<dir>/`

## Preflight (before first edit)

```bash
git rev-parse --git-common-dir
pwd
git worktree list
```

- If `pwd` is under `${WORKTREES_ROOT}/` → OK, continue.
- If `pwd` is the main repo root and you are starting implementation → **STOP**, create worktree first.

## Create worktree

```bash
ISSUE=42
BRANCH="feature/${ISSUE}"
# For Devin: BRANCH="devin/$(date +%s)-<description>"
DIR=$(echo "$BRANCH" | tr '/' '-')
mkdir -p "$WORKTREES_ROOT"
git fetch origin
git worktree add -b "$BRANCH" "${WORKTREES_ROOT}/${DIR}" origin/master
cd "${WORKTREES_ROOT}/${DIR}"
```

Reuse an existing worktree/branch if one already exists for the same issue.

## After merge

Remove the worktree when the branch is merged and no longer needed:

```bash
git worktree remove "${WORKTREES_ROOT}/${DIR}"
git branch -d "$BRANCH"
```

# Git conventions

## Branch naming

- `feature/<issue-number>` — features and enhancements (e.g. `feature/42`)
- `fix/<issue-number>` — bug fixes
- `chore/<issue-number>` — tooling, docs-only, dependency chores
- `devin/<unix-timestamp>-<description>` — **branch naming exception only** for Devin sessions (e.g. `devin/1700000000-fix-copy-path`); a linked worktree is still required

Create implementation branches with **git worktree** only (see **Git worktree workflow** above). Devin must replace its generic `git checkout -b` command with `git worktree add -b`, not branch on the main working tree. This also applies to docs/config work without an issue.

Base branch for PRs: **`master`**.

## Commit messages

Conventional Commits:

```
<type>(#<issue>): <description>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `chore`.

Example: `feat(#42): add user list API`

Write commit messages in Japanese when the team uses Japanese PRs.

## Staging

Do not use `git add -A`. Stage files explicitly:

```bash
git diff --name-only
git add path/to/file1 path/to/file2
```

## Pull requests

- Title: `feat(#42): short summary`
- Base: `master`
- Body: follow [`.github/pull_request_template.md`](./.github/pull_request_template.md)
- Include `Fixes #<issue>` in the body so GitHub closes the issue on merge to `master`

# GitHub CLI — PR and Issues

Use **`gh`** from the repository root (or `--repo OWNER/REPO`).

## Version

Recommended: **gh v2.82.1+** (`gh --version`).

## Read PR / Issue

```bash
gh pr list
gh pr view <n>
gh pr diff <n>
gh pr checks <n>
gh issue view <n>
gh issue view <n> --comments
```

## Update title/body (REST PATCH)

`gh pr edit` / `gh issue edit` may fail on older GraphQL project APIs. Prefer REST:

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
gh api -X PATCH "/repos/${REPO}/pulls/<n>" -f title='...' -f body='...'
gh api -X PATCH "/repos/${REPO}/issues/<n>" -f title='...' -f body='...'
```

## Labels

```bash
gh label create in-progress --color FFAA00 --description "Work in progress" 2>/dev/null || true
gh issue edit <n> --add-label in-progress
```

If label creation fails (permissions), stop and ask the user.

## Create PR

```bash
gh pr create --base master --title "feat(#42): summary" --body "$(cat <<'EOF'
Fixes #42

## Summary
...
EOF
)"
```

# Ticket-driven workflow

- Setup: [docs/development/ticket-driven-setup.md](./docs/development/ticket-driven-setup.md)
- Skills SSOT: `.rulesync/skills/` (`@skills:start-ticket`, `@skills:address-pr-feedback`, `@skills:close-ticket`, `@skills:spec-lookup`)
- This repo generates Devin-facing outputs only (`rulesync.jsonc`): rules → root `AGENTS.md`, skills → `.agents/skills/`; nothing is exported to `.cursor/` or `.claude/` here
- Invoke with issue or PR number: `@skills:start-ticket 42`, `@skills:close-ticket 42`
- PR status/diff/comments: prefer **`gh`** (see **GitHub CLI — PR and Issues** above)
