import ts from 'typescript';

const SCRIPT_KIND = {
  '.ts': ts.ScriptKind.TS, '.mts': ts.ScriptKind.TS, '.cts': ts.ScriptKind.TS,
  '.tsx': ts.ScriptKind.TSX, '.jsx': ts.ScriptKind.JSX,
  '.js': ts.ScriptKind.JS, '.mjs': ts.ScriptKind.JS, '.cjs': ts.ScriptKind.JS,
  '.json': ts.ScriptKind.JSON, '.jsonc': ts.ScriptKind.JSON, '.json5': ts.ScriptKind.JSON,
};

export const scriptExtensions = Object.keys(SCRIPT_KIND);

function scriptKindFor(ext) {
  return SCRIPT_KIND[ext] ?? ts.ScriptKind.TS;
}

function isExported(node) {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return Boolean(modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

function locallyExportedNames(sourceFile) {
  const names = new Set();
  for (const node of sourceFile.statements) {
    if (ts.isExportDeclaration(node) && !node.moduleSpecifier && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) names.add((element.propertyName ?? element.name).text);
    } else if (ts.isExportAssignment(node) && ts.isIdentifier(node.expression)) {
      names.add(node.expression.text);
    }
  }
  return names;
}

function declaredNames(node) {
  if (ts.isVariableStatement(node)) return node.declarationList.declarations.map((d) => d.name).filter(ts.isIdentifier).map((n) => n.text);
  return node.name && ts.isIdentifier(node.name) ? [node.name.text] : [];
}

function exportedDeclarationStarts(sourceFile) {
  const starts = new Set();
  const listed = locallyExportedNames(sourceFile);
  const visit = (node, exportedParent) => {
    const listedLocally = node.parent === sourceFile && declaredNames(node).some((name) => listed.has(name));
    const exported = exportedParent || isExported(node) || ts.isExportAssignment(node) || listedLocally;
    if (exported && (ts.isDeclarationStatement?.(node) || ts.isVariableStatement(node) || ts.isClassElement(node)
      || ts.isTypeElement(node) || ts.isEnumMember(node) || ts.isExportAssignment(node))) {
      starts.add(node.getStart(sourceFile));
    }
    const carry = exported && (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node));
    ts.forEachChild(node, (child) => visit(child, carry));
  };
  ts.forEachChild(sourceFile, (child) => visit(child, sourceFile.isDeclarationFile));
  return starts;
}

export function extractScriptComments(text, ext, baseOffset = 0) {
  const kind = scriptKindFor(ext);
  const sourceFile = kind === ts.ScriptKind.JSON
    ? ts.parseJsonText('x.json', text)
    : ts.createSourceFile('x' + ext, text, ts.ScriptTarget.Latest, true, kind);
  const syntaxErrors = sourceFile.parseDiagnostics ?? [];
  if (syntaxErrors.length > 0) {
    throw new Error(`syntax error: ${ts.flattenDiagnosticMessageText(syntaxErrors[0].messageText, ' ')}`);
  }
  const apiStarts = exportedDeclarationStarts(sourceFile);
  const seen = new Map();
  const jsxTextStarts = new Set();
  const markJsxText = (node) => {
    if (node.kind === ts.SyntaxKind.JsxText) jsxTextStarts.add(node.getFullStart());
    ts.forEachChild(node, markJsxText);
  };
  if (sourceFile.languageVariant === ts.LanguageVariant.JSX) markJsxText(sourceFile);
  const collectAt = (fullStart, nextTokenStart) => {
    if (jsxTextStarts.has(fullStart)) return;
    const ranges = [...(ts.getTrailingCommentRanges(text, fullStart) ?? []), ...(ts.getLeadingCommentRanges(text, fullStart) ?? [])];
    for (const range of ranges) {
      if (seen.has(range.pos)) continue;
      const body = text.slice(range.pos, range.end);
      const isJsDoc = body.startsWith('/**') && !body.startsWith('/**/');
      seen.set(range.pos, {
        start: range.pos + baseOffset,
        end: range.end + baseOffset,
        text: body,
        kind: isJsDoc ? 'jsdoc' : 'comment',
        apiDoc: isJsDoc && apiStarts.has(nextTokenStart),
      });
    }
  };
  const walk = (node) => {
    if (node.kind === ts.SyntaxKind.JsxText) return;
    const children = node.getChildren(sourceFile);
    if (children.length === 0) {
      collectAt(node.getFullStart(), node.getStart(sourceFile));
      return;
    }
    collectAt(node.getFullStart(), node.getStart(sourceFile));
    for (const child of children) walk(child);
  };
  walk(sourceFile);
  return [...seen.values()].sort((a, b) => a.start - b.start);
}
