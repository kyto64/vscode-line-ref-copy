# comment-check（試作）

PR で追加・変更されたコメントだけを、言語別のパーサで取り出して検査する。指示書 2.1 と 5 節「コメント規約の検査」の試作。

```bash
npm ci
node src/cli.mjs --base origin/main            # 差分モード。違反・解析エラー・未対応言語があれば終了コード 1
node src/cli.mjs --base origin/main --json     # 結果を JSON で
node src/cli.mjs --density                     # 全ファイルのコメント量（目安の計測用）
npm test                                       # 違反例と合格例のテスト（18 件）
```

シェルの検査には mvdan/sh の `shfmt` が要る（`COMMENT_CHECK_SHFMT` でパス指定、なければ PATH の `shfmt`）。テストはリポジトリ直下の `.bin/shfmt`（v3.14.1、sha256 `76e77641faa025814b77f153b29796b8e6fa2fca03e0c76a691608b86c7ea7bf`、git 管理外）を使う。CI では `go install mvdan.cc/sh/v3/cmd/shfmt@v3.14.1`（Go のチェックサム DB で検証される）か、上の sha256 で照合したバイナリを使う。

## 「追加・変更されたコメント」の判定

1. `git diff base...head` で変わったファイルと追加行を取る（リネームは追跡）。
2. head 側のファイルをパーサにかけてコメントを全部取り出す。
3. 追加行に1行でもかかり、かつ同じ文面のコメントが base 側のファイルにないものだけを対象にする。文面を変えずに移動しただけのコメント、コードだけ変えた行の既存コメントは対象外。
4. 連続した行コメント（`//` や `#` だけの行が続くもの）は1つのブロックとして分類する。マーカーは先頭行に書けばブロック全体に効く。

## 言語ごとの方式

| 言語・ファイル | 方式 | 文字列・URL の誤検出 | 状態 |
|---|---|---|---|
| TS / JS / TSX / JSX / MJS / CJS | TypeScript コンパイラ API（5.9.3）で構文木を作り、全トークンの前後の trivia からコメントを取る。JSX テキストは除外。構文エラーは失敗扱い | 文字列・テンプレートリテラル・正規表現・JSX テキストはパーサがトークンとして扱うので拾わない（テスト済み） | 試作済み・テスト済み |
| JSON / JSONC（tsconfig など） | TypeScript の `parseJsonText` | 同上 | 試作済み・テスト済み |
| Vue SFC | `@vue/compiler-sfc` でブロックに分け、script は TS 方式、template はコンパイラ AST のコメントノード、style は CSS 方式 | 属性値・テキストの `//` は拾わない（テスト済み） | 試作済み・テスト済み |
| HTML | parse5（HTML 仕様準拠パーサ）のコメントノード。インライン `<script>` は TS 方式、`<style>` は CSS 方式 | テキストや属性の `//` は拾わない（テスト済み） | 試作済み・テスト済み |
| CSS | 文字列を読み飛ばす字句解析（CSS のコメントは `/* */` だけで、文法上これで足りる） | 文字列内の `/*` は拾わない（テスト済み） | 試作済み・テスト済み |
| YAML（GitHub Actions など） | `yaml`（eemeli/yaml）の Lexer のコメントトークン | 引用符内の `#`、ブロックスカラー（`run: \|`）内の `#` は拾わない（テスト済み） | 試作済み・テスト済み。ただし `run:` 内のシェルのコメントは YAML から見ると文字列なので検査しない |
| Python | 標準ライブラリの `tokenize`（COMMENT トークン）と `ast`（docstring） | 文字列内の `#` は拾わない（テスト済み） | 試作済み・テスト済み |
| シェル（.sh / .bash） | `shfmt --to-json` の構文木のコメント | 文字列・ヒアドキュメント内の `#` は拾わない（テスト済み） | 試作済み・テスト済み。shfmt がないと解析エラーで失敗する |
| Markdown（zenn の記事、docs） | 非適用 | ― | 記事・文書そのものが文章で、コード例は本文の一部。コメント規約の対象外とする |
| C#（clipboard-sync の Windows 側） | 予定：Roslyn（Microsoft.CodeAnalysis.CSharp）で `SyntaxTree` の trivia から SingleLine/MultiLine/Documentation コメントを取る小さな dotnet ツール。public/protected メンバーの `///` を公開 API 文書として許可 | Roslyn が文字列・verbatim・補間・raw 文字列を正しく扱う | **未作成**。box に dotnet がなく試せていない。いまは「未対応言語」として CI を失敗させる |
| Kotlin（clipboard-sync の Android 側） | 予定：Kotlin コンパイラの PSI（kotlin-compiler-embeddable）で PsiComment / KDoc を取る JVM ツール。公開宣言の KDoc を許可 | PSI が文字列テンプレート・raw 文字列・入れ子コメントを扱う | **未作成**。同上 |
| toml・xml・ini など設定ファイル | 未検査として一覧に出すが失敗にはしない | ― | 方針として対象外 |

