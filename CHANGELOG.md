# Changelog

## 0.1.2 — 2026-10-29

Marketplace and extension icon replaced with the new design (`]=` mark). No behavior changes. Still a preview release.

### Changed

- Updated the Marketplace / extension icon to the new design.

## 0.1.1 — 2026-10-15

Documentation and development tooling update; no extension behavior changes. Still a preview release.

### Changed

- Development tooling migrated from Cursor to Devin, with rulesync updated to 33.0.0 and contributor workflow improvements.

## 0.1.0 — 2026-10-14

First preview release of **Line Ref Copy** (fork of [yassh/vscode-copy-with-line-numbers](https://github.com/yassh/vscode-copy-with-line-numbers)).

### Added

- Marketplace-oriented manifest: publisher `kyto64`, extension id `line-ref-copy`, `preview: true`.
- Command IDs under `lineRefCopy.*` and setting `lineRefCopy.showSuccessMessage`.
- Editor context menu entry for **Line Ref Copy: With Relative Path** when text is selected.
- Integration tests (`@vscode/test-electron`) and VSIX packaging via `@vscode/vsce`.
- Demo GIF in the README showing selection, context-menu copy, and paste with a relative path and line numbers.

### Changed

- Clipboard I/O uses `vscode.env.clipboard` (UTF-8 safe).
- Workspace-relative paths use `getWorkspaceFolder` for multi-root workspaces.

## Upstream history (yassh)

### 0.0.4
- Add license file

### 0.0.3
- Add license

### 0.0.2
- Add description

### 0.0.1
- Initial release
