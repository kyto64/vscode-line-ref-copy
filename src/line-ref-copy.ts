'use strict'

import * as vscode from 'vscode'
import * as path from 'path'
import { EOL } from 'os'

const LINE_REF_COPY = 'lineRefCopy'
const LINE_REF_COPY_WITHOUT_PATH = `${LINE_REF_COPY}.withoutPath`
const LINE_REF_COPY_WITH_FULL_PATH = `${LINE_REF_COPY}.withFullPath`
const LINE_REF_COPY_WITH_RELATIVE_PATH = `${LINE_REF_COPY}.withRelativePath`
const LINE_REF_COPY_WITH_FILE_NAME = `${LINE_REF_COPY}.withFileName`

const OPTION_WITH_FULL_PATH = 'withFullPath'
const OPTION_WITH_RELATIVE_PATH = 'withRelativePath'
const OPTION_WITH_FILE_NAME = 'withFileName'

const MULTI_SELECTION_SEPARATOR = '---'

// A full-line selection ends at column 0 of the next line; that line is not actually selected.
function effectiveEndLine(selection: vscode.Selection): number {
  const { start, end } = selection
  return !selection.isEmpty && end.line > start.line && end.character === 0 ? end.line - 1 : end.line
}

async function copyLineRef(option?: string) {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    vscode.window.showInformationMessage('No editor is active')
    return
  }

  const document = editor.document
  const fullPath = document.fileName
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
  const relativePath = workspaceFolder
    ? path.relative(workspaceFolder.uri.fsPath, fullPath)
    : fullPath
  const fileName = path.basename(fullPath)

  let file = ''
  switch (option) {
    case OPTION_WITH_FULL_PATH:
      file = fullPath
      break
    case OPTION_WITH_RELATIVE_PATH:
      file = relativePath
      break
    case OPTION_WITH_FILE_NAME:
      file = fileName
      break
    default:
      break
  }

  let str = file ? `File: ${file}${EOL}` : ''

  const selections = [...editor.selections].sort((a, b) => a.start.line - b.start.line)
  const lastSelection = selections[selections.length - 1]
  const largestLineNumber = effectiveEndLine(lastSelection) + 1
  const largestLineNumberLength = largestLineNumber.toString().length

  selections.forEach((selection, i) => {
    if (i > 0) str += `${MULTI_SELECTION_SEPARATOR}${EOL}`

    for (let n = selection.start.line; n <= effectiveEndLine(selection); n += 1) {
      const number = String(n + 1).padStart(largestLineNumberLength, '0')
      const line = document.lineAt(n).text

      str += `${number}: ${line}${EOL}`
    }
  })

  // Clipboard API replacement inspired by mrVanDalo (MIT):
  // https://github.com/mrVanDalo/vscode-copy-with-line-numbers/commit/ed98faa429a2be20bc74f206e8fdb9e8e5e91608
  try {
    await vscode.env.clipboard.writeText(str)
    const showSuccessMessage = vscode.workspace.getConfiguration('lineRefCopy').get('showSuccessMessage')
    if (showSuccessMessage) {
      vscode.window.showInformationMessage('Copied!')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    vscode.window.showErrorMessage(`Failed to copy to clipboard: ${message}`)
  }
}

export const commands: Record<string, () => Promise<void>> = {
  [LINE_REF_COPY_WITHOUT_PATH]: () => copyLineRef(),
  [LINE_REF_COPY_WITH_FULL_PATH]: () => copyLineRef(OPTION_WITH_FULL_PATH),
  [LINE_REF_COPY_WITH_RELATIVE_PATH]: () => copyLineRef(OPTION_WITH_RELATIVE_PATH),
  [LINE_REF_COPY_WITH_FILE_NAME]: () => copyLineRef(OPTION_WITH_FILE_NAME),
}
