---
root: true
targets:
  - '*'
description: "Coding conventions"
globs:
  - '**/*'
---
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
- Follow Oxlint (`.oxlintrc.json`; keep semicolons off and lines under 120 characters by convention; Oxlint has no matching rules, so these two are not enforced by lint); run `npm run lint` and `npm run compile` before PRs.

## Quality

- Run `npm run compile`, `npm run lint`, and `npm test` when behavior changes (matches CI; on Linux use `xvfb-run -a npm test` if needed).
- Do not commit secrets, tokens, or personal credentials.
