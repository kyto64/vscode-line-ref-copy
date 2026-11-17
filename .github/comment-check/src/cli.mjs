#!/usr/bin/env node
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { checkDiff, measureDensity, loadConfig } from './check.mjs';
import { git } from './git.mjs';

const { values } = parseArgs({
  options: {
    base: { type: 'string' },
    head: { type: 'string', default: 'HEAD' },
    cwd: { type: 'string', default: process.cwd() },
    json: { type: 'boolean', default: false },
    density: { type: 'boolean', default: false },
  },
});

function escapeAnnotation(text) {
  return String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function escapeAnnotationProperty(text) {
  return escapeAnnotation(text).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

function escapeTableCell(text) {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

function excerpt(text) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 100 ? `${oneLine.slice(0, 97)}...` : oneLine;
}

function summaryMarkdown(result) {
  const rows = (items) => items.map((v) => `| \`${v.path}:${v.line}\` | ${v.category} | ${escapeTableCell(excerpt(v.text))} |`).join('\n');
  const parts = [`## コメント検査: ${result.ok ? '合格' : '不合格'}`];
  if (result.violations.length) parts.push('### 違反', '| 場所 | 種類 | コメント |', '|---|---|---|', rows(result.violations));
  if (result.allowed.length) parts.push('### 許可した例外（レビュー対象）', '| 場所 | 種類 | コメント |', '|---|---|---|', rows(result.allowed));
  if (result.unsupported.length) parts.push('### 検査できなかったファイル（パーサ未対応）', ...result.unsupported.map((u) => `- \`${u.path}\`${u.language ? `（${u.language}）` : ''}`));
  if (result.unchecked.length) parts.push('### 検査していない設定ファイル等（失敗にはしない）', ...result.unchecked.map((u) => `- \`${u.path}\``));
  if (result.errors.length) parts.push('### 解析エラー', ...result.errors.map((e) => `- \`${e.path}\`: ${e.message}`));
  return parts.join('\n\n') + '\n';
}

function runDensity() {
  const report = measureDensity({ cwd: values.cwd });
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  return 0;
}

function remoteDefaultBranch(cwd) {
  return git(cwd, ['rev-parse', '--abbrev-ref', '--verify', '--quiet', 'origin/HEAD'], { allowFailure: true })?.trim() || null;
}

function runCheck() {
  const base = values.base ?? remoteDefaultBranch(values.cwd);
  if (!base) {
    process.stderr.write('usage: comment-check [--base <ref>] [--head <ref>] [--json] | --density\n--base を省くと origin/HEAD を使う。origin/HEAD がなければ git remote set-head origin --auto で設定するか、--base を指定する\n');
    return 2;
  }
  const config = loadConfig(values.cwd);
  const result = checkDiff({ cwd: values.cwd, base, head: values.head, config });
  if (values.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    for (const v of result.violations) process.stdout.write(`${v.path}:${v.line}: [${v.category}] ${v.message}\n    ${excerpt(v.text)}\n`);
    for (const a of result.allowed) process.stdout.write(`${a.path}:${a.line}: (許可: ${a.category}) ${excerpt(a.text)}\n`);
    for (const u of result.unsupported) process.stdout.write(`${u.path}: [unsupported] コメント検査に未対応${u.language ? `（${u.language}）` : ''}${config.unsupported === 'fail' ? '（失敗扱い）' : ''}\n`);
    for (const u of result.unchecked) process.stdout.write(`${u.path}: [unchecked] 設定ファイル等のため未検査（失敗にはしない）\n`);
    for (const e of result.errors) process.stdout.write(`${e.path}: [parse-error] ${e.message}\n`);
    process.stdout.write(`comment-check: ${result.ok ? 'OK' : 'NG'} (違反 ${result.violations.length} / 許可した例外 ${result.allowed.length} / 未対応 ${result.unsupported.length} / 解析エラー ${result.errors.length})\n`);
  }
  if (process.env.GITHUB_ACTIONS === 'true') {
    for (const v of result.violations) process.stdout.write(`::error file=${escapeAnnotationProperty(v.path)},line=${v.line},endLine=${v.endLine},title=${escapeAnnotationProperty(`comment-check ${v.category}`)}::${escapeAnnotation(v.message)}\n`);
    for (const u of result.unsupported) process.stdout.write(`::${config.unsupported === 'fail' ? 'error' : 'warning'} file=${escapeAnnotationProperty(u.path)},title=comment-check unsupported::コメント検査に未対応の言語\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown(result));
  return result.ok ? 0 : 1;
}

process.exitCode = values.density ? runDensity() : runCheck();