## 許す例外

| 分類 | 判定 |
|---|---|
| `license` | `SPDX-License-Identifier:`、`Copyright`、`©`、`(c) 2026` |
| `public-api-doc` | エクスポートした宣言（クラス・インターフェース・enum のメンバーを含む）の直前の `/** */`、`.d.ts` の JSDoc、Python の公開関数・クラス・メソッドの docstring |
| `constraint:invariant` / `constraint:security` / `constraint:external` | 本文が `INVARIANT:` / `SECURITY:` / `EXTERNAL:` で始まり、理由が 8 文字以上 |
| `directive` | shebang、`/// <reference>`、`@vite-ignore`、`#__PURE__`、`prettier-ignore`、`@jsx...`、`@ts-check`、`yaml-language-server:` など |
| `generated` | `@generated`、`DO NOT EDIT`。ファイル冒頭 5 行にあればファイルごと対象外 |
| `action-pin` | `uses: x@<40桁SHA>` の行の `# v1.2.3` |
| `suppression-with-reason` | `eslint-disable`、`@ts-ignore`、`noqa` などに、同じコメント内で `EXTERNAL:` などの理由が付いているもの。通すがレビュー対象として必ず一覧に出す |

違反の分類：`explanation`（説明）、`deferral`（TODO・FIXME 等）、`workaround`（暫定・回避策等）、`suppression`（理由なしの検査無効化）、`constraint-without-reason`（マーカーだけで理由が短い）。

## 出力

- 標準出力：違反・許可した例外・未対応・解析エラーを1行ずつ
- GitHub Actions 上：違反行に `::error` アノテーション
- `GITHUB_STEP_SUMMARY`：違反と「許可した例外（レビュー対象）」の表。リーダー bot はこの表で例外コメントをレビューする

## 設定（リポジトリ直下の `.comment-check.json`）

```json
{ "exclude": ["追加の除外 glob"], "generated": ["生成物の glob"], "unsupported": "fail" }
```

既定の除外：`node_modules`、`dist`、`out`、`coverage`、`*.min.js`、ロックファイル、`.claude/skills/**`、`.agents/skills/**`、`.rulesync/skills/**`（外部から採用したスキルの原文）。`unsupported` は未対応言語のファイルが変わったときの扱いで、既定は `fail`。

## 既知の限界

- 「同じ文面のコメントが base にあれば対象外」は集合で比べているので、同じ文面のコメントをもう1つ増やしたときは見逃す。
- 公開 API の判定は「エクスポートしているか」で行う。VS Code 拡張や Chrome 拡張のように外部に公開 API がないリポジトリでは、エクスポートした内部モジュールの JSDoc も通る。厳しくするならリポジトリ設定で `public-api-doc` を無効にする案がある（未実装）。
- TypeScript 5.9.3 のパーサで解析する。vscode-line-ref-copy は TypeScript 7 を使うが、現行のファイルはすべて解析できた（構文エラー 0）。TS 6/7 だけの新構文が入ると解析エラーで失敗する（黙って通さない）。
- 実リポジトリでの空打ち（2026-10-27 以降の差分）で、解析エラーは 0 件（シェルは shfmt ありの場合）。
