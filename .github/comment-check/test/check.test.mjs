import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkDiff, DEFAULT_CONFIG } from '../src/check.mjs';

process.env.COMMENT_CHECK_SHFMT ??= new URL('../.bin/shfmt', import.meta.url).pathname;
const tempDirs = [];
after(() => { for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true }); });

function repoWith(baseFiles, headFiles, config) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-check-'));
  tempDirs.push(dir);
  const run = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  const write = (files) => {
    for (const [name, content] of Object.entries(files)) {
      const full = path.join(dir, name);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      if (content === null) fs.rmSync(full);
      else fs.writeFileSync(full, content);
    }
  };
  run('init', '-q', '-b', 'main');
  run('config', 'user.email', 't@example.com');
  run('config', 'user.name', 't');
  write({ 'README.md': '# t\n', ...baseFiles });
  run('add', '-A');
  run('commit', '-q', '-m', 'base');
  run('tag', 'base');
  write(headFiles);
  run('add', '-A');
  run('commit', '-q', '-m', 'head', '--allow-empty');
  return checkDiff({ cwd: dir, base: 'base', head: 'HEAD', config: { ...DEFAULT_CONFIG, ...config } });
}

const categories = (items) => items.map((v) => `${v.path}:${v.line}:${v.category}`);

test('TS: 追加した説明コメント・TODO・ワークアラウンドは違反', () => {
  const r = repoWith({ 'src/a.ts': 'export const a = 1;\n' }, {
    'src/a.ts': 'export const a = 1;\n// increment the counter\nlet i = 0;\ni++; // TODO: fix later\n/* 暫定の回避策 */\nexport const b = i;\n',
  });
  assert.deepEqual(categories(r.violations), ['src/a.ts:2:explanation', 'src/a.ts:4:deferral', 'src/a.ts:5:workaround']);
  assert.equal(r.ok, false);
});

test('TS/JS: 文字列・URL・テンプレート・正規表現・JSX テキストはコメントと見なさない', () => {
  const r = repoWith({}, {
    'src/b.ts': [
      'const url = "https://example.com/a//b";',
      "const s = '/* not a comment */';",
      'const t = `x ${"//"} y ${`/* nested */`} // still template`;',
      'const re = /\\/\\/.*\\/\\*/g;',
      'export const all = [url, s, t, re];',
      '',
    ].join('\n'),
    'src/c.tsx': 'export const C = () => <div>// not a comment /* nor this */ http://x.test</div>;\n',
    'src/d.mjs': '#!/usr/bin/env node\nconsole.log("# hash", 1 / 2 / 3);\n',
  });
  assert.deepEqual(r.violations, []);
  assert.equal(r.ok, true);
});

test('許可される例外: ライセンス・マーカー付き制約・公開 API の JSDoc・ツール指示', () => {
  const r = repoWith({}, {
    'src/e.ts': [
      '// SPDX-License-Identifier: MIT',
      '/** Returns the blur radius in pixels for a given strength level. */',
      'export function radius(level: number): number { return level * 4; }',
      '// SECURITY: 拡張のメッセージは送信元 ID を必ず照合する（他拡張からの偽装を防ぐ）',
      'export const trusted = "id";',
      '/// <reference types="chrome" />',
      'export const lazy = () => import(/* @vite-ignore */ "./x.js");',
      '',
    ].join('\n'),
  });
  assert.deepEqual(r.violations, []);
  assert.deepEqual(r.allowed.map((a) => a.category), ['license', 'public-api-doc', 'constraint:security', 'directive', 'directive']);
});

test('非公開関数の JSDoc、理由の短いマーカー、検査の無効化は違反', () => {
  const r = repoWith({}, {
    'src/f.ts': [
      '/** helper */',
      'function helper() { return 1; }',
      '// INVARIANT: 短い',
      'export const v = helper();',
      '// oxlint-disable-next-line no-unused-vars',
      'const unused = 1;',
      '// eslint-disable-next-line no-console -- EXTERNAL: VS Code の Output チャネルが使えない起動前の段階なので console に出す',
      'console.log(unused);',
      '',
    ].join('\n'),
  });
  assert.deepEqual(r.violations.map((v) => v.category), ['explanation', 'constraint-without-reason', 'suppression']);
  assert.deepEqual(r.allowed.map((a) => a.category), ['suppression-with-reason']);
});

test('既存コメントは変更しなければ対象外、移動しただけでも対象外、文面を変えたら対象', () => {
  const base = { 'src/g.ts': '// keep me\nexport const a = 1;\n// will move\nexport const b = 2;\n// will edit\nexport const c = 3;\n' };
  const r = repoWith(base, { 'src/g.ts': '// keep me\nexport const a = 10;\nexport const b = 2;\n// will move\n// edited text\nexport const c = 3;\n' });
  assert.deepEqual(categories(r.violations), ['src/g.ts:5:explanation']);
});

