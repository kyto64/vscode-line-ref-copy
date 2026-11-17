import { parse } from 'parse5';
import { extractScriptComments } from './script.mjs';
import { extractStyleComments } from './css.mjs';
import { UnsupportedLanguageError } from './unsupported.mjs';

const JS_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript', 'text/ecmascript', 'application/ecmascript']);
const JSON_TYPES = new Set(['application/json', 'application/ld+json', 'importmap', 'speculationrules']);
const CSS_TYPES = new Set(['', 'text/css']);

function attr(node, name) {
  return (node.attrs?.find((a) => a.name === name)?.value ?? '').trim().toLowerCase();
}

function embedded(node, body, offset) {
  if (node.nodeName === 'style') {
    const type = attr(node, 'type');
    if (!CSS_TYPES.has(type)) throw new UnsupportedLanguageError(`<style type="${type}">`);
    return extractStyleComments(body, 'css', offset);
  }
  const type = attr(node, 'type');
  if (JS_TYPES.has(type)) return extractScriptComments(body, '.js', offset);
  if (JSON_TYPES.has(type)) return extractScriptComments(body, '.json', offset);
  throw new UnsupportedLanguageError(`<script type="${type}">`);
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
        comments.push(...embedded(node, body, offset + baseOffset));
      }
    }
    for (const child of node.childNodes ?? []) visit(child);
    if (node.content) visit(node.content);
  };
  visit(document);
  return comments.sort((a, b) => a.start - b.start);
}
