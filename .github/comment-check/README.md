# comment-check（試作）

PR で追加・変更されたコメントだけを、言語別のパーサで取り出して検査する。指示書 2.1 と 5 節「コメント規約の検査」の試作。

```bash
npm ci
node src/cli.mjs                               # 差分モード。基準は origin/HEAD（リモートの既定ブランチ。なければ git remote set-head origin --auto）。違反・解析エラー・未対応言語があれば終了コード 1
node src/cli.mjs --base <ref> --json           # 基準を指定し、結果を JSON で
node src/cli.mjs --density                     # 全ファイルのコメント量（目安の計測用）
npm test                                       # 違反例と合格例のテスト
```

シェルの検査には mvdan/sh の `shfmt` が要る（`COMMENT_CHECK_SHFMT` でパス指定、なければ PATH の `shfmt`）。テストは `test/helpers/shfmt.mjs` の `resolveShfmt` で shfmt を探す。`COMMENT_CHECK_SHFMT` があればそれを使い、なければ実在する場合に限り comment-check 直下の `.bin/shfmt`、次にリポジトリ直下の `.bin/shfmt`（`.github/comment-check/` に置いたとき）を使い、どちらもなければ PATH の `shfmt` を使う。ローカル用のバイナリは v3.14.1、sha256 `76e77641faa025814b77f153b29796b8e6fa2fca03e0c76a691608b86c7ea7bf`、git 管理外。CI では公式リリースの `shfmt_v3.14.1_linux_amd64` を取ってきて、上の sha256 を `sha256sum --check` で照合してから使う（`common/.github/workflows/quality.yml.example`）。mvdan/sh のリリースには公式のチェックサムファイルがないため、GitHub がリリース資産に付ける digest と、取ってきた実物の sha256 が一致することを確かめて固定した。

ワークフローの actions は、SHA 直書き（`uses: x@<40桁SHA> # vX.Y.Z`）か、タグ＋`actions.lock`（`gh actions-lock verify` で同じ SHA に固定されていることを確かめる）のどちらでもよい。雛形は SHA 直書き。youtublur・vscode-line-ref-copy・me はタグ＋actions.lock の運用なので、そのリポジトリの書き方に合わせる。

## 「追加・変更されたコメント」の判定

1. `git diff base...head` で変わったファイルと追加行を取る（リネームは追跡）。
2. head 側のファイルをパーサにかけてコメントを全部取り出す。
3. 追加行に1行でもかかり、かつ同じ文面のコメントが base と head の merge-base 側のファイルにないものだけを対象にする（`git diff base...head` と同じ基準。既定ブランチが先に進んでいても比べる相手がずれない）。文面を変えずに移動しただけのコメント、コードだけ変えた行の既存コメントは対象外。
4. 連続した行コメント（`//` や `#` だけの行が続くもの）はブロックとして扱う。
   - ブロック全体がこの PR で追加されたときだけ、先頭行のライセンス表記・制約マーカーがブロック全体に効く。制約マーカーの理由は次の行以降に書いてもよい。ライセンスは、ライセンス本文らしい語（copyright・license・warranty・liability・permission・AS IS・`SOFTWARE.` など）を含む最後の行までをライセンスとして扱い、その後ろに続けた行は1行ずつ分類する（MIT・Apache の全文ヘッダは通り、後ろに足した説明は違反になる。語による目安なので、本文の最後の行がこれらを含まないライセンスは制約マーカーか `exclude` で扱う）。
   - 既存のブロックに行を足した・書き換えたときは、足した行だけを1行ずつ分類する（既存のライセンス行や制約コメントの下に足した説明は例外にならない）。
   - TODO・ワークアラウンド・理由のない検査無効化の行は、どのブロックの中でも引き継がずに違反にする。検査無効化の理由は同じ行に書く。
5. ファイルを生成物として丸ごと飛ばすのは、ファイル冒頭のコメント（前にコードがないもの）に `@generated` / `DO NOT EDIT` があるときだけ。文字列リテラルや途中のコメントにあっても飛ばさない。

## 言語ごとの方式

