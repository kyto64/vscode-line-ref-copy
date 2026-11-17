# Ticket-driven development setup

Setup guide for Devin (and humans working alongside it).

## Prerequisites

| Tool | Required |
|------|----------|
| Git | Yes |
| GitHub CLI (`gh`) v2.82.1+ | Yes |
| rulesync 33.0.0 | Yes (`npm run rules:generate` uses `npx rulesync@33.0.0`) |
| Node.js 24+ | Yes (matches CI; for rulesync locally) |

## 1. Repository

This repo adopted [aidd-template-lean](https://github.com/kyto64/aidd-template-lean) for AI settings and `docs/` SSOT. Clone:

`git clone https://github.com/kyto64/vscode-line-ref-copy.git`

## 2. Configure GitHub labels

Template copy does **not** include labels. Create at least:

```bash
gh label create in-progress --color FFAA00 --description "Work in progress"
gh label create blocked --color CC0000 --description "Blocked"  # optional
```

## 3. Enable GitHub Actions

New repositories may have Actions disabled. Enable in repository Settings → Actions.

## 4. Personal MCP (optional)

Project MCP SSOT is `.rulesync/mcp.json` (empty). MCP outputs are **not** generated in this repo (`rulesync.jsonc` targets: `agentsmd`, `agentsskills`, and `claudecode` for rules + skills only). Personal MCP servers stay in user settings.

## 5. rulesync

Edit `.rulesync/` only, then:

```bash
npm run rules:generate
git add .rulesync/ rulesync.jsonc AGENTS.md .agents/
git commit -m "chore: update AI tool SSOT"
```

CI runs `npm run rules:generate` (rulesync + Devin frontmatter adapter) and checks **`AGENTS.md`** and **`.agents/`** on every PR (see [rulesync.md](./rulesync.md)).

## 6. Verify skills

| Skill | Usage |
|-------|--------|
| `@skills:start-ticket 1` | Start issue #1 |
| `@skills:address-pr-feedback 1` | Address PR #1 reviews |
| `@skills:close-ticket 1` | Post-merge docs for issue #1 |
| `@skills:spec-lookup` | Query docs |

Skills live in `.rulesync/skills/` (SSOT) and are generated to `.agents/skills/`; regenerate with `npm run rules:generate` after SSOT edits.

## 7. Worktree rule

Implementation branches must use git worktree, including Devin sessions and docs/config changes without an issue (see **Git worktree workflow** in [`AGENTS.md`](../../AGENTS.md)). Do not branch on the main repository working tree.

**Branch naming exception only:** Devin session branches named `devin/<unix-timestamp>-<description>` are allowed without the `feature/<issue>` pattern. Replace Devin's generic `git checkout -b` command with `git worktree add -b` using that name, then work inside the linked worktree; this is not an exemption from the worktree requirement.

## 8. Language

See [language-policy.md](./language-policy.md): `docs/` and README in English; Issues and PRs in Japanese.

## PR and issue linking

- PR body must include `Fixes #<issue>` to auto-close on merge to **`master`**.
- `@skills:close-ticket` updates docs after merge; it does not replace the merge keyword.
