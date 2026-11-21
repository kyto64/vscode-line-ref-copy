import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkDiff, DEFAULT_CONFIG } from '../src/check.mjs';
import { commentBody } from '../src/rules.mjs';
import { resolveShfmt } from './helpers/shfmt.mjs';

for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_CEILING_DIRECTORIES']) delete process.env[name];
process.env.GIT_CONFIG_GLOBAL = os.devNull;
process.env.GIT_CONFIG_NOSYSTEM = '1';

function childEnv(extra = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(GITHUB_|RUNNER_|ACTIONS_)/.test(name) && name !== 'CI'));
  return { ...env, ...extra };
}

const localShfmt = resolveShfmt({ env: process.env, root: fileURLToPath(new URL('..', import.meta.url)) });
if (localShfmt) process.env.COMMENT_CHECK_SHFMT = localShfmt;
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
    stdout = execFileSync('node', [cli, '--base', 'HEAD~1'], { cwd: dir, env: childEnv({ GITHUB_ACTIONS: 'true', GITHUB_STEP_SUMMARY: summary }), encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    status = error.status;
    stdout = error.stderr;
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

test('生成物マーカー: 冒頭の文字列リテラルにある DO NOT EDIT ではファイルを生成物扱いしない', () => {
  const r = repoWith({}, {
    'src/msg.ts': 'export const message = "DO NOT EDIT";\n// explain the message\nexport const other = 1;\n',
  });
  assert.deepEqual(categories(r.violations), ['src/msg.ts:2:explanation']);
  assert.deepEqual(r.skipped, []);
});

test('生成物マーカー: ファイル途中のコメントにある @generated / auto-generated は例外にしない', () => {
  const r = repoWith({}, {
    'src/mid.ts': 'export const a = 1;\n// this list is auto-generated by hand\nexport const b = 2;\n/* @generated */\nexport const c = 3;\n',
  });
  assert.deepEqual(categories(r.violations), ['src/mid.ts:2:explanation', 'src/mid.ts:4:explanation']);
});

test('Python: 入れ子の関数・クラスの docstring も検査し、関数内の非公開実装の docstring は違反', () => {
  const r = repoWith({}, {
    'scripts/nested.py': [
      'def outer():',
      '    """Run the public entry point."""',
      '    def _inner():',
      '        """Explain the implementation."""',
      '        return 1',
      '    def helper():',
      '        """Also implementation detail."""',
      '        return 2',
      '    return _inner() + helper()',
      '',
      '',
      'class Api:',
      '    """Public API."""',
      '    class Config:',
      '        """Public nested config."""',
      '',
      '',
      'if True:',
      '    def guarded():',
      '        """Public but defined under if."""',
      '        x = 1',
      '        """bare string used as a comment"""',
      '        return x',
      '',
    ].join('\n'),
  });
  assert.deepEqual(categories(r.violations), ['scripts/nested.py:4:explanation', 'scripts/nested.py:7:explanation', 'scripts/nested.py:22:explanation']);
  assert.deepEqual(r.allowed.map((a) => `${a.line}:${a.category}`), ['2:public-api-doc', '13:public-api-doc', '15:public-api-doc', '20:public-api-doc']);
});

test('CSS: 引用符なしの url() やエスケープの中の /* はコメントと見なさない（HTML・Vue の style も同じ）', () => {
  const r = repoWith({}, {
    'icons.css': '.icon { background: url(/images/*.png); }\n.b { background: URL( a/*b.svg ); }\n.c::before { content: \\2F\\2A; }\n/* real */\n',
    'page.html': '<style>.i { background: url(/x/*.png); } /* s */</style>\n',
  });
  assert.deepEqual(categories(r.violations), ['icons.css:4:explanation', 'page.html:1:explanation']);
  assert.deepEqual(r.errors, []);
});

test('ライセンス行のすぐ下に足したコメントは例外にしない（既存のライセンスブロックに追記した場合）', () => {
  const base = { 'src/lic.ts': '// SPDX-License-Identifier: MIT\nexport const a = 1;\n' };
  const r = repoWith(base, { 'src/lic.ts': '// SPDX-License-Identifier: MIT\n// TODO: fix this later\n// explains a\nexport const a = 1;\n' });
  assert.deepEqual(categories(r.violations), ['src/lic.ts:2:deferral', 'src/lic.ts:3:explanation']);
  assert.deepEqual(r.allowed, []);
});

test('新しく足した複数行のライセンスヘッダはブロックごと許可する', () => {
  const r = repoWith({}, {
    'src/apache.ts': '// Copyright 2026 kyto\n//\n// Unless required by applicable law or agreed to in writing, software\n// is provided AS IS.\nexport const a = 1;\n',
  });
  assert.deepEqual(r.violations, []);
  assert.deepEqual(r.allowed.map((a) => a.category), ['license']);
});

test('既存の制約コメントに無関係な行を足しても、マーカーは引き継がない', () => {
  const base = { 'src/c.ts': '// SECURITY: 送信元の拡張 ID を必ず照合する（他拡張からの偽装を防ぐ）\nexport const a = 1;\n' };
  const r = repoWith(base, { 'src/c.ts': '// SECURITY: 送信元の拡張 ID を必ず照合する（他拡張からの偽装を防ぐ）\n// set a to one\nexport const a = 1;\n' });
  assert.deepEqual(categories(r.violations), ['src/c.ts:2:explanation']);
});

test('ライセンスの単語を含むだけのファイル途中のコメントは例外にしない', () => {
  const r = repoWith({}, { 'src/mid-lic.ts': 'export const a = 1;\n// copyright notice is rendered below\nexport const b = 2;\n' });
  assert.deepEqual(categories(r.violations), ['src/mid-lic.ts:2:explanation']);
});

test('Vue: scss の style は postcss-scss で解析し、// コメントも検査する。sass・stylus・pug は未対応として失敗', () => {
  const r = repoWith({}, {
    'src/A.vue': '<template><div /></template>\n<style lang="scss">\n$c: red;\n// TODO: fix this later\n.a { color: $c; background: url(/x/*.png); }\n</style>\n',
    'src/B.vue': '<template><div /></template>\n<style lang="sass">\n.a\n  color: red\n</style>\n',
    'src/C.vue': '<template lang="pug">div</template>\n',
    'src/D.vue': '<template><div /></template>\n<style lang="stylus">\n.a\n  color red\n</style>\n',
  });
  assert.deepEqual(categories(r.violations), ['src/A.vue:4:deferral']);
  assert.deepEqual(r.unsupported.map((u) => u.path).sort(), ['src/B.vue', 'src/C.vue', 'src/D.vue']);
  assert.equal(r.ok, false);
});

test('SCSS・LESS ファイルは版固定のパーサで検査し、sass（インデント記法）は未対応', () => {
  const r = repoWith({}, {
    'a.scss': '$x: 1px;\n// line comment\n.a { margin: $x; content: "// no"; }\n',
    'b.less': '@x: 1px;\n// less comment\n.b { margin: @x; }\n',
    'c.sass': '.c\n  color: red\n',
  });
  assert.deepEqual(categories(r.violations), ['a.scss:2:explanation', 'b.less:2:explanation']);
  assert.deepEqual(r.unsupported.map((u) => u.path), ['c.sass']);
});

test('TS: エクスポートしたクラスの private メンバーの JSDoc は公開 API 扱いしない', () => {
  const r = repoWith({}, {
    'src/k.ts': 'export class K {\n  /** public doc */\n  run(): void {}\n  /** private doc */\n  private hidden(): void {}\n  /** hash doc */\n  #secret(): void {}\n}\n',
  });
  assert.deepEqual(categories(r.violations), ['src/k.ts:4:explanation', 'src/k.ts:6:explanation']);
});

test('HTML: JS 以外の script／style（テンプレートや text/less など）は未対応として失敗、JSON-LD は JSON として扱う', () => {
  const r = repoWith({}, {
    'a.html': '<script type="text/x-template"><!-- hidden --></script>\n',
    'b.html': '<script type="application/ld+json">{"a": "http://x//y"}</script>\n',
  });
  assert.deepEqual(r.unsupported.map((u) => u.path), ['a.html']);
  assert.deepEqual(r.violations, []);
});

test('新しく足したライセンス・制約ブロックの中でも、TODO や検査の無効化の行は引き継がずに違反', () => {
  const r = repoWith({}, {
    'src/n.ts': '// SPDX-License-Identifier: MIT\n// TODO: fix this later\nexport const a = 1;\n// EXTERNAL: ストアの審査規約で remote code を禁じているため eval を使わない\n// eslint-disable-next-line no-eval\nexport const b = 2;\n',
  });
  assert.deepEqual(categories(r.violations), ['src/n.ts:2:deferral', 'src/n.ts:5:suppression']);
  assert.deepEqual(r.allowed.map((a) => a.category), ['license', 'constraint:external']);
});

test('Python: 日本語を含む docstring とその前の行でも、docstring の範囲がずれない（ast のバイト位置を文字位置に直す）', () => {
  const r = repoWith({}, {
    'scripts/ja.py': [
      'def public_entry():',
      '    """公開の入口。日本語の説明。"""',
      '    value = "@ts-ignore"',
      '    名前 = "日本語"; """前に日本語がある同じ行の文字列"""',
      '    return value, 名前',
      '',
    ].join('\n'),
  });
  assert.deepEqual(r.allowed.map((a) => [a.line, a.category, a.text]), [[2, 'public-api-doc', '"""公開の入口。日本語の説明。"""']]);
  assert.deepEqual(r.violations.map((v) => [v.line, v.category, v.text]), [[4, 'explanation', '"""前に日本語がある同じ行の文字列"""']]);
});

test('Python: 改ページ（\\f）や U+2028 を含んでも行の位置がずれない', () => {
  const r = repoWith({}, {
    'scripts/ff.py': 'x = "a\u2028b"\n\f\ndef f():\n    """Public doc."""\n    """bare string"""\n    return x\n',
  });
  assert.deepEqual(r.violations.map((v) => [v.line, v.text]), [[5, '"""bare string"""']]);
  assert.deepEqual(r.allowed.map((a) => [a.line, a.text]), [[4, '"""Public doc."""']]);
});

test('マルチバイト文字の後ろにあるコメントも、TS・Vue・HTML・CSS・YAML・シェルで位置と文面がずれない', () => {
  const r = repoWith({}, {
    'src/ja.ts': 'export const 名前 = "日本語😀"; // 説明\n',
    'src/Ja.vue': '<template><p>日本語😀</p><!-- 注釈 --></template>\n<script setup>\nconst s = "絵文字😀"; // 説明\n</script>\n<style>\n.a::before { content: "日本語😀"; } /* 色 */\n</style>\n',
    'ja.html': '<p>日本語😀</p><!-- 注釈 -->\n',
    'ja.css': '.a::before { content: "日本語😀"; } /* 色 */\n',
    'ja.yml': 'name: "日本語😀" # 説明\n',
    'ja.sh': 'echo "日本語😀" # 説明\n',
  });
  const got = r.violations.map((v) => `${v.path}:${v.line}:${v.text}`).sort();
  assert.deepEqual(got, [
    'ja.css:1:/* 色 */',
    'ja.html:1:<!-- 注釈 -->',
    'ja.sh:1:# 説明',
    'ja.yml:1:# 説明',
    'src/Ja.vue:1:<!-- 注釈 -->',
    'src/Ja.vue:3:// 説明',
    'src/Ja.vue:6:/* 色 */',
    'src/ja.ts:1:// 説明',
  ]);
});

test('宣言ファイル（.d.ts / .d.mts / .d.cts / .d.css.ts）の JSDoc は公開 API のドキュメントとして許可し、通常の .ts の非公開宣言は違反のまま', () => {
  const r = repoWith({}, {
    'src/webviewCss.d.ts': '/** CSS text injected at build time. */\ndeclare const __WEBVIEW_CSS__: string;\n',
    'src/types.d.mts': '/** Build flag. */\ndeclare const __FLAG__: boolean;\n',
    'src/legacy.d.cts': '/** Legacy flag. */\ndeclare const __LEGACY__: boolean;\n',
    'src/local.ts': '/** Build flag. */\ndeclare const __FLAG__: boolean;\nexport const f = __FLAG__;\n',
    'src/styles.d.css.ts': '/** Class names of styles.css. */\ndeclare const classes: Record<string, string>;\n',
    'src/webview.dts.ts': '/** Not a declaration file. */\nconst hidden = 1;\nexport const g = hidden;\n',
  });
  assert.deepEqual(categories(r.violations), ['src/local.ts:1:explanation', 'src/webview.dts.ts:1:explanation']);
  assert.deepEqual(r.allowed.map((a) => `${a.path}:${a.category}`).sort(), ['src/legacy.d.cts:public-api-doc', 'src/styles.d.css.ts:public-api-doc', 'src/types.d.mts:public-api-doc', 'src/webviewCss.d.ts:public-api-doc']);
});

test('shfmt の解決: 環境変数を最優先し、未設定なら実在するローカルバイナリだけを選び、なければ PATH 探索に任せる', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-check shfmt-'));
  const own = path.join(root, '.github', 'comment-check');
  fs.mkdirSync(own, { recursive: true });
  try {
    assert.equal(resolveShfmt({ env: {}, root: own }), undefined);
    assert.equal(resolveShfmt({ env: { COMMENT_CHECK_SHFMT: '/custom/shfmt' }, root: own }), '/custom/shfmt');
    fs.mkdirSync(path.join(own, '.bin', 'shfmt'), { recursive: true });
    assert.equal(resolveShfmt({ env: {}, root: own }), undefined, 'ディレクトリは実行ファイルとして選ばない');
    fs.rmSync(path.join(own, '.bin'), { recursive: true });
    fs.mkdirSync(path.join(root, '.bin'));
    fs.writeFileSync(path.join(root, '.bin', 'shfmt'), '');
    assert.equal(resolveShfmt({ env: {}, root: own }), path.join(root, '.bin', 'shfmt'));
    fs.mkdirSync(path.join(own, '.bin'));
    fs.writeFileSync(path.join(own, '.bin', 'shfmt'), '');
    assert.equal(resolveShfmt({ env: {}, root: own }), path.join(own, '.bin', 'shfmt'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('生成物ヘッダの判定: 同じ行でブロックコメントの後ろにコードがあれば、そこで先頭コメント扱いを打ち切る', () => {
  const r = repoWith({}, {
    'src/inline.ts': '/* header */ export const value = 1;\n// @generated by a tool\n// TODO: fix later\n',
    'src/multi.ts': '/*\n * header\n */ export const value = 1;\n// @generated by a tool\n',
    'page.html': '<!-- header --><p>x</p>\n<!-- @generated -->\n',
    'src/real.ts': '/* header */\n// @generated by a tool\nexport const z = 1;\n',
  });
  assert.deepEqual(r.skipped.map((s) => `${s.path}:${s.reason}`), ['src/real.ts:generated-header']);
  assert.deepEqual(categories(r.violations).sort(), [
    'page.html:1:explanation', 'page.html:2:explanation',
    'src/inline.ts:1:explanation', 'src/inline.ts:2:explanation', 'src/inline.ts:3:deferral',
    'src/multi.ts:1:explanation', 'src/multi.ts:4:explanation',
  ]);
});

test('Python: 三重の一重引用符・一重引用符・二重引用符 1 つで書いた文字列でも、引用符を外して制約マーカーを判定する', () => {
  const r = repoWith({}, {
    'scripts/q.py': [
      'def _a():',
      "    '''INVARIANT: the callback must run on the main thread'''",
      'def _b():',
      '    "INVARIANT: the callback must run on the main thread"',
      'def _c():',
      "    r'SECURITY: never log the raw token value here'",
      'def _d():',
      '    "plain explanation of the helper"',
      '',
    ].join('\n'),
  });
  assert.deepEqual(r.allowed.map((a) => `${a.line}:${a.category}`), ['2:constraint:invariant', '4:constraint:invariant', '6:constraint:security']);
  assert.deepEqual(categories(r.violations), ['scripts/q.py:8:explanation']);
});

test('複数行の制約ブロック: 理由がマーカーの次の行にあれば許可し、TODO・理由のない無効化は行ごとに違反のまま', () => {
  const r = repoWith({}, {
    'src/c.ts': [
      'export function a() {',
      '  // INVARIANT:',
      '  // The callback must run on the main thread.',
      '  return 1;',
      '}',
      'export function b() {',
      '  // EXTERNAL:',
      '  // TODO: ask upstream',
      '  return 2;',
      '}',
      'export function c() {',
      '  // SECURITY:',
      '  // short',
      '  return 3;',
      '}',
      '',
    ].join('\n'),
  });
  assert.deepEqual(r.allowed.map((a) => `${a.line}:${a.category}`), ['2:constraint:invariant']);
  assert.deepEqual(categories([...r.violations].sort((x, y) => x.line - y.line)), ['src/c.ts:7:constraint-without-reason', 'src/c.ts:8:deferral', 'src/c.ts:12:constraint-without-reason']);
});

test('TS: export { } や export default で後から公開した宣言の JSDoc も公開 API として扱う', () => {
  const r = repoWith({}, {
    'src/list.ts': [
      '/** Public entry. */',
      'function api() { return 1; }',
      '/** Renamed export. */',
      'class Impl { /** Public method. */ run() { return 2; } }',
      '/** Exported constant. */',
      'const limit = 3, other = 4;',
      '/** Exported type. */',
      'type Shape = { a: number };',
      '/** Default export. */',
      'function main() { return limit + other; }',
      '/** Not exported. */',
      'function hidden() { return 5; }',
      'export { api, Impl as Runner, limit };',
      'export type { Shape };',
      'export default main;',
      'hidden();',
      '',
    ].join('\n'),
    'src/reexport.ts': "/** Re-export from elsewhere does not make this public. */\nfunction api() { return 1; }\nexport { api as other } from './list';\napi();\n",
  });
  assert.deepEqual(r.allowed.map((a) => `${a.path}:${a.line}`), ['src/list.ts:1', 'src/list.ts:3', 'src/list.ts:4', 'src/list.ts:5', 'src/list.ts:7', 'src/list.ts:9']);
  assert.deepEqual(categories(r.violations), ['src/list.ts:11:explanation', 'src/reexport.ts:1:explanation']);
});

function gitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-check-'));
  tempDirs.push(dir);
  const run = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe', encoding: 'utf8' });
  run('init', '-q', '-b', 'trunk');
  run('config', 'user.email', 't@example.com');
  run('config', 'user.name', 't');
  const commit = (files, message) => {
    for (const [name, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), content);
    }
    run('add', '-A');
    run('commit', '-q', '-m', message);
  };
  return { dir, run, commit };
}

const CLI = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));

test('CLI: サマリ表のセルではバックスラッシュを先にエスケープしてから縦線をエスケープする', () => {
  const { dir, commit } = gitRepo();
  commit({ 'README.md': '# t\n' }, 'base');
  commit({ 'src/a.ts': 'let i = 0;\n// TODO: a\\|b and c\\\n' }, 'head');
  const summary = path.join(dir, 'summary.md');
  try {
    execFileSync('node', [CLI, '--base', 'HEAD~1', '--cwd', dir], { env: childEnv({ GITHUB_STEP_SUMMARY: summary }), stdio: 'pipe' });
  } catch {}
  const row = fs.readFileSync(summary, 'utf8').split('\n').find((line) => line.includes('TODO'));
  assert.equal(row, '| `src/a.ts:2` | deferral | // TODO: a\\\\\\|b and c\\\\ |');
});

test('HTML コメントの終端は --> と --!> のどちらでも本文から外す', () => {
  assert.equal(commentBody('<!-- INVARIANT: keep this order for screen readers --!>'), 'INVARIANT: keep this order for screen readers');
  assert.equal(commentBody('<!-- prettier-ignore -->'), 'prettier-ignore');
});

test('ベースラインは merge-base から読む: 既定ブランチだけが先にコメントを消しても、機能ブランチの既存コメントは新規違反にならない', () => {
  const { dir, run, commit } = gitRepo();
  commit({ 'src/a.ts': 'let i = 0;\ni++; // increment the counter\n' }, 'base');
  run('switch', '-q', '-c', 'feature');
  commit({ 'src/a.ts': 'let i = 0;\ni += 1; // increment the counter\n' }, 'feature edits the line');
  run('switch', '-q', 'trunk');
  commit({ 'src/a.ts': 'let i = 0;\ni++;\n' }, 'trunk removes the comment');
  const r = checkDiff({ cwd: dir, base: 'trunk', head: 'feature', config: { ...DEFAULT_CONFIG } });
  assert.deepEqual(categories(r.violations), []);
  assert.equal(r.ok, true);
});

test('CLI: --base を省くと origin/HEAD（リモートの既定ブランチ）を基準にし、名前を決め打ちしない', () => {
  const upstream = gitRepo();
  upstream.commit({ 'README.md': '# t\n' }, 'base');
  const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-check-clone-'));
  tempDirs.push(clone);
  execFileSync('git', ['clone', '-q', upstream.dir, clone], { stdio: 'pipe' });
  execFileSync('git', ['-C', clone, 'config', 'user.email', 't@example.com']);
  execFileSync('git', ['-C', clone, 'config', 'user.name', 't']);
  execFileSync('git', ['-C', clone, 'switch', '-q', '-c', 'feature']);
  fs.mkdirSync(path.join(clone, 'src'));
  fs.writeFileSync(path.join(clone, 'src/a.ts'), 'let i = 0;\n// TODO: later\n');
  execFileSync('git', ['-C', clone, 'add', '-A']);
  execFileSync('git', ['-C', clone, 'commit', '-q', '-m', 'head']);
  let out = '';
  try {
    execFileSync('node', [CLI, '--cwd', clone, '--json'], { env: childEnv(), stdio: 'pipe', encoding: 'utf8' });
  } catch (error) { out = error.stdout; }
  assert.deepEqual(categories(JSON.parse(out).violations), ['src/a.ts:2:deferral']);
});

test('生成物ヘッダ: 文字列・正規表現内の DO NOT EDIT / @generated では免除しない（line-ref #63 の再現）', () => {
  const r = repoWith({ 'src/w.ts': 'export const warning = "DO NOT EDIT";\nexport const re = /@generated/;\n' }, {
    'src/w.ts': 'export const warning = "DO NOT EDIT";\nexport const re = /@generated/;\n// TODO: fix later\n',
  });
  assert.deepEqual(categories(r.violations), ['src/w.ts:3:deferral']);
  assert.deepEqual(r.skipped, []);
});

test('ライセンス免除はライセンス本文の行だけ: SPDX 行の下に足した TODO・説明と、新しいライセンスブロックの後ろに続けた説明は違反', () => {
  const r = repoWith({ 'src/l.ts': '// SPDX-License-Identifier: MIT\nexport const l = 1;\n' }, {
    'src/l.ts': '// SPDX-License-Identifier: MIT\n// TODO: fix later\nexport const l = 1;\n',
    'src/m.ts': '// Copyright (c) 2026 Example\n// Licensed under the MIT License.\n// increment the counter\nexport const m = 1;\n',
    'src/n.ts': '// Copyright (c) 2026 Example\n// All rights reserved.\nexport const n = 1;\n',
  });
  assert.deepEqual(categories(r.violations), ['src/l.ts:2:deferral', 'src/m.ts:3:explanation']);
  assert.deepEqual(r.allowed.map((a) => `${a.path}:${a.line}:${a.category}`), ['src/m.ts:1:license', 'src/n.ts:1:license']);
});

const MIT_LINES = [
  'MIT License',
  '',
  'Copyright (c) 2026 Example',
  '',
  'Permission is hereby granted, free of charge, to any person obtaining a copy',
  'of this software and associated documentation files (the "Software"), to deal',
  'in the Software without restriction, including without limitation the rights',
  'to use, copy, modify, merge, publish, distribute, sublicense, and/or sell',
  'copies of the Software, and to permit persons to whom the Software is',
  'furnished to do so, subject to the following conditions:',
  '',
  'The above copyright notice and this permission notice shall be included in all',
  'copies or substantial portions of the Software.',
  '',
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
  'IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,',
  'FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE',
  'AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER',
  'LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,',
  'OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE',
  'SOFTWARE.',
];

test('MIT の全文ヘッダ（// 行・/* */・# 行）はライセンスとして許可する', () => {
  const r = repoWith({}, {
    'src/line.ts': `${MIT_LINES.map((l) => (l ? `// ${l}` : '//')).join('\n')}\nexport const a = 1;\n`,
    'src/block.ts': `/*\n${MIT_LINES.map((l) => (l ? ` * ${l}` : ' *')).join('\n')}\n */\nexport const b = 1;\n`,
    'scripts/mit.py': `${MIT_LINES.map((l) => (l ? `# ${l}` : '#')).join('\n')}\nprint(1)\n`,
  });
  assert.deepEqual(categories(r.violations), []);
  assert.deepEqual(r.allowed.map((a) => `${a.path}:${a.category}`).sort(), ['scripts/mit.py:license', 'src/block.ts:license', 'src/line.ts:license']);
});

test('ツール指示の直下に足した TODO・説明は指示の例外を引き継がない（新規・既存どちらのブロックでも）', () => {
  const r = repoWith({ 'src/old.js': '// @ts-check\nexport const a = 1;\n' }, {
    'src/old.js': '// @ts-check\n// TODO: fix later\nexport const a = 1;\n',
    'src/new.js': '// @ts-check\n// TODO: fix later\n// explain the module\nexport const b = 1;\n',
  });
  assert.deepEqual(categories(r.violations).sort(), ['src/new.js:2:deferral', 'src/new.js:3:explanation', 'src/old.js:2:deferral']);
  assert.deepEqual(r.allowed.map((a) => `${a.path}:${a.line}:${a.category}`), ['src/new.js:1:directive']);
});

test('Python: 入れ子の関数の docstring も抽出する（line-ref #63 の再現）', () => {
  const r = repoWith({}, {
    'scripts/nest.py': 'def outer():\n    def _private():\n        """TODO: implement later"""\n        return 1\n    return _private()\n',
  });
  assert.deepEqual(categories(r.violations), ['scripts/nest.py:3:deferral']);
});

test('.d.ts の公開宣言の JSDoc は公開 API（line-ref #63 の再現）', () => {
  const r = repoWith({}, { 'src/api.d.ts': '/** Public ambient API. */\ndeclare function f(): void;\n' });
  assert.deepEqual(categories(r.violations), []);
  assert.deepEqual(r.allowed.map((a) => a.category), ['public-api-doc']);
});

test('Vue: ブロックの外のコメントは正規表現でなくパーサで取り、--!> で閉じたコメントも 1 件として扱う', () => {
  const r = repoWith({}, {
    'src/Top.vue': '<!-- top note --!>\n<template><p>x</p></template>\n<!-- between -->\n<script setup>\nconst s = "<!-- not a comment -->";\n</script>\n',
  });
  assert.deepEqual(r.violations.map((v) => `${v.line}:${v.category}:${v.text}`), ['1:explanation:<!-- top note --!>', '3:explanation:<!-- between -->']);
});

test('CLI: GitHub の注釈では、ファイル名の , や : をエスケープする', () => {
  const { dir, commit } = gitRepo();
  commit({ 'README.md': '# t\n' }, 'base');
  commit({ 'src/a,b:c.ts': 'let i = 0;\n// TODO: later\n' }, 'head');
  let out = '';
  try {
    execFileSync('node', [CLI, '--base', 'HEAD~1', '--cwd', dir], { env: childEnv({ GITHUB_ACTIONS: 'true' }), stdio: 'pipe', encoding: 'utf8' });
  } catch (error) { out = error.stderr; }
  assert.ok(out.includes('::error file=src/a%2Cb%3Ac.ts,line=2,endLine=2,title=comment-check deferral::'), out);
});

test('CLI: --json のときは標準出力が JSON だけになり、GitHub の注釈は標準エラーに出す', () => {
  const { dir, commit } = gitRepo();
  commit({ 'README.md': '# t\n' }, 'base');
  commit({ 'src/a.ts': 'let i = 0;\n// TODO: later\n' }, 'head');
  const summary = path.join(dir, 'summary.md');
  let error;
  try {
    execFileSync('node', [CLI, '--base', 'HEAD~1', '--cwd', dir, '--json'], { env: childEnv({ GITHUB_ACTIONS: 'true', GITHUB_STEP_SUMMARY: summary }), stdio: 'pipe', encoding: 'utf8' });
  } catch (e) { error = e; }
  assert.equal(error.status, 1);
  assert.deepEqual(categories(JSON.parse(error.stdout).violations), ['src/a.ts:2:deferral']);
  assert.match(error.stderr, /^::error file=src\/a\.ts,line=2,/m);
  assert.match(fs.readFileSync(summary, 'utf8'), /コメント検査: 不合格/);
});

test('CLI: 解析エラーも GitHub の注釈に出す', () => {
  const { dir, commit } = gitRepo();
  commit({ 'README.md': '# t\n' }, 'base');
  commit({ 'src/broken.ts': 'export const = ;\n' }, 'head');
  let error;
  try {
    execFileSync('node', [CLI, '--base', 'HEAD~1', '--cwd', dir], { env: childEnv({ GITHUB_ACTIONS: 'true' }), stdio: 'pipe', encoding: 'utf8' });
  } catch (e) { error = e; }
  assert.equal(error.status, 1);
  assert.match(error.stderr, /^::error file=src\/broken\.ts,title=comment-check parse-error::/m);
});

test('禁止内容（TODO・ワークアラウンド）は、制約マーカー・公開 API の JSDoc・ライセンス・ツール指示・docstring のどの例外よりも先に判定する', () => {
  const r = repoWith({}, {
    'src/inv.ts': 'export const a = 1;\n/* INVARIANT: callback must run on the main thread.\n * TODO: fix later\n */\nexport const b = 2;\n',
    'src/api.ts': '/** TODO: implement later */\nexport function f() { return 1; }\n/** Returns two; workaround for a bug in the upstream parser. */\nexport function g() { return 2; }\n',
    'src/lic.ts': '/* Copyright (c) 2026 Example. TODO: pick a license */\nexport const c = 3;\n',
    'src/dir.ts': '// @ts-check TODO remove this later\nexport const d = 4;\n',
    'src/sup.ts': 'export const e = 5; // eslint-disable-line no-console -- EXTERNAL: upstream bug, TODO remove\n',
    'scripts/doc.py': 'def public():\n    """TODO: document this"""\n    return 1\n',
  });
  assert.deepEqual(categories(r.violations).sort(), [
    'scripts/doc.py:2:deferral', 'src/api.ts:1:deferral', 'src/api.ts:3:workaround',
    'src/dir.ts:1:deferral', 'src/inv.ts:2:deferral', 'src/lic.ts:1:deferral', 'src/sup.ts:1:deferral',
  ]);
  assert.deepEqual(r.allowed, []);
});

test('ツール指示は本文全体が指示の形のときだけ許可し、説明文に指示の語を混ぜても通さない', () => {
  const r = repoWith({}, {
    'src/ok.ts': '// @ts-check\n/// <reference types="node" />\nexport const a = /* @__PURE__ */ make();\nconst m = import(/* webpackChunkName: "x" */ "./x");\n// prettier-ignore\nexport const b = [1,2];\nfunction make() { return m; }\n',
    'src/smuggle.ts': '// We keep this formatting on purpose because the table is aligned. prettier-ignore\nexport const t = [1,2];\n// explain the module, also @ts-check is enabled\nexport const u = 1;\n',
  });
  assert.deepEqual(r.allowed.map((a) => `${a.path}:${a.line}:${a.category}`), ['src/ok.ts:1:directive', 'src/ok.ts:2:directive', 'src/ok.ts:3:directive', 'src/ok.ts:4:directive', 'src/ok.ts:5:directive']);
  assert.deepEqual(categories(r.violations), ['src/smuggle.ts:1:explanation', 'src/smuggle.ts:3:explanation']);
});

test('ライセンスの /* */ ブロックで、本文の後ろに続けた説明は例外にしない', () => {
  const r = repoWith({}, {
    'src/a.ts': '/*\n * Copyright (c) 2026 Example\n * SPDX-License-Identifier: MIT\n *\n * This module parses the config and caches it per workspace.\n */\nexport const a = 1;\n',
    'src/b.ts': '/*\n * Copyright (c) 2026 Example\n * SPDX-License-Identifier: MIT\n */\nexport const b = 1;\n',
  });
  assert.deepEqual(categories(r.violations), ['src/a.ts:1:explanation']);
  assert.deepEqual(r.allowed.map((a) => `${a.path}:${a.category}`), ['src/b.ts:license']);
});

test('ライセンス判定と本文判定の条件は同じ: (c) 2026 の次に // MIT が続いても落ちずにライセンスとして扱う（youtublur #278）', () => {
  const r = repoWith({}, {
    'src/c.ts': '// (c) 2026 Example Author\n// MIT\nexport const c = 1;\n',
    'src/d.ts': '// © 2026 Example Author\n// Licensed MIT\n// explain the module\nexport const d = 1;\n',
  });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.allowed.map((a) => `${a.path}:${a.line}:${a.endLine}:${a.category}`), ['src/c.ts:1:2:license', 'src/d.ts:1:2:license']);
  assert.deepEqual(categories(r.violations), ['src/d.ts:3:explanation']);
});

test('検査の無効化コメントの取りこぼしがない（stylelint・pragma: no cover・mypy・pyright・NOLINT・yamllint・hadolint）', () => {
  const r = repoWith({}, {
    'a.css': '/* stylelint-disable */\n.a { color: red; }\n',
    'scripts/p.py': 'x = 1  # pragma: no cover\n# mypy: ignore-errors\ny = 2  # pyright: ignore\n',
    'src/n.ts': 'export const z = 1; // NOLINT\n',
    'ci.yml': '# yamllint disable rule:line-length\nname: x\n',
    'run.sh': '# hadolint ignore=DL3008\necho hi\n',
  });
  assert.deepEqual(r.violations.map((v) => `${v.path}:${v.line}:${v.category}`).sort(), [
    'a.css:1:suppression', 'ci.yml:1:suppression', 'run.sh:1:suppression',
    'scripts/p.py:1:suppression', 'scripts/p.py:2:suppression', 'scripts/p.py:3:suppression', 'src/n.ts:1:suppression',
  ]);
});

test('「あとで」は先送りの言い回しのときだけ TODO 扱いにし、説明の中の「あとで呼ぶ」は先送りにしない', () => {
  const r = repoWith({}, {
    'src/j.ts': '/** 初期化はあとで呼ぶ init() で行う公開関数。 */\nexport function setup() { return 1; }\n// あとで直す\nexport const x = 1;\n',
  });
  assert.deepEqual(categories(r.violations), ['src/j.ts:3:deferral']);
  assert.deepEqual(r.allowed.map((a) => a.category), ['public-api-doc']);
});

test('既存と同じ文面のコメントを増やしても、増えた分は新規として検査する', () => {
  const r = repoWith({ 'src/dup.ts': '// TODO: fix later\nexport const a = 1;\n' }, {
    'src/dup.ts': '// TODO: fix later\nexport const a = 1;\n// TODO: fix later\nexport const b = 2;\n',
  });
  assert.deepEqual(categories(r.violations), ['src/dup.ts:3:deferral']);
});

test('既存と同じ文面のコメントを移動しただけなら新規にしない（件数が増えていなければ）', () => {
  const r = repoWith({ 'src/mv.ts': '// TODO: fix later\nexport const a = 1;\nexport const b = 2;\n' }, {
    'src/mv.ts': 'export const a = 1;\n// TODO: fix later\nexport const b = 2;\n',
  });
  assert.deepEqual(r.violations, []);
});

test('設定（.comment-check.json）は PR 側でなく基準側から読み、PR で exclude を広げても検査を外せない', () => {
  const { dir, commit } = gitRepo();
  commit({ 'README.md': '# t\n', '.comment-check.json': '{}\n' }, 'base');
  commit({ '.comment-check.json': '{"exclude": ["**"], "unsupported": "warn"}\n', 'src/a.ts': 'let i = 0;\n// TODO: later\n', 'src/b.kt': 'fun main() {}\n' }, 'head');
  const r = checkDiff({ cwd: dir, base: 'HEAD~1', head: 'HEAD' });
  assert.deepEqual(categories(r.violations), ['src/a.ts:2:deferral']);
  assert.deepEqual(r.unsupported.map((u) => u.path), ['src/b.kt']);
  assert.equal(r.ok, false);
  assert.equal(r.configChanged, true);
});

test('既存ファイルにこの PR で生成物ヘッダを足しても、ファイルを丸ごと飛ばさない', () => {
  const r = repoWith({ 'src/hand.ts': 'export const a = 1;\n' }, {
    'src/hand.ts': '// @generated\nexport const a = 1;\n// TODO: later\n',
  });
  assert.deepEqual(r.skipped, []);
  assert.deepEqual(categories(r.violations), ['src/hand.ts:1:generated-header-added', 'src/hand.ts:3:deferral']);
});

test('TSX の {/* */} とテンプレートリテラルの ${ /* */ } の中のコメントも取り出す', () => {
  const r = repoWith({}, {
    'src/V.tsx': 'export const V = () => (\n  <div>\n    {/* explain the layout */}\n    <p>{`a ${/* inline */ 1}`}</p>\n  </div>\n);\n',
  });
  assert.deepEqual(categories(r.violations), ['src/V.tsx:3:explanation', 'src/V.tsx:4:explanation']);
});

test('CRLF のファイルでも行の位置と制約マーカーの判定がずれない', () => {
  const r = repoWith({}, {
    'ci.yml': 'name: x\r\n# INVARIANT: the job name is referenced by the ruleset\r\non: push\r\n# explain\r\n',
    'src/w.ts': 'export const a = 1;\r\n// SECURITY: never log the raw token value here\r\nexport const b = 2;\r\n// explain\r\n',
  });
  assert.deepEqual(r.allowed.map((a) => `${a.path}:${a.line}:${a.category}`), ['ci.yml:2:constraint:invariant', 'src/w.ts:2:constraint:security']);
  assert.deepEqual(categories(r.violations), ['ci.yml:4:explanation', 'src/w.ts:4:explanation']);
});

test('拡張子のないスクリプトは shebang で言語を決めて検査する（検査対象から漏らさない）', () => {
  const r = repoWith({}, {
    'bin/run': '#!/usr/bin/env bash\n# explain\necho hi\n',
    'bin/tool': '#!/usr/bin/env python3\n# explain\nprint(1)\n',
    'bin/cli': '#!/usr/bin/env node\n// explain\nconsole.log(1);\n',
    'LICENSE': 'MIT\n',
  });
  assert.deepEqual(categories(r.violations), ['bin/cli:2:explanation', 'bin/run:2:explanation', 'bin/tool:2:explanation']);
  assert.ok(r.notApplicable.includes('LICENSE'));
});

test('CLI: 設定が壊れているなど実行自体に失敗したら、終了コード 2 と注釈で知らせる（黙って通さない）', () => {
  const { dir, commit } = gitRepo();
  commit({ '.comment-check.json': '{ broken\n' }, 'base');
  commit({ 'src/a.ts': 'export const a = 1;\n' }, 'head');
  let error;
  try {
    execFileSync('node', [CLI, '--base', 'HEAD~1', '--cwd', dir], { env: childEnv({ GITHUB_ACTIONS: 'true' }), stdio: 'pipe', encoding: 'utf8' });
  } catch (e) { error = e; }
  assert.equal(error?.status, 2);
  assert.match(error.stderr, /^::error title=comment-check crashed::\.comment-check\.json/m);
});

test('設定: 基準側に .comment-check.json がない導入 PR だけ head 側の設定を使い、基準側にあれば基準側を使う', () => {
  const intro = gitRepo();
  intro.commit({ 'README.md': '# t\n' }, 'base');
  intro.commit({ '.comment-check.json': '{"exclude": ["vendor/**"], "unsupported": "warn"}\n', 'vendor/x.ts': '// TODO: vendored\n', 'src/b.kt': 'fun main() {}\n' }, 'intro');
  const first = checkDiff({ cwd: intro.dir, base: 'HEAD~1', head: 'HEAD' });
  assert.equal(first.configSource, 'head');
  assert.equal(first.configChanged, false);
  assert.deepEqual(first.violations, []);
  assert.deepEqual(first.unsupported.map((u) => u.path), ['src/b.kt']);
  assert.equal(first.ok, true);
  intro.commit({ '.comment-check.json': '{"exclude": ["vendor/**", "src/**"], "unsupported": "warn"}\n', 'src/a.ts': '// TODO: later\n' }, 'widen');
  const later = checkDiff({ cwd: intro.dir, base: 'HEAD~1', head: 'HEAD' });
  assert.equal(later.configSource, 'base');
  assert.equal(later.configChanged, true);
  assert.deepEqual(categories(later.violations), ['src/a.ts:1:deferral']);
});