| 言語・ファイル | 方式 | 文字列・URL の誤検出 | 状態 |
|---|---|---|---|
| TS / JS / TSX / JSX / MJS / CJS | TypeScript コンパイラ API（5.9.3）で構文木を作り、全トークンの前後の trivia からコメントを取る。JSX テキストは除外。構文エラーは失敗扱い。エクスポートしたクラスでも `private` / `#name` のメンバーは公開 API に数えない | 文字列・テンプレートリテラル・正規表現・JSX テキストはパーサがトークンとして扱うので拾わない（テスト済み） | 試作済み・テスト済み |
| JSON / JSONC（tsconfig など） | TypeScript の `parseJsonText` | 同上 | 試作済み・テスト済み |
| Vue SFC | `@vue/compiler-sfc` でブロックに分け、script は TS 方式、template はコンパイラ AST のコメントノード、style は `lang` に合わせて CSS／SCSS／LESS 方式 | 属性値・テキストの `//` は拾わない（テスト済み） | 試作済み・テスト済み。`<style lang="sass"/"stylus">`、`<template lang="pug">`、`<script lang>` が js/jsx/ts/tsx 以外、カスタムブロック（`<i18n>` など）は未対応言語として失敗 |
| HTML | parse5（HTML 仕様準拠パーサ）のコメントノード。インライン `<script>`（JS の type）は TS 方式、JSON 系の type（`application/ld+json`、`importmap` など）は JSON 方式、`<style>` は CSS 方式 | テキストや属性の `//` は拾わない（テスト済み） | 試作済み・テスト済み。それ以外の type（`text/x-template` など）は未対応言語として失敗 |
| CSS | postcss 8.5.33 のパーサ | 文字列・引用符なしの `url(...)`・エスケープ内の `/*` は拾わない（テスト済み） | 試作済み・テスト済み |
| SCSS / LESS | postcss-scss 4.0.9 / postcss-less 7.1.1（版固定）。`//` の行コメントも取る | 同上 | 試作済み・テスト済み。Sass のインデント記法（.sass）と Stylus は未対応言語として失敗 |
| YAML（GitHub Actions など） | `yaml`（eemeli/yaml）の Lexer のコメントトークン | 引用符内の `#`、ブロックスカラー（`run: \|`）内の `#` は拾わない（テスト済み） | 試作済み・テスト済み。ただし `run:` 内のシェルのコメントは YAML から見ると文字列なので検査しない |
| Python | 標準ライブラリの `tokenize`（COMMENT トークン）と `ast`（docstring と、コメント代わりの裸の文字列文） | 文字列内の `#` は拾わない（テスト済み） | 試作済み・テスト済み。入れ子の関数・クラス、`if` などの下の定義も辿る。関数の中で定義したものは非公開扱い。切り出しは `ast.get_source_segment`（ast の位置は UTF-8 のバイト数なので自前で切らない。日本語・改ページ・U+2028 を含むテスト済み） |
| シェル（.sh / .bash） | `shfmt --to-json` の構文木のコメント | 文字列・ヒアドキュメント内の `#` は拾わない（テスト済み） | 試作済み・テスト済み。shfmt がないと解析エラーで失敗する |
| Markdown（zenn の記事、docs） | 非適用 | ― | 記事・文書そのものが文章で、コード例は本文の一部。コメント規約の対象外とする |
| C#（clipboard-sync の Windows 側） | 予定：Roslyn（Microsoft.CodeAnalysis.CSharp）で `SyntaxTree` の trivia から SingleLine/MultiLine/Documentation コメントを取る小さな dotnet ツール。public/protected メンバーの `///` を公開 API 文書として許可 | Roslyn が文字列・verbatim・補間・raw 文字列を正しく扱う | **未作成**。box に dotnet がなく試せていない。いまは「未対応言語」として CI を失敗させる |
| Kotlin（clipboard-sync の Android 側） | 予定：Kotlin コンパイラの PSI（kotlin-compiler-embeddable）で PsiComment / KDoc を取る JVM ツール。公開宣言の KDoc を許可 | PSI が文字列テンプレート・raw 文字列・入れ子コメントを扱う | **未作成**。同上 |
| toml・xml・ini など設定ファイル | 未検査として一覧に出すが失敗にはしない | ― | 方針として対象外 |

## 許す例外

TODO 等の先送りとワークアラウンドは、下のどの例外よりも先に判定する（制約マーカー付き・公開 API の JSDoc・ライセンス・ツール指示の中に書いても違反）。

