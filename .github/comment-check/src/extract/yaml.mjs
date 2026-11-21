import { Lexer } from 'yaml';

const ZERO_WIDTH_MARKERS = new Set(['\x02', '\x18', '\x1f']);

export function extractYamlComments(text) {
  const comments = [];
  let offset = 0;
  for (const token of new Lexer().lex(text)) {
    if (ZERO_WIDTH_MARKERS.has(token)) continue;
    if (token.startsWith('#')) {
      comments.push({ start: offset, end: offset + token.length, text: token, kind: 'comment', apiDoc: false });
    }
    offset += token.length;
  }
  return comments;
}
