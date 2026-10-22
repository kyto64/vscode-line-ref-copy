---
name: start-ticket
description: |
  Start a GitHub Issue: fetch details, label in-progress, create worktree from origin/master,
  read docs, plan, implement, run quality gates when available, open PR with Fixes #N.
targets:
  - claudecode
  - agentsskills
disable-model-invocation: true
devin:
  triggers: ["user"]
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - "Bash(git *)"
  - "Bash(cd *)"
  - "Bash(ls *)"
  - "Bash(gh pr *)"
  - "Bash(gh api *)"
  - "Bash(gh issue *)"
---

# Start ticket workflow

Issue number: **$ARGUMENTS**

Execute phases in order. Report completion after each phase.

## Phase 1: Issue and worktree

1. `gh issue view $ARGUMENTS` — read title, body, labels, acceptance criteria
2. Ensure label `in-progress` exists; create if missing (`gh label create in-progress ...`). On permission error, stop.
3. `gh issue edit $ARGUMENTS --add-label in-progress`
4. Resolve main repo root (see **Git worktree workflow** in `AGENTS.md`):
   ```bash
   COMMON=$(git rev-parse --git-common-dir)
   MAIN_ROOT=$(cd "$COMMON/.." && pwd)
   REPO=$(basename "$MAIN_ROOT")
   WORKTREES_ROOT="$(dirname "$MAIN_ROOT")/${REPO}-worktrees"
   ```
5. `git fetch origin`
6. Create or reuse worktree:
   ```bash
   BRANCH="feature/$ARGUMENTS"
   DIR=$(echo "$BRANCH" | tr '/' '-')
   mkdir -p "$WORKTREES_ROOT"
   git worktree add -b "$BRANCH" "${WORKTREES_ROOT}/${DIR}" origin/master 2>/dev/null || cd "${WORKTREES_ROOT}/${DIR}"
   cd "${WORKTREES_ROOT}/${DIR}"
   ```
7. All further edits run in this worktree.

**Report:** issue summary to the user.

## Phase 2: Plan

1. Read relevant `docs/` (`docs/_inventory.md` → area index → detail files). Use `@skills:spec-lookup` for quick lookups.
2. Grep/Glob for affected code paths.
3. Present implementation plan; wait for user approval if scope is unclear.

## Phase 3: Implement

1. Implement per plan and acceptance criteria.
2. Update docs in the same PR when behavior or SSOT changes.

## Phase 4: Quality gates

Run only what exists in the repo:

- This extension: `npm run compile`, `npm run lint` (Oxlint), `npm test` (use `xvfb-run -a npm test` on headless Linux).
- If other scripts exist, run them and report results.

## Phase 5: PR

1. Commit with explicit `git add` (no `git add -A`).
2. Push branch.
3. Open PR to `master` with body containing **`Fixes #$ARGUMENTS`** and template sections filled in.
4. `gh pr create --base master ...`

**Report:** PR URL.
