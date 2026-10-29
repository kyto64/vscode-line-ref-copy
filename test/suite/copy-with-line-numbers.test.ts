import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import { EOL } from 'os'
import {
  COMMAND_WITH_FILE_NAME,
  COMMAND_WITH_FULL_PATH,
  COMMAND_WITH_RELATIVE_PATH,
  COMMAND_WITHOUT_PATH,
  fixturePath,
  formatLines,
  openDocument,
  openUntitled,
  readClipboard,
  runCopyCommand,
  setSelection,
  setSelections,
  withFileHeader,
} from './test-utils'

suite('lineRefCopy', () => {
  suiteTeardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
  })

  test('withoutPath copies numbered lines for a single-line selection', async () => {
    const filePath = fixturePath('single-root', 'sample.txt')
    const editor = await openDocument(filePath)
    setSelection(editor, 0, 0, 0, 5)

    await runCopyCommand(COMMAND_WITHOUT_PATH, editor)
    const clipboard = await readClipboard()

    assert.strictEqual(clipboard, formatLines([1], ['alpha']))
  })

  test('withoutPath copies multiple lines with zero-padded line numbers', async () => {
    const filePath = fixturePath('single-root', 'sample.txt')
    const editor = await openDocument(filePath)
    setSelection(editor, 0, 0, 2, 5)

    await runCopyCommand(COMMAND_WITHOUT_PATH, editor)
    const clipboard = await readClipboard()

    assert.strictEqual(
      clipboard,
      formatLines([1, 2, 3], ['alpha', 'beta', 'gamma'], 1),
    )
  })

  test('whole-line selection ending at column 0 excludes the next line', async () => {
    const editor = await openDocument(fixturePath('single-root', 'sample.txt'))
    setSelection(editor, 0, 0, 2, 0)

    await runCopyCommand(COMMAND_WITHOUT_PATH, editor)

    assert.strictEqual(await readClipboard(), formatLines([1, 2], ['alpha', 'beta'], 1))
  })

  test('multiple selections trim each whole-line range', async () => {
    const editor = await openDocument(fixturePath('single-root', 'sample.txt'))
    setSelections(editor, [new vscode.Selection(0, 0, 1, 0), new vscode.Selection(2, 0, 2, 5)])

    await runCopyCommand(COMMAND_WITHOUT_PATH, editor)

    assert.strictEqual(
      await readClipboard(),
      `${formatLines([1], ['alpha'], 1)}---${EOL}${formatLines([3], ['gamma'], 1)}`,
    )
  })

  test('padding width ignores the unselected line after a whole-line selection', async () => {
    const editor = await openDocument(fixturePath('single-root', 'ten-lines.txt'))
    setSelection(editor, 0, 0, 9, 0)

    await runCopyCommand(COMMAND_WITHOUT_PATH, editor)

    const lines = Array.from({ length: 9 }, (_, i) => `line${i + 1}`)
    assert.strictEqual(await readClipboard(), formatLines([1, 2, 3, 4, 5, 6, 7, 8, 9], lines, 1))
  })

  test('withFullPath includes absolute file path header', async () => {
    const filePath = fixturePath('single-root', 'sample.txt')
    const editor = await openDocument(filePath)
    setSelection(editor, 1, 0, 1, 4)

    await runCopyCommand(COMMAND_WITH_FULL_PATH, editor)
    const clipboard = await readClipboard()

    const body = formatLines([2], ['beta'], 1)
    assert.strictEqual(clipboard, withFileHeader(filePath, body))
  })

  test('withRelativePath includes workspace-relative path header', async () => {
    const filePath = fixturePath('single-root', 'sample.txt')
    const editor = await openDocument(filePath)
    setSelection(editor, 0, 0, 0, 5)

    await runCopyCommand(COMMAND_WITH_RELATIVE_PATH, editor)
    const clipboard = await readClipboard()

    const body = formatLines([1], ['alpha'], 1)
    assert.strictEqual(clipboard, withFileHeader('sample.txt', body))
  })

  test('withFileName includes basename header', async () => {
    const filePath = fixturePath('single-root', 'sample.txt')
    const editor = await openDocument(filePath)
    setSelection(editor, 0, 0, 0, 5)

    await runCopyCommand(COMMAND_WITH_FILE_NAME, editor)
    const clipboard = await readClipboard()

    const body = formatLines([1], ['alpha'], 1)
    assert.strictEqual(clipboard, withFileHeader('sample.txt', body))
  })

  test('multi-selection inserts separator between ranges', async () => {
    const filePath = fixturePath('single-root', 'sample.txt')
    const editor = await openDocument(filePath)
    setSelections(editor, [
      new vscode.Selection(0, 0, 0, 5),
      new vscode.Selection(2, 0, 2, 5),
    ])

    await runCopyCommand(COMMAND_WITHOUT_PATH, editor)
    const clipboard = await readClipboard()

    const expected =
      formatLines([1], ['alpha'], 1) +
      `---${EOL}` +
      formatLines([3], ['gamma'], 1)
    assert.strictEqual(clipboard, expected)
  })

  test('empty (collapsed) selection copies the current line', async () => {
    const filePath = fixturePath('single-root', 'sample.txt')
    const editor = await openDocument(filePath)
    setSelection(editor, 1, 2, 1, 2)

    await runCopyCommand(COMMAND_WITHOUT_PATH, editor)
    const clipboard = await readClipboard()

    assert.strictEqual(clipboard, formatLines([2], ['beta'], 1))
  })

  test('untitled document copies line numbers without file header', async () => {
    const editor = await openUntitled('only line')
    setSelection(editor, 0, 0, 0, 9)

    await runCopyCommand(COMMAND_WITHOUT_PATH, editor)
    const withoutPath = await readClipboard()
    assert.strictEqual(withoutPath, formatLines([1], ['only line'], 1))

    await runCopyCommand(COMMAND_WITH_FILE_NAME, editor)
    const withName = await readClipboard()
    const untitledBasename = path.basename(editor.document.fileName)
    assert.ok(untitledBasename.length > 0)
    assert.strictEqual(
      withName,
      withFileHeader(untitledBasename, formatLines([1], ['only line'], 1)),
    )
  })

  test('file outside workspace uses full path for relative-path command', async () => {
    const filePath = fixturePath('outside', 'outside.txt')
    const editor = await openDocument(filePath)
    setSelection(editor, 0, 0, 0, 16)

    await runCopyCommand(COMMAND_WITH_RELATIVE_PATH, editor)
    const clipboard = await readClipboard()

    const body = formatLines([1], ['outside line one'], 1)
    assert.strictEqual(clipboard, withFileHeader(filePath, body))
  })

  test('clipboard includes line numbers and content (issue #3 regression)', async () => {
    const filePath = fixturePath('single-root', 'sample.txt')
    const editor = await openDocument(filePath)
    setSelection(editor, 0, 0, 1, 4)

    await runCopyCommand(COMMAND_WITH_FILE_NAME, editor)
    const clipboard = await readClipboard()

    assert.match(clipboard, /^File: sample\.txt/)
    assert.match(clipboard, /1: alpha/)
    assert.match(clipboard, /2: beta/)
    assert.notStrictEqual(clipboard.trim(), 'alpha\nbeta')
  })

  suite('UTF-8 and CRLF (issue #4)', () => {
    test('copies Japanese, Korean, and emoji without corruption', async () => {
      const filePath = fixturePath('single-root', 'utf8-sample.txt')
      const editor = await openDocument(filePath)
      setSelection(editor, 0, 0, 3, editor.document.lineAt(3).text.length)

      await runCopyCommand(COMMAND_WITHOUT_PATH, editor)
      const clipboard = await readClipboard()

      const expected = formatLines(
        [1, 2, 3, 4],
        ['日本語の行', '한국어 주석', 'emoji 🎉✨', 'mixed 日本語 and 한국어 🚀'],
        1,
      )
      assert.strictEqual(clipboard, expected)
    })

    test('copies CRLF file line text with platform EOL in output', async () => {
      const filePath = fixturePath('crlf-sample.txt')
      const editor = await openDocument(filePath)
      assert.strictEqual(editor.document.eol, vscode.EndOfLine.CRLF)
      setSelection(editor, 0, 0, 1, 8)

      await runCopyCommand(COMMAND_WITHOUT_PATH, editor)
      const clipboard = await readClipboard()

      assert.strictEqual(clipboard, formatLines([1, 2], ['line one', 'line two'], 1))
      const copiedLineTexts = clipboard.split(EOL).filter((line) => line.length > 0)
      copiedLineTexts.forEach((line) => {
        assert.ok(!line.includes('\r'), 'line text should not retain source CR characters')
      })
    })
  })
})
