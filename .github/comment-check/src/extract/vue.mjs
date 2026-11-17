import { parse } from '@vue/compiler-sfc';
import { parseFragment } from 'parse5';
import { extractScriptComments } from './script.mjs';
import { extractStyleComments, styleLanguages } from './css.mjs';
import { UnsupportedLanguageError } from './unsupported.mjs';

const COMMENT_NODE = 3;
const ELEMENT_NODE = 1;
const SCRIPT_LANGS = new Set(['js', 'jsx', 'ts', 'tsx']);

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
  if (descriptor.template?.lang && descriptor.template.lang !== 'html') throw new UnsupportedLanguageError(`Vue <template lang="${descriptor.template.lang}">`);
  if (descriptor.customBlocks.length > 0) throw new UnsupportedLanguageError(`Vue カスタムブロック <${descriptor.customBlocks[0].type}>`);
  const comments = [];
  for (const block of [descriptor.script, descriptor.scriptSetup]) {
    if (!block) continue;
    const lang = block.lang ?? 'js';
    if (!SCRIPT_LANGS.has(lang)) throw new UnsupportedLanguageError(`Vue <script lang="${lang}">`);
    comments.push(...extractScriptComments(block.content, `.${lang}`, block.loc.start.offset));
  }
  for (const style of descriptor.styles) {
    const lang = style.lang ?? 'css';
    if (!styleLanguages.includes(lang)) throw new UnsupportedLanguageError(`Vue <style lang="${lang}">`);
    comments.push(...extractStyleComments(style.content, lang, style.loc.start.offset));
  }
  if (descriptor.template?.ast) templateComments(descriptor.template.ast, text, comments);
  const blockRanges = [descriptor.template, descriptor.script, descriptor.scriptSetup, ...descriptor.styles]
    .filter(Boolean).map((b) => [b.loc.start.offset, b.loc.end.offset]);
  for (const node of parseFragment(text, { sourceCodeLocationInfo: true }).childNodes) {
    if (node.nodeName !== '#comment' || !node.sourceCodeLocation) continue;
    const { startOffset, endOffset } = node.sourceCodeLocation;
    if (blockRanges.some(([s, e]) => startOffset >= s && startOffset < e)) continue;
    comments.push({ start: startOffset, end: endOffset, text: text.slice(startOffset, endOffset), kind: 'comment', apiDoc: false });
  }
  return comments.sort((a, b) => a.start - b.start);
}