test('Vue SFC: template・script・style のコメントを区別し、属性内の文字列は無視する', () => {
  const r = repoWith({}, {
    'src/App.vue': [
      '<template>',
      '  <!-- header area -->',
      '  <a href="https://kyto.jp/#/a//b" :title="\'/* x */\'">link // text</a>',
      '</template>',
      '<script setup lang="ts">',
      'const u = "http://x//y";',
      '// state',
      'const n = 1;',
      '</script>',
      '<style scoped>',
      '.a { background: url("/*.png"); } /* color */',
      '</style>',
      '',
    ].join('\n'),
  });
  assert.deepEqual(categories(r.violations), ['src/App.vue:2:explanation', 'src/App.vue:7:explanation', 'src/App.vue:11:explanation']);
});

test('HTML と CSS: コメントノード・インライン script/style を検査し、文字列内は無視する', () => {
  const r = repoWith({}, {
    'popup.html': '<!doctype html>\n<html><body>\n<!-- popup -->\n<p>a // b /* c */</p>\n<script>\nconst x = "<!-- no -->"; // inline\n</script>\n<style>p::before { content: "/* no */"; } /* s */</style>\n</body></html>\n',
    'style.css': '.a::after { content: "/* not */"; }\n/* real */\n',
  });
  assert.deepEqual(categories(r.violations), ['popup.html:3:explanation', 'popup.html:6:explanation', 'popup.html:8:explanation', 'style.css:2:explanation']);
});

test('Python: tokenize でコメントを取り、文字列内の # は無視する。公開関数の docstring は許可', () => {
  const r = repoWith({}, {
    'scripts/x.py': 'def check(path):\n    """Validate the frontmatter of one article."""\n    s = "# not a comment"\n    return s  # explain\n\n\ndef _inner():\n    """private doc"""\n    return 1\n',
  });
  assert.deepEqual(categories(r.violations), ['scripts/x.py:4:explanation', 'scripts/x.py:8:explanation']);
  assert.deepEqual(r.allowed.map((a) => a.category), ['public-api-doc']);
});

test('YAML: SHA 固定の Action のバージョン表記は許可、ブロックスカラー内の # は対象外、普通のコメントは違反', () => {
  const r = repoWith({}, {
    '.github/workflows/ci.yml': [
      'name: CI',
      'on: [pull_request]',
      'jobs:',
      '  test:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567 # v6.0.1',
      '      # install deps',
      '      - run: |',
      '          # shell comment inside run block',
      '          echo "#not"',
      '      - name: "quoted # hash"',
      '        run: echo ok',
      '',
    ].join('\n'),
  });
  assert.deepEqual(categories(r.violations), ['.github/workflows/ci.yml:8:explanation']);
  assert.deepEqual(r.allowed.map((a) => a.category), ['action-pin']);
});

test('Markdown は非適用、ベンダーしたスキルは除外、未対応言語は失敗扱い', () => {
  const r = repoWith({}, {
    'articles/a.md': '# Title\n\n```ts\n// sample code in an article\n```\n',
    '.claude/skills/systematic-debugging/example.ts': '// upstream comment\nexport {};\n',
    'apps/android/Main.kt': '// kotlin comment\nfun main() {}\n',
  });
  assert.deepEqual(r.violations, []);
  assert.deepEqual(r.notApplicable, ['articles/a.md']);
  assert.deepEqual(r.skipped.map((s) => s.path), ['.claude/skills/systematic-debugging/example.ts']);
  assert.deepEqual(r.unsupported.map((u) => u.path), ['apps/android/Main.kt']);
  assert.equal(r.ok, false);
  const warnOnly = repoWith({}, { 'apps/android/Main.kt': 'fun main() {}\n' }, { unsupported: 'warn' });
  assert.equal(warnOnly.ok, true);
});

test('生成ファイル（ヘッダか設定のパス）は対象外', () => {
  const r = repoWith({}, {
    'gen/api.ts': '// @generated by tool. DO NOT EDIT.\n// anything\nexport {};\n',
    'content.js': '// compiled output comment\nexport {};\n',
  }, { generated: ['content.js'] });
  assert.deepEqual(r.violations, []);
});

