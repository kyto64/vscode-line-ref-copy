import fs from 'node:fs';
import path from 'node:path';
import { classifyFile } from './extract/index.mjs';
import { classifyComment, commentBody, GENERATED, inheritsFromHead, licenseNoticeLength, startsLicenseNotice, VIOLATIONS_NEVER_INHERITED } from './rules.mjs';
import { UnsupportedLanguageError } from './extract/unsupported.mjs';
import { addedLines, changedFiles, fileAt, git } from './git.mjs';
import { matchesAny } from './glob.mjs';

export const DEFAULT_CONFIG = {
  exclude: ['node_modules/**', '**/node_modules/**', 'dist/**', 'out/**', 'coverage/**', '**/*.min.js', '**/package-lock.json', '**/pnpm-lock.yaml', '**/yarn.lock', '**/actions.lock', 'skills-lock.json', '.claude/skills/**', '.agents/skills/**', '.rulesync/skills/**'],
  generated: [],
  unsupported: 'fail',
};

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
  return groups.flatMap((group, id) => group.members.map((m) => ({ ...m, groupId: id })));
}

const PREAMBLE_LINE = /^\s*$|^#!|^\s*<!doctype\b|^\s*<\?xml\b/i;

function codeAfterComment(c, lines) {
  const endLine = (lines[c.endLine - 1] ?? '').trim();
  const lastLine = c.text.trim().split('\n').at(-1).trim();
  if (c.startLine === c.endLine) {
    const firstLine = c.text.trim().split('\n')[0];
    return endLine.startsWith(firstLine) ? endLine.slice(firstLine.length).trim() !== '' : true;
  }
  return endLine.startsWith(lastLine) ? endLine.slice(lastLine.length).trim() !== '' : true;
}

export function markHeaderComments(comments, text) {
  const lines = text.split('\n');
  let coveredUntil = 0;
  let inHeader = true;
  return comments.map((c) => {
    if (inHeader) {
      for (let n = coveredUntil + 1; n < c.startLine; n += 1) {
        if (!PREAMBLE_LINE.test(lines[n - 1] ?? '')) { inHeader = false; break; }
      }
      const firstLine = c.text.trim().split('\n')[0];
      if (inHeader && !(lines[c.startLine - 1] ?? '').trim().startsWith(firstLine)) inHeader = false;
    }
    const isHeader = inHeader;
    if (inHeader) {
      coveredUntil = Math.max(coveredUntil, c.endLine);
      if (codeAfterComment(c, lines)) inHeader = false;
    }
    return { ...c, isHeader };
  });
}

function isGeneratedFile(comments) {
  return comments.some((c) => c.isHeader && GENERATED.test(commentBody(c.text)));
}

function normalized(comment) {
  return commentBody(comment.text).replace(/\s+/g, ' ');
}

export function extractFileComments(file, text) {
  const kind = classifyFile(file, text);
  if (kind.status !== 'supported') return { status: kind.status, comments: [] };
  return { status: 'supported', comments: groupLineComments(markHeaderComments(withLines(kind.extract(text, file), text), text)) };
}

const CONFIG_FILE = '.comment-check.json';

function parseConfig(text, where) {
  let user = {};
  if (text !== null) {
    try { user = JSON.parse(text); } catch (error) { throw new Error(`${CONFIG_FILE}（${where}）を JSON として読めない: ${error.message}`); }
  }
  return {
    exclude: [...DEFAULT_CONFIG.exclude, ...(user.exclude ?? [])],
    generated: user.generated ?? DEFAULT_CONFIG.generated,
    unsupported: user.unsupported ?? DEFAULT_CONFIG.unsupported,
  };
}

export function loadConfig(cwd) {
  const file = path.join(cwd, CONFIG_FILE);
  return parseConfig(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null, '作業ツリー');
}

export function loadConfigAt(cwd, ref) {
  return parseConfig(fileAt(cwd, ref, CONFIG_FILE), ref);
}

