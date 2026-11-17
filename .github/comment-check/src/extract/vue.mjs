import { parse } from '@vue/compiler-sfc';
import { extractScriptComments } from './script.mjs';
import { extractCssComments } from './css.mjs';

const COMMENT_NODE = 3;
const ELEMENT_NODE = 1;

function templateComments(node, text, out) {
  if (node.type === COMMENT_NODE) {
    const { start, end } = node.loc;
    out.push({ start: start.offset, end: end.offset, text: text.slice(start.offset, end.offset), kind: 'comment', apiDoc: false });
  }
  for (const child of node.children ?? []) templateComments(child, text, out);
  if (node.type === ELEMENT_NODE && node.branches) for (const b of node.branches) templateComments(b, text, out);
}

export function extractVueComments(text) {
  const { descriptor, errors } = parse(text, { comments: true, sourceMap: false });
  if (errors.length > 0) throw new Error(`Vue SFC parse error: ${errors[0].message ?? errors[0]}`);
  const comments = [];
  for (const block of [descriptor.script, descriptor.scriptSetup]) {
    if (!block) continue;
    const ext = block.lang ? `.${block.lang}` : '.js';
    comments.push(...extractScriptComments(block.content, ext, block.loc.start.offset));
  }
  for (const style of descriptor.styles) comments.push(...extractCssComments(style.content, style.loc.start.offset));
  if (descriptor.template?.ast) templateComments(descriptor.template.ast, text, comments);
  const outsideBlocks = /<!--[\s\S]*?-->/g;
  const blockRanges = [descriptor.template, descriptor.script, descriptor.scriptSetup, ...descriptor.styles, ...descriptor.customBlocks]
    .filter(Boolean).map((b) => [b.loc.start.offset, b.loc.end.offset]);
  for (const match of text.matchAll(outsideBlocks)) {
    if (blockRanges.some(([s, e]) => match.index >= s && match.index < e)) continue;
    comments.push({ start: match.index, end: match.index + match[0].length, text: match[0], kind: 'comment', apiDoc: false });
  }
  return comments.sort((a, b) => a.start - b.start);
}
