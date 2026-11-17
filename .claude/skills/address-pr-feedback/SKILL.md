---
name: address-pr-feedback
description: >
  Address review comments on a pull request: triage, implement fixes, push,
  reply on threads.
disable-model-invocation: true
---
# Address PR feedback

PR number: **$ARGUMENTS**

## Step 1: Gather feedback

1. `gh pr view $ARGUMENTS`
2. `gh pr diff $ARGUMENTS`
3. `gh api "/repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/pulls/$ARGUMENTS/comments"`
4. Review threads and checklist items from CI if any.

## Step 2: Triage

Classify each comment: must-fix / question / nit / out-of-scope. Confirm with user when unclear.

## Step 3: Fix

1. Work in the PR branch worktree (same rules as `start-ticket`).
2. Implement fixes; run quality gates when available.
3. Commit with explicit staging; push.

## Step 4: Respond

1. Reply on review threads or add PR comment summarizing changes.
2. Re-request review if appropriate.
