import fs from 'node:fs';
import path from 'node:path';

function isFile(file) {
  try { return fs.statSync(file).isFile(); } catch { return false; }
}

export function resolveShfmt({ env, root }) {
  if (env.COMMENT_CHECK_SHFMT) return env.COMMENT_CHECK_SHFMT;
  const candidates = [path.join(root, '.bin', 'shfmt'), path.join(root, '..', '..', '.bin', 'shfmt')];
  const found = candidates.find(isFile);
  return found ? path.normalize(found) : undefined;
}
