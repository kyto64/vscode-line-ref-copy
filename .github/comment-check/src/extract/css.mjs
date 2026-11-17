import postcss from 'postcss';
import postcssScss from 'postcss-scss';
import postcssLess from 'postcss-less';
import { UnsupportedLanguageError } from './unsupported.mjs';

const PARSERS = {
  css: (text) => postcss.parse(text),
  scss: (text) => postcssScss.parse(text),
  less: (text) => postcssLess.parse(text),
};

export const styleLanguages = Object.keys(PARSERS);

function commentEnd(text, start) {
  if (text.startsWith('//', start)) {
    const newline = text.indexOf('\n', start);
    return newline === -1 ? text.length : newline;
  }
  const close = text.indexOf('*/', start + 2);
  return close === -1 ? text.length : close + 2;
}

export function extractStyleComments(text, language = 'css', baseOffset = 0) {
  const parse = PARSERS[language];
  if (!parse) throw new UnsupportedLanguageError(language);
  const comments = [];
  parse(text).walkComments((node) => {
    const start = node.source.start.offset;
    const end = commentEnd(text, start);
    comments.push({ start: start + baseOffset, end: end + baseOffset, text: text.slice(start, end), kind: 'comment', apiDoc: false });
  });
  return comments;
}
