import { execFileSync } from 'node:child_process';

export function git(cwd, args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    if (allowFailure) return null;
    throw error;
  }
}

export function changedFiles(cwd, base, head) {
  const out = git(cwd, ['diff', '--name-status', '-M', '-z', `${base}...${head}`]);
  const parts = out.split('\0').filter(Boolean);
  const files = [];
  for (let i = 0; i < parts.length; ) {
    const status = parts[i];
    if (status.startsWith('R') || status.startsWith('C')) {
      files.push({ status: status[0], oldPath: parts[i + 1], path: parts[i + 2] });
      i += 3;
    } else {
      files.push({ status: status[0], oldPath: parts[i + 1], path: parts[i + 1] });
      i += 2;
    }
  }
  return files.filter((f) => f.status !== 'D');
}

export function addedLines(cwd, base, head, file) {
  const out = git(cwd, ['diff', '-U0', '--no-color', '-M', `${base}...${head}`, '--', ...(file.oldPath !== file.path ? [file.oldPath] : []), file.path]);
  const lines = new Set();
  for (const match of out.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    for (let n = start; n < start + count; n += 1) lines.add(n);
  }
  return lines;
}

export function fileAt(cwd, ref, path) {
  return git(cwd, ['show', `${ref}:${path}`], { allowFailure: true });
}
