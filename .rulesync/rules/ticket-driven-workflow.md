---
root: true
targets:
  - '*'
description: "Ticket-driven workflow"
globs:
  - '**/*'
---
# Ticket-driven workflow

- Setup: [docs/development/ticket-driven-setup.md](./docs/development/ticket-driven-setup.md)
- Skills SSOT: `.rulesync/skills/` (`@skills:start-ticket`, `@skills:address-pr-feedback`, `@skills:close-ticket`, `@skills:spec-lookup`)
- This repo generates Devin-facing outputs (`rulesync.jsonc`): rules → root `AGENTS.md`, skills → `.agents/skills/`; and Claude Code outputs: rules → `CLAUDE.md`, skills → `.claude/skills/`; nothing is exported to `.cursor/` or `.codex/` here
- Invoke with issue or PR number: `@skills:start-ticket 42`, `@skills:close-ticket 42`
- PR status/diff/comments: prefer **`gh`** (see **GitHub CLI — PR and Issues** above)
