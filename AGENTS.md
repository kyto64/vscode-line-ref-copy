# Additional Conventions Beyond the Built-in Functions

As this project's AI coding tool, you must follow the additional conventions below, in addition to the built-in functions.

<!--
  SSOT: Edit .rulesync/ and run `npm run rules:generate`.
  Generated: AGENTS.md and .agents/skills/ (Devin); CLAUDE.md and .claude/skills/ (Claude Code). See rulesync.jsonc targets.
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
node .github/comment-check/src/cli.mjs --base origin/master # after npm ci --prefix .github/comment-check
```

CI required checks: `build` and `comment-check` (`.github/workflows/ci.yml`), and `check-rulesync` (`.github/workflows/check_rulesync.yaml`).

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

Skills live under `.rulesync/skills/` (SSOT). This repo’s `rulesync.jsonc` generates **Devin-facing outputs** (`agentsmd` rules + `agentsskills` skills) and **Claude Code outputs** (`claudecode` rules + skills → `CLAUDE.md`, `.claude/skills/`); Cursor/Codex outputs are not generated here (differs from [aidd-template-lean](https://github.com/kyto64/aidd-template-lean)).

- `@skills:start-ticket <issue-number>` — start issue, plan, implement, open PR
- `@skills:address-pr-feedback <pr-number>` — address review feedback
- `@skills:close-ticket <issue-number>` — post-merge docs update
- `@skills:spec-lookup` — answer from `docs/` (code when needed)

### Devin

- Project rules: `.rulesync/rules/` (all `root: true`) → `npm run rules:generate` → single root `AGENTS.md`
- Skills: `.rulesync/skills/` → `npm run rules:generate` → `.agents/skills/*/SKILL.md`
- Environment: `.devin/blueprint.yaml` (Node 24, xvfb + VS Code test libraries, `npm ci`, lint/build/test knowledge)

## AI settings changes

Edit `.rulesync/` only, then `npm run rules:generate`. Commit `.rulesync/`, `rulesync.jsonc`, **`AGENTS.md`**, **`.agents/skills/`**, **`CLAUDE.md`**, and **`.claude/`** (see `docs/development/rulesync.md`). Keep `AGENTS.md` under 16 KiB.

## Language

- `README.md` and `docs/`: English
- GitHub Issues and PRs: Japanese
- Code comments: do not add them by default (see the development quality policy below and `.claude/rules/code-quality.md`); when an allowed exception comment is needed, write it in English

See [docs/development/language-policy.md](./docs/development/language-policy.md).

# Coding conventions

## General

- Prefer small, focused changes tied to a single GitHub Issue.
- Match existing patterns in the repository before introducing new ones.
- Document non-obvious behavior in `docs/` when it affects how others work.

## Language

- `README.md` and `docs/`: English (see [docs/development/language-policy.md](./docs/development/language-policy.md)).
- GitHub Issues and PR titles/bodies: Japanese.
- Identifiers: English.
- Code comments: do not add them by default (see `.claude/rules/code-quality.md`); when an allowed exception comment is needed (license notice, public API doc, `INVARIANT:` / `SECURITY:` / `EXTERNAL:` constraint, tool directive), write it in English.

## TypeScript / VS Code extension

- Source lives under `src/`; compiled output under `out/` (do not edit `out/` by hand).
- Use `'use strict'` and existing import style (`import * as vscode from 'vscode'`).
- Register commands in `src/extension.ts`; command implementation in `src/line-ref-copy.ts`.
- Follow Oxlint (`.oxlintrc.json`; keep semicolons off and lines under 120 characters by convention; Oxlint has no matching rules, so these two are not enforced by lint); run `npm run lint` and `npm run compile` before PRs.

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

# 開発品質ポリシー（Claude Code Cloud 共通）

このリポジトリで実装・修正するセッションは、作業の前にこの節と `.claude/rules/` を読んで従う。ルールが自動で読み込まれない環境でも守れるように、重要な禁止事項はここにも書いてある。正は `.rulesync/rules/`（`quality-policy.md`、`code-quality.md`、`root-cause-first.md`）で、`npm run rules:generate` が `CLAUDE.md`・`AGENTS.md`・`.claude/rules/` を生成する。生成物は手で直さない。詳細と例外の書き方は次の2つにある。

- `.claude/rules/code-quality.md`：コメント規約、テスト、静的解析
- `.claude/rules/root-cause-first.md`：根本原因の特定と修正、エスカレーション

ルールとスキルの内容がぶつかったときは、このリポジトリのルールを優先する。

## 必ず守ること

1. **コメントを足さない。** 何をしているかの説明、処理手順の言い換え、変更履歴、修正理由の言い訳、TODO だけの先送り、ワークアラウンドの正当化は書かない。意図が読みにくければ、命名・関数抽出・責務分離・型・データ構造・制御フローを直す。例外（ライセンス表記、公開 API のドキュメント、`INVARIANT:` / `SECURITY:` / `EXTERNAL:` を付けた制約コメント、ツール向けの指示）だけ許す。例外のコメントを書くときは英語で書く。既存のコメントを一律に消さない。
2. **症状ではなく原因を直す。** 特殊分岐の追加、例外の握りつぶし、過剰なガード、根拠のないリトライや待ち時間、呼び出し側ごとの補正で症状を隠さない。原因がある層を直す。原因が局所的なら局所修正でよく、無関係なコードは書き換えない。
3. **テストで正しさを示す。** バグ修正では、修正前に失敗する回帰テストを先に書く（Red → Green → Refactor）。新機能では正常系に加えて重要な境界と異常系を確かめる。
4. **検査を弱めない。** 期待値を緩める、テストを消す・skip する、lint や型検査を無効化する、閾値を下げる、CI のジョブを外す、のどれもしない。
5. **実行した結果を隠さない。** テスト、静的解析、コメント検査を実行し、コマンド・結果・未実行の理由を PR に書く。走らなかったものを「通った」と書かない。
6. **一時回避が避けられないときは止まる。** 外部の制約で恒久修正ができないなら、黙って回避策を入れず、stopped コメントで理由を書いて止まる（担当 bot が kyto にエスカレーションする）。

## 作業の順番

1. **grilling（実装前に必ず）**：`.claude/skills/grilling/` のスキルを使い、質問ツリーをすべて出して推奨回答で自分で埋める。その Q&A を作業 issue に `Claude Code:` で始まるコメントとして残してから実装に入る。推奨回答で決めきれない分かれ道（仕様の変更、破壊的な変更、承認が要る操作など）があれば実装しない。stopped コメントに質問を書いて止まる。
2. **原因の確認**：バグ・テスト失敗・想定外の挙動では `.claude/skills/systematic-debugging/` に従い、現象・再現条件・根本原因の仮説と検証結果・影響範囲を整理する。
3. **テストを先に**：実装は `.claude/skills/test-driven-development/` に従う。
4. **検証**：このリポジトリの CI と同じテスト・静的解析・コメント検査を実行する。テストは `xvfb-run -a npm test`、静的解析は `npm run compile`（tsc）と `npm run lint`（oxlint）、コメント検査は `node .github/comment-check/src/cli.mjs --base origin/master`（詳細は `.claude/rules/code-quality.md` の「このリポジトリのコマンド」）。

スキル本文にある `superpowers:test-driven-development` は、このリポジトリの `.claude/skills/test-driven-development/` のこと。`superpowers:verification-before-completion` と `superpowers:writing-skills` は入れていないので、代わりに `.claude/rules/root-cause-first.md` の「完了前の検証」に従う。

## 実装報告フォーマット

PR 本文（先頭は `Claude Code:`）に、次をそのまま埋めて書く。

```markdown
## 実装報告
- 対象リポジトリ／PR：
- 問題と根本原因：
- 原因検証の根拠：
- 修正した設計・実装：
- 影響範囲と互換性：
- 追加・更新テスト：
- テスト・静的解析・コメント検査結果：
- コメント例外（なければ「なし」）：
- 未解決事項・制約（なければ「なし」）：
```

grilling の Q&A を残した issue コメントの URL も、PR 本文に書く。

# Ticket-driven workflow

- Setup: [docs/development/ticket-driven-setup.md](./docs/development/ticket-driven-setup.md)
- Skills SSOT: `.rulesync/skills/` (`@skills:start-ticket`, `@skills:address-pr-feedback`, `@skills:close-ticket`, `@skills:spec-lookup`)
- This repo generates Devin-facing outputs (`rulesync.jsonc`): rules → root `AGENTS.md`, skills → `.agents/skills/`; and Claude Code outputs: rules → `CLAUDE.md`, skills → `.claude/skills/`; nothing is exported to `.cursor/` or `.codex/` here
- Invoke with issue or PR number: `@skills:start-ticket 42`, `@skills:close-ticket 42`
- PR status/diff/comments: prefer **`gh`** (see **GitHub CLI — PR and Issues** above)
