import fs from 'node:fs';
import path from 'node:path';
import { classifyFile } from './extract/index.mjs';
import { classifyComment, commentBody } from './rules.mjs';
import { addedLines, changedFiles, fileAt, git } from './git.mjs';
import { matchesAny } from './glob.mjs';

export const DEFAULT_CONFIG = {
  exclude: ['node_modules/**', '**/node_modules/**', 'dist/**', 'out/**', 'coverage/**', '**/*.min.js', '**/package-lock.json', '**/pnpm-lock.yaml', '**/yarn.lock', '**/actions.lock', 'skills-lock.json', '.claude/skills/**', '.agents/skills/**', '.rulesync/skills/**'],
  generated: [],
  unsupported: 'fail',
};

export function loadConfig(cwd) {
  const file = path.join(cwd, '.comment-check.json');
  const user = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  return {
    exclude: [...DEFAULT_CONFIG.exclude, ...(user.exclude ?? [])],
    generated: user.generated ?? DEFAULT_CONFIG.generated,
    unsupported: user.unsupported ?? DEFAULT_CONFIG.unsupported,
  };
}

function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}

function lineOf(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

function withLines(comments, text) {
  const starts = lineStarts(text);
  const lines = text.split('\n');
  return comments.map((c) => {
    const startLine = c.startLine ?? lineOf(starts, c.start);
    const endLine = c.endLine ?? lineOf(starts, Math.max(c.start, c.end - 1));
    return { ...c, startLine, endLine, lineText: lines[startLine - 1] ?? '' };
  });
}

function isLineComment(c) {
  return (c.text.startsWith('//') || c.text.startsWith('#')) && !c.text.startsWith('#!');
}

function standsAlone(c) {
  return c.lineText.trim().startsWith(c.text.trim().split('\n')[0]);
}

export function groupLineComments(comments) {
  const groups = [];
  for (const c of comments) {
    const group = groups.at(-1);
    const prev = group?.members.at(-1);
    if (prev && isLineComment(prev) && isLineComment(c) && standsAlone(prev) && standsAlone(c)
      && c.startLine === prev.endLine + 1 && c.text[0] === prev.text[0] && c.kind === prev.kind) {
      group.members.push(c);
    } else {
      groups.push({ members: [c] });
    }
  }
  return groups.flatMap((group, id) => {
    const head = group.members[0];
    const block = { ...head, endLine: group.members.at(-1).endLine, text: group.members.map((m) => m.text).join('\n') };
    return group.members.map((m) => ({ ...m, groupId: id, block }));
  });
}

function looksGenerated(text) {
  return /@generated\b|DO NOT EDIT/i.test(text.split('\n').slice(0, 5).join('\n'));
}

function normalized(comment) {
  return commentBody(comment.text).replace(/\s+/g, ' ');
}

export function extractFileComments(file, text) {
  const kind = classifyFile(file);
  if (kind.status !== 'supported') return { status: kind.status, comments: [] };
  return { status: 'supported', comments: groupLineComments(withLines(kind.extract(text), text)) };
}

export function checkDiff({ cwd, base, head = 'HEAD', config = loadConfig(cwd) }) {
  const result = { violations: [], allowed: [], unsupported: [], unchecked: [], notApplicable: [], skipped: [], errors: [] };
  const baseline = git(cwd, ['merge-base', base, head], { allowFailure: true })?.trim() || base;
  for (const file of changedFiles(cwd, base, head)) {
    if (matchesAny(file.path, config.exclude)) { result.skipped.push({ path: file.path, reason: 'exclude' }); continue; }
    if (matchesAny(file.path, config.generated)) { result.skipped.push({ path: file.path, reason: 'generated' }); continue; }
    const kind = classifyFile(file.path);
    if (kind.status === 'unsupported') { result.unsupported.push({ path: file.path, status: kind.status }); continue; }
    if (kind.status === 'unchecked-config' || kind.status === 'unknown') { result.unchecked.push({ path: file.path, status: kind.status }); continue; }
    if (kind.status === 'not-applicable') { result.notApplicable.push(file.path); continue; }
    const headText = fileAt(cwd, head, file.path);
    if (headText === null) continue;
    if (looksGenerated(headText)) { result.skipped.push({ path: file.path, reason: 'generated-header' }); continue; }
    let headComments;
    let baseComments = [];
    try {
      headComments = extractFileComments(file.path, headText).comments;
      const baseText = file.status === 'A' ? null : fileAt(cwd, baseline, file.oldPath);
      if (baseText !== null) baseComments = extractFileComments(file.oldPath, baseText).comments;
    } catch (error) {
      result.errors.push({ path: file.path, message: String(error.message ?? error) });
      continue;
    }
    const lines = addedLines(cwd, base, head, file);
    const existing = new Set(baseComments.map(normalized));
    const reportedGroups = new Set();
    for (const comment of headComments) {
      let touched = false;
      for (let n = comment.startLine; n <= comment.endLine; n += 1) if (lines.has(n)) { touched = true; break; }
      if (!touched || existing.has(normalized(comment)) || reportedGroups.has(comment.groupId)) continue;
      reportedGroups.add(comment.groupId);
      const verdict = classifyComment(comment.block, { lineText: comment.block.lineText, file: file.path });
      const entry = { path: file.path, line: comment.startLine, endLine: comment.block.endLine, text: comment.block.text, ...verdict };
      (verdict.allowed ? result.allowed : result.violations).push(entry);
    }
  }
  result.ok = result.violations.length === 0 && result.errors.length === 0
    && (config.unsupported !== 'fail' || result.unsupported.length === 0);
  return result;
}

export function measureDensity({ cwd, config = loadConfig(cwd) }) {
  const stats = new Map();
  const errors = [];
  for (const file of git(cwd, ['ls-files', '-z']).split('\0').filter(Boolean)) {
    if (matchesAny(file, config.exclude) || matchesAny(file, config.generated)) continue;
    const kind = classifyFile(file);
    if (kind.status !== 'supported') continue;
    const full = path.join(cwd, file);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, 'utf8');
    if (looksGenerated(text)) continue;
    let comments;
    try { comments = extractFileComments(file, text).comments; } catch (error) { errors.push({ path: file, message: String(error.message ?? error) }); continue; }
    const ext = path.extname(file).toLowerCase();
    const s = stats.get(ext) ?? { files: 0, lines: 0, commentLines: 0, comments: 0 };
    s.files += 1;
    s.lines += text.split('\n').filter((l) => l.trim()).length;
    const commentLines = new Set();
    for (const c of comments) for (let n = c.startLine; n <= c.endLine; n += 1) commentLines.add(n);
    s.commentLines += commentLines.size;
    s.comments += comments.length;
    stats.set(ext, s);
  }
  return { stats: Object.fromEntries(stats), errors };
}
