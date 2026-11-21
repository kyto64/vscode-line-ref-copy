import { execFileSync } from 'node:child_process';

function collect(node, out) {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out);
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const c of node.Comments ?? []) {
    out.push({ startLine: c.Pos.Line, endLine: c.End?.Line ?? c.Pos.Line, text: `#${c.Text}`, kind: 'comment', apiDoc: false });
  }
  for (const value of Object.values(node)) if (value && typeof value === 'object') collect(value, out);
}

export function extractShellComments(text, shfmt = process.env.COMMENT_CHECK_SHFMT ?? 'shfmt') {
  let json;
  try {
    json = execFileSync(shfmt, ['--to-json'], { input: text, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('shfmt が見つからない（シェルのコメント検査には mvdan/sh の shfmt が要る）');
    throw new Error(`shell parse error: ${String(error.stderr ?? error.message).trim()}`);
  }
  const out = [];
  collect(JSON.parse(json), out);
  const unique = new Map(out.map((c) => [`${c.startLine}:${c.text}`, c]));
  return [...unique.values()].sort((a, b) => a.startLine - b.startLine);
}
