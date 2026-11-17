export function extractCssComments(text, baseOffset = 0) {
  const comments = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      i += 1;
      while (i < text.length && text[i] !== ch && text[i] !== '\n') {
        i += text[i] === '\\' ? 2 : 1;
      }
      i += 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      const end = close === -1 ? text.length : close + 2;
      comments.push({ start: i + baseOffset, end: end + baseOffset, text: text.slice(i, end), kind: 'comment', apiDoc: false });
      i = end;
      continue;
    }
    i += 1;
  }
  return comments;
}
