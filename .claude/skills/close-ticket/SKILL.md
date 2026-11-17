---
name: close-ticket
description: >
  After PR merge: verify issue state, update docs, add closing comment if
  needed.

  Does not force-close if PR is not merged yet.
disable-model-invocation: true
---
# Close ticket workflow

Issue number: **$ARGUMENTS**

## Step 1: Verify

1. `gh issue view $ARGUMENTS` — check state (open/closed)
2. Find merged PR with `Fixes #$ARGUMENTS` via `gh pr list --state merged --search "$ARGUMENTS"`
3. If no merged PR and issue still open → **stop** and tell user to merge first.

## Step 2: Docs

1. Update `docs/` if the issue required documentation changes not yet done.
2. Update `docs/_inventory.md` when SSOT boundaries change.

## Step 3: Issue comment

1. If issue is **closed** (via merge): add a short comment summarizing what shipped and doc paths updated.
2. If issue is still open after merge (missing `Fixes #` keyword): ask user to close manually or fix PR template for next time.

## Step 4: Cleanup (optional)

Remind user to remove worktree per **Git worktree workflow** in `AGENTS.md` when done.