function countBy(items, key) {
  const counts = new Map();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

function newComments(headComments, baseComments, lines) {
  const touchesAddedLine = (c) => {
    for (let n = c.startLine; n <= c.endLine; n += 1) if (lines.has(n)) return true;
    return false;
  };
  const available = countBy(baseComments, normalized);
  for (const c of headComments) {
    if (touchesAddedLine(c)) continue;
    const key = normalized(c);
    if (available.has(key)) available.set(key, available.get(key) - 1);
  }
  const fresh = new Set();
  for (const c of headComments) {
    if (!touchesAddedLine(c)) continue;
    const key = normalized(c);
    const left = available.get(key) ?? 0;
    if (left > 0) available.set(key, left - 1);
    else fresh.add(c);
  }
  return fresh;
}

function classifyGroup(members, added, classifyMember, report) {
  const head = members[0];
  if (added.length < members.length || members.length === 1) {
    for (const c of added) report(c, c.text, c.endLine, classifyMember(c));
    return;
  }
  const verdicts = members.map((c) => [c, classifyMember(c)]);
  const reportedAlone = ([c, v]) => VIOLATIONS_NEVER_INHERITED.has(v.category)
    && !(c === head && v.category === 'constraint-without-reason');
  for (const [c, v] of verdicts.filter(reportedAlone)) report(c, c.text, c.endLine, v);
  const rest = verdicts.filter((entry) => !reportedAlone(entry)).map(([c]) => c);
  if (rest.length === 0) return;
  const joined = (items) => ({ ...items[0], text: items.map((c) => c.text).join('\n') });
  if (rest.length > 1 && rest[0].isHeader && startsLicenseNotice(commentBody(joined(rest).text))) {
    const noticeLength = licenseNoticeLength(rest.map((c) => commentBody(c.text)));
    const notice = rest.slice(0, noticeLength);
    const noticeVerdict = notice.length > 0 ? classifyMember(joined(notice)) : null;
    if (noticeVerdict?.category === 'license') {
      report(notice[0], joined(notice).text, notice.at(-1).endLine, noticeVerdict);
      for (const c of rest.slice(noticeLength)) report(c, c.text, c.endLine, classifyMember(c));
      return;
    }
  }
  const blockVerdict = classifyMember(joined(rest));
  if (rest.length === 1 || inheritsFromHead(blockVerdict.category) || blockVerdict.category === 'constraint-without-reason') {
    report(rest[0], joined(rest).text, rest.at(-1).endLine, blockVerdict);
    return;
  }
  const memberVerdicts = rest.map((c) => [c, classifyMember(c)]);
  if (!blockVerdict.allowed && memberVerdicts.every(([, v]) => v.category === blockVerdict.category)) {
    report(rest[0], joined(rest).text, rest.at(-1).endLine, blockVerdict);
    return;
  }
  for (const [c, v] of memberVerdicts) report(c, c.text, c.endLine, v);
}

export function checkDiff({ cwd, base, head = 'HEAD', config }) {
  const result = { violations: [], allowed: [], unsupported: [], unchecked: [], notApplicable: [], skipped: [], errors: [], configChanged: false };
  const baseline = git(cwd, ['merge-base', base, head], { allowFailure: true })?.trim() || base;
  if (!config) {
    const baseConfig = fileAt(cwd, baseline, CONFIG_FILE);
    const headConfig = fileAt(cwd, head, CONFIG_FILE);
    result.configSource = baseConfig !== null ? 'base' : headConfig !== null ? 'head' : 'default';
    config = parseConfig(baseConfig ?? headConfig, result.configSource === 'base' ? baseline : head);
    result.configChanged = baseConfig !== null && baseConfig !== headConfig;
  }
  result.config = config;
  for (const file of changedFiles(cwd, base, head)) {
    try {
      checkFile({ cwd, base, head, baseline, config, file, result });
    } catch (error) {
      result.errors.push({ path: file.path, message: String(error?.message ?? error) });
    }
  }
  result.ok = result.violations.length === 0 && result.errors.length === 0
    && (config.unsupported !== 'fail' || result.unsupported.length === 0);
  return result;
}

function checkFile({ cwd, base, head, baseline, config, file, result }) {
  if (matchesAny(file.path, config.exclude)) { result.skipped.push({ path: file.path, reason: 'exclude' }); return; }
  if (matchesAny(file.path, config.generated)) { result.skipped.push({ path: file.path, reason: 'generated' }); return; }
  const kind = classifyFile(file.path, path.extname(file.path) === '' ? (fileAt(cwd, head, file.path) ?? '') : undefined);
  if (kind.status === 'unsupported') { result.unsupported.push({ path: file.path, status: kind.status }); return; }
  if (kind.status === 'unchecked-config' || kind.status === 'unknown') { result.unchecked.push({ path: file.path, status: kind.status }); return; }
  if (kind.status === 'not-applicable') { result.notApplicable.push(file.path); return; }
  const headText = fileAt(cwd, head, file.path);
  if (headText === null) return;
  let headComments;
  let baseComments = [];
  let baseExtracted = false;
  const baseText = file.status === 'A' ? null : fileAt(cwd, baseline, file.oldPath);
  try {
    headComments = extractFileComments(file.path, headText).comments;
  } catch (error) {
    if (error instanceof UnsupportedLanguageError) result.unsupported.push({ path: file.path, status: 'unsupported', language: error.language });
    else result.errors.push({ path: file.path, message: String(error?.message ?? error) });
    return;
  }
  if (baseText !== null) {
    try { baseComments = extractFileComments(file.oldPath, baseText).comments; baseExtracted = true; } catch { baseComments = []; }
  }
  const generatedHeaderAdded = isGeneratedFile(headComments) && baseText !== null && !(baseExtracted && isGeneratedFile(baseComments));
  if (isGeneratedFile(headComments) && !generatedHeaderAdded) { result.skipped.push({ path: file.path, reason: 'generated-header' }); return; }
  const fresh = newComments(headComments, baseComments, addedLines(cwd, base, head, file));
  const groups = new Map();
  for (const c of headComments) {
    if (!groups.has(c.groupId)) groups.set(c.groupId, []);
    groups.get(c.groupId).push(c);
  }
  const report = (c, text, endLine, verdict) => {
    const entry = { path: file.path, line: c.startLine, endLine, text, ...verdict };
    (verdict.allowed ? result.allowed : result.violations).push(entry);
  };
  const classifyMember = (c) => classifyComment(c, { lineText: c.lineText, file: file.path, isHeader: c.isHeader, generatedHeaderAdded });
  for (const members of groups.values()) {
    const added = members.filter((c) => fresh.has(c));
    if (added.length > 0) classifyGroup(members, added, classifyMember, report);
  }
}

export function measureDensity({ cwd, config = loadConfig(cwd) }) {
  const stats = new Map();
  const errors = [];
  const unsupported = [];
  for (const file of git(cwd, ['ls-files', '-z']).split('\0').filter(Boolean)) {
    if (matchesAny(file, config.exclude) || matchesAny(file, config.generated)) continue;
    const full = path.join(cwd, file);
    if (!fs.statSync(full, { throwIfNoEntry: false })?.isFile()) continue;
    const extless = path.extname(file) === '';
    if (!extless && classifyFile(file).status !== 'supported') continue;
    const text = fs.readFileSync(full, 'utf8');
    if (classifyFile(file, text).status !== 'supported') continue;
    let comments;
    try { comments = extractFileComments(file, text).comments; } catch (error) {
      if (error instanceof UnsupportedLanguageError) unsupported.push({ path: file, language: error.language });
      else errors.push({ path: file, message: String(error.message ?? error) });
      continue;
    }
    if (isGeneratedFile(comments)) continue;
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
  return { stats: Object.fromEntries(stats), errors, unsupported };
}
