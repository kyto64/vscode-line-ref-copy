# Architecture overview

VS Code extension with a thin activation layer and a single command module.

## Components

```
package.json (manifest, contributes.commands / menus / configuration)
        │
        ▼
src/extension.ts          activate() → registerCommand for each entry in commands map
        │
        ▼
src/line-ref-copy.ts
        ├── read active TextEditor + Document
        ├── build clipboard string (path header + numbered lines)
        └── vscode.env.clipboard.writeText(str)
```

## Activation

- `main`: `./out/src/extension` (compiled from `src/extension.ts`).
- Commands are registered in `activate()` (`src/extension.ts`). The manifest lists `contributes.commands` and `contributes.menus` (`editor/context`; no explicit `activationEvents`; VS Code uses implicit `onCommand` activation for contributed commands).

## Copy pipeline

1. **Guard**: If no active editor, show `No editor is active` and return.
2. **Path header** (optional): Based on command variant, set `file` from `document.fileName`, path relative to the workspace folder that contains the document (`getWorkspaceFolder`), or basename; prefix `File: ${file}${EOL}` when non-empty. Files outside any workspace folder use the full path for the relative-path variant.
3. **Selections**: Sort `editor.selections` by start line; for each range, emit lines from `start.line` through `end.line`.
4. **Numbering**: Sort selections by `start.line`, take the last selection’s `end.line + 1` as the width reference, then zero-pad each line number with `String.prototype.padStart`.
5. **Clipboard**: `await vscode.env.clipboard.writeText(str)`; on success optionally show `Copied!` per `lineRefCopy.showSuccessMessage`; on failure show error with message.

## External dependencies

| Dependency | Role |
|------------|------|
| `@types/vscode` (~1.74.0) | VS Code extension API types |
| `@vscode/test-electron` | CI/local integration test host (`test/runTest.ts`) |
| `typescript` | Compile to `out/` |
| `oxlint` | Static analysis (`.oxlintrc.json`) |
| `@vscode/vsce` | Local VSIX packaging (`npm run vsce:package`) |

There are **no runtime npm dependencies** (line numbers use `String.prototype.padStart`). Clipboard I/O goes through `vscode.env.clipboard` (see comment in source citing mrVanDalo's MIT-licensed approach).

## Data flow

User runs command → extension handler → string built in memory → clipboard → optional UI toast.

No network, no persistent storage, no webviews.
