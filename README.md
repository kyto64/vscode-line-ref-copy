# Line Ref Copy

Copy selected lines with line numbers and optional file path—ready to paste into issues, reviews, and chat.

![Line Ref Copy demo](images/demo.gif)

*Demo: select lines, right-click **Line Ref Copy: With Relative Path**, then paste—clipboard includes `File: …` and numbered lines.*

> **Credit:** This extension is a fork of [yassh/vscode-copy-with-line-numbers](https://github.com/yassh/vscode-copy-with-line-numbers) (MIT). Thank you to the original author **yassh**.

## Changes in this fork (kyto64)

- Renamed to **Line Ref Copy** (`line-ref-copy`, publisher `kyto64`) for separate Marketplace identity.
- Command IDs `lineRefCopy.*` and setting `lineRefCopy.showSuccessMessage`.
- Clipboard via `vscode.env.clipboard` (multi-byte text and remote-friendly).
- Editor context menu: **With Relative Path** when text is selected.
- Multi-root–aware relative paths (`getWorkspaceFolder`).
- Oxlint, GitHub Actions CI, rulesync-based contributor docs, and `@vscode/test-electron` integration tests.

## Commands

Run from the **Command Palette** (all variants). **With Relative Path** is also on the editor context menu when text is selected (right-click).

| Command | Path in clipboard |
|---------|-------------------|
| Line Ref Copy: Without Path | (none) |
| Line Ref Copy: With Full Path | Absolute file path |
| Line Ref Copy: With Relative Path | Workspace-relative path |
| Line Ref Copy: With File Name | Basename only |

## Configuration

| Property | Description | Type | Default |
|----------|-------------|------|---------|
| `lineRefCopy.showSuccessMessage` | Show an information message after copy | Boolean | `true` |

## Development

Specifications and contributor workflow live under [`docs/`](./docs/) (SSOT). AI settings SSOT is [`.rulesync/`](./.rulesync/); **`AGENTS.md`** and **`.agents/skills/`** are committed for Devin (regenerate after SSOT edits — see [docs/development/rulesync.md](./docs/development/rulesync.md)).

```bash
npm ci
npm run compile
npm run lint
xvfb-run -a npm test   # Linux headless
npm run vsce:package   # build .vsix (requires compile)
```

## Icon

Source artwork: `images/icon.svg` (copy of `images/bg-dark.svg`; variants: `bg-light`, `transparent-dark`, `transparent-light`, each with 128/256 PNG renders). Marketplace asset: `images/icon.png` (256×256). To re-render after editing the SVG: `npx -p sharp node -e "require('sharp')('images/icon.svg').resize(256,256).png().toFile('images/icon.png')"`

## License

MIT — see [LICENSE](./LICENSE) (Copyright yassh; Copyright kyto64).