test('構文エラーのファイルは解析エラーとして失敗にする（黙って通さない）', () => {
  const r = repoWith({}, { 'src/App.vue': '<template><div></template>\n<script>\nconst a = 1\n', 'src/broken.ts': 'const = ;\n// hidden\n' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors.map((e) => e.path).sort(), ['src/App.vue', 'src/broken.ts']);
});

test('連続する行コメントは 1 つのブロックとして扱い、先頭行のマーカーがブロック全体に効く', () => {
  const r = repoWith({}, {
    '.github/workflows/publish.yml': '# EXTERNAL: Marketplace の Trusted Publishing ポリシーがこのファイル名を登録している。\n# 名前を変えるとポリシーの更新が要る。\nname: Publish\non: [push]\njobs: {}\n',
    'src/h.ts': '// first line\n// second line\nexport const h = 1;\n',
  });
  assert.deepEqual(categories(r.violations), ['src/h.ts:1:explanation']);
  assert.deepEqual(r.allowed.map((a) => a.category), ['constraint:external']);
});

test('Python の shebang は許可', () => {
  const r = repoWith({}, { 'scripts/run.py': '#!/usr/bin/env python3\nprint(1)\n' });
  assert.deepEqual(r.violations, []);
});

test('シェル: shfmt の構文木からコメントを取り、文字列・ヒアドキュメント内の # は無視する', () => {
  const r = repoWith({}, {
    'scripts/a.sh': '#!/usr/bin/env bash\nset -euo pipefail\n# install browsers\necho "# not" # trailing\ncat <<EOF\n# heredoc text\nEOF\n',
  });
  assert.deepEqual(categories(r.violations), ['scripts/a.sh:3:explanation', 'scripts/a.sh:4:explanation']);
  assert.deepEqual(r.allowed.map((a) => a.category), ['directive']);
});

test('設定ファイル（toml など）は未検査として一覧に出すが失敗にはしない', () => {
  const r = repoWith({}, { 'wrangler.toml': '# comment\nname = "x"\n' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.unchecked.map((u) => u.path), ['wrangler.toml']);
});

test('CLI: 違反があれば終了コード 1、GitHub のステップサマリに違反と例外を書く', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-check-cli-'));
  tempDirs.push(dir);
  const run = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  run('init', '-q', '-b', 'main');
  run('config', 'user.email', 't@example.com');
  run('config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'a.ts'), 'export const a = 1;\n');
  run('add', '-A');
  run('commit', '-q', '-m', 'base');
  fs.writeFileSync(path.join(dir, 'a.ts'), '// SPDX-License-Identifier: MIT\nexport const a = 1; // set a\n');
  run('commit', '-q', '-am', 'head');
  const summary = path.join(dir, 'summary.md');
  const cli = new URL('../src/cli.mjs', import.meta.url).pathname;
  let status = 0;
  let stdout = '';
  try {
    stdout = execFileSync('node', [cli, '--base', 'HEAD~1'], { cwd: dir, env: { ...process.env, GITHUB_ACTIONS: 'true', GITHUB_STEP_SUMMARY: summary }, encoding: 'utf8' });
  } catch (error) {
    status = error.status;
    stdout = error.stdout;
  }
  assert.equal(status, 1);
  assert.match(stdout, /::error file=a\.ts,line=2,/);
  const md = fs.readFileSync(summary, 'utf8');
  assert.match(md, /コメント検査: 不合格/);
  assert.match(md, /a\.ts:2.*explanation/);
  assert.match(md, /a\.ts:1.*license/);
});

test('JSON/JSONC: tsconfig などのコメントを取り、文字列内の // は無視する。ロックファイルは除外', () => {
  const r = repoWith({}, {
    'tsconfig.json': '{\n  // strict mode\n  "compilerOptions": { "baseUrl": "http://x//y" }\n}\n',
    'package-lock.json': '{"a": 1}\n',
  });
  assert.deepEqual(categories(r.violations), ['tsconfig.json:2:explanation']);
  assert.ok(r.skipped.some((s) => s.path === 'package-lock.json'));
});

test('master だけが先にコメントを消しても、機能ブランチ側の既存コメントは新規違反にならない', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-check-'));
  tempDirs.push(dir);
  const run = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  const commit = (content, message) => {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/a.ts'), content);
    run('add', '-A');
    run('commit', '-q', '-m', message);
  };
  run('init', '-q', '-b', 'main');
  run('config', 'user.email', 't@example.com');
  run('config', 'user.name', 't');
  commit('let i = 0;\ni++; // increment the counter\n', 'base');
  run('switch', '-q', '-c', 'feature');
  commit('let i = 0;\ni += 1; // increment the counter\n', 'feature edits the line');
  run('switch', '-q', 'main');
  commit('let i = 0;\ni++;\n', 'main removes the comment');
  const r = checkDiff({ cwd: dir, base: 'main', head: 'feature', config: { ...DEFAULT_CONFIG } });
  assert.deepEqual(categories(r.violations), []);
  assert.equal(r.ok, true);
});

test('CLI: サマリ表のセルではバックスラッシュと縦線をエスケープする', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-check-'));
  tempDirs.push(dir);
  const run = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  run('init', '-q', '-b', 'main');
  run('config', 'user.email', 't@example.com');
  run('config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'README.md'), '# t\n');
  run('add', '-A');
  run('commit', '-q', '-m', 'base');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src/a.ts'), 'let i = 0;\n// TODO: a\\|b and c\\\n');
  run('add', '-A');
  run('commit', '-q', '-m', 'head');
  const summary = path.join(dir, 'summary.md');
  const cli = new URL('../src/cli.mjs', import.meta.url).pathname;
  try {
    execFileSync('node', [cli, '--base', 'HEAD~1', '--cwd', dir], { env: { ...process.env, GITHUB_STEP_SUMMARY: summary }, stdio: 'pipe' });
  } catch {}
  assert.match(fs.readFileSync(summary, 'utf8'), /a\\\\\\\|b and c\\\\ \|/);
});