| 分類 | 判定 |
|---|---|
| `license` | ファイル冒頭のコメントにある `SPDX-License-Identifier:`、`Copyright`、`©`、`(c) 2026`（途中のコメントは対象外） |
| `public-api-doc` | エクスポートした宣言（`export { api }` や `export default main` で後から公開したものを含む。クラス・インターフェース・enum のメンバーを含む。`private` / `#name` は除く）の直前の `/** */`、宣言ファイル（`.d.ts` / `.d.mts` / `.d.cts` / `.d.css.ts` など。実際のファイル名で TypeScript が判定）の JSDoc、Python の公開関数・クラス・メソッド（入れ子の公開クラスを含む）の docstring |
| `constraint:invariant` / `constraint:security` / `constraint:external` | 本文が `INVARIANT:` / `SECURITY:` / `EXTERNAL:` で始まり、理由が 8 文字以上 |
| `directive` | shebang、`/// <reference>`、`@vite-ignore`、`#__PURE__`、`prettier-ignore`、`@jsx...`、`@ts-check`、`yaml-language-server:` など。本文全体が指示の形のときだけ（説明文に指示の語を混ぜても通らない） |
| `generated` | ファイル冒頭のコメントにある `@generated`、`DO NOT EDIT`、`auto-generated`。あればファイルごと対象外。途中のコメントや文字列リテラルは対象外 |
| `action-pin` | `uses: x@<40桁SHA>` の行の `# v1.2.3` |
| `suppression-with-reason` | `eslint-disable`、`@ts-ignore`、`noqa` などに、同じコメント内で `EXTERNAL:` などの理由が付いているもの。通すがレビュー対象として必ず一覧に出す |

違反の分類：`explanation`（説明）、`deferral`（TODO・FIXME 等）、`workaround`（暫定・回避策等）、`suppression`（理由なしの検査無効化）、`constraint-without-reason`（マーカーだけで理由が短い）。

## 出力

- 標準出力：違反・許可した例外・未対応・解析エラーを1行ずつ（`--json` のときは JSON だけ）
- GitHub Actions 上：違反・解析エラーに `::error`、未対応言語に `::error` か `::warning` のアノテーションを標準エラーに出す（runner は標準エラーのワークフローコマンドも処理する）
- 終了コード：0 合格、1 違反・解析エラー・未対応言語あり、2 実行自体の失敗（設定の JSON が壊れているなど）
- `GITHUB_STEP_SUMMARY`：違反と「許可した例外（レビュー対象）」の表。リーダー bot はこの表で例外コメントをレビューする

## 設定（リポジトリ直下の `.comment-check.json`）

```json
{ "exclude": ["追加の除外 glob"], "generated": ["生成物の glob"], "unsupported": "fail" }
```

設定は基準（merge-base）側のものを使う。PR で設定を変えても、その PR の検査は変更前の設定で行い、変更はマージ後に効く（変わっていれば注釈とサマリで知らせる）。基準側に設定がないとき（導入 PR）だけ head 側の設定を使う。

既定の除外：`node_modules`、`dist`、`out`、`coverage`、`*.min.js`、ロックファイル、`.claude/skills/**`、`.agents/skills/**`、`.rulesync/skills/**`（外部から採用したスキルの原文）。`unsupported` は未対応言語のファイルが変わったときの扱いで、既定は `fail`。

## 既知の限界

- 「同じ文面のコメントが base にあれば対象外」は集合で比べているので、同じ文面のコメントをもう1つ増やしたときは見逃す。
- 公開 API の判定は「エクスポートしているか」で行う。VS Code 拡張や Chrome 拡張のように外部に公開 API がないリポジトリでは、エクスポートした内部モジュールの JSDoc も通る。厳しくするならリポジトリ設定で `public-api-doc` を無効にする案がある（未実装）。
- TypeScript 5.9.3 のパーサで解析する。vscode-line-ref-copy は TypeScript 7 を使うが、現行のファイルはすべて解析できた（構文エラー 0）。TS 6/7 だけの新構文が入ると解析エラーで失敗する（黙って通さない）。
- 実リポジトリでの空打ち（0.2.3、2026-11-17 JST、6 リポの全ファイルと 2026-10-27 以降の差分）で、解析エラー 0 件、未対応言語 0 件（シェルは shfmt ありの場合）。

変更履歴は `CHANGELOG.md`。
