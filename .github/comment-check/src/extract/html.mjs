import { parse } from 'parse5';
import { extractScriptComments } from './script.mjs';
import { extractCssComments } from './css.mjs';

const SCRIPT_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript']);

function attr(node, name) {
  return node.attrs?.find((a) => a.name === name)?.value;
}

export function extractHtmlComments(text, baseOffset = 0) {
  const document = parse(text, { sourceCodeLocationInfo: true });
  const comments = [];
  const visit = (node) => {
    if (node.nodeName === '#comment' && node.sourceCodeLocation) {
      const { startOffset, endOffset } = node.sourceCodeLocation;
      comments.push({ start: startOffset + baseOffset, end: endOffset + baseOffset, text: text.slice(startOffset, endOffset), kind: 'comment', apiDoc: false });
    }
    if ((node.nodeName === 'script' || node.nodeName === 'style') && node.sourceCodeLocation?.startTag) {
      const inner = node.childNodes?.[0];
      if (inner?.nodeName === '#text' && inner.sourceCodeLocation) {
        const offset = inner.sourceCodeLocation.startOffset;
        const body = text.slice(offset, inner.sourceCodeLocation.endOffset);
        if (node.nodeName === 'style') comments.push(...extractCssComments(body, offset + baseOffset));
        else if (SCRIPT_TYPES.has((attr(node, 'type') ?? '').toLowerCase())) comments.push(...extractScriptComments(body, '.js', offset + baseOffset));
      }
    }
    for (const child of node.childNodes ?? []) visit(child);
    if (node.content) visit(node.content);
  };
  visit(document);
  return comments.sort((a, b) => a.start - b.start);
}
