# Product overview

**Line Ref Copy** adds editor commands that copy the current selection to the system clipboard with prefixed line numbers, optionally including file path metadata.

Fork of [yassh/vscode-copy-with-line-numbers](https://github.com/yassh/vscode-copy-with-line-numbers) (MIT). Inspired by [Copy With Line Numbers Reloaded](https://packagecontrol.io/packages/CopyWithLineNumbersReloaded) for Sublime Text.

## Goals

- Let developers paste code snippets with stable `N: ` line prefixes for reviews, tickets, and chat.
- Support optional file path context (none, full path, workspace-relative path, or file name only).
- Work in remote and sandboxed VS Code environments using the official Clipboard API.

## Commands

| Command ID | Title | Path in output |
|------------|-------|----------------|
| `lineRefCopy.withoutPath` | Line Ref Copy: Without Path | (none) |
| `lineRefCopy.withFullPath` | Line Ref Copy: With Full Path | Absolute `document.fileName` |
| `lineRefCopy.withRelativePath` | Line Ref Copy: With Relative Path | Relative to the workspace folder that contains the document; otherwise absolute path |
| `lineRefCopy.withFileName` | Line Ref Copy: With File Name | Basename only |

When a path mode is used, the clipboard text starts with `File: <path>` followed by a platform-appropriate newline, then numbered lines.

## Editor context menu

**Line Ref Copy: With Relative Path** (`lineRefCopy.withRelativePath`) appears in the **editor context menu** (right-click) when the editor has focus and a non-empty text selection (`editorTextFocus && editorHasSelection`). It is placed after the built-in Cut / Copy / Copy As / Paste entries (`9_cutcopypaste@5`). The other three commands remain Command Palette–only. Clipboard output is covered by integration tests in `test/suite/copy-with-line-numbers.test.ts`; the menu contribution is asserted in `test/suite/package-manifest.test.ts`.

## Line format

- Each selected line becomes `<padded-line-number>: <line text>`.
- Padding width uses the line number of the **last selection’s effective end line** (selections sorted by `start.line`), not the global max across all ranges. Overlapping multi-cursors can therefore use a narrower width than the longest range alone would need.
- The effective end line is `end.line`, except for a non-empty multi-line selection ending at column 0 (e.g. whole-line selection via the gutter, Shift+↓ or Cmd/Ctrl+L), where the unselected next line is excluded (`end.line - 1`), matching VS Code's built-in copy.
- Pad character is ASCII `0` via `padStart` (e.g. `008: `).
- Multiple selections are separated by a line containing `---`.

## Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `lineRefCopy.showSuccessMessage` | boolean | `true` | Show an information message after a successful copy |

## Marketplace identity

| Field | Value |
|-------|--------|
| Extension id (`name`) | `line-ref-copy` |
| Display name | Line Ref Copy |
| Publisher | `kyto64` |
| Preview | `true` (0.1.0) |

## Out of scope

- Syntax highlighting or rich text in the clipboard.
- Custom delimiter or format templates (fixed `N: ` prefix).
- Non-text editors.

## Glossary

| Term | Definition |
|------|------------|
| Selection | One or more `TextEditor.selections` ranges in the active editor |
| Path mode | Whether and how file path metadata is prepended |
