# 変更履歴

## 0.2.3（2026-11-17 JST）

clipboard-sync #6 の CI 失敗と Codex P2、youtublur #278 の Codex P2 への対応に加え、免除・抽出・位置計算・CLI 出力・git 基準の各経路を見直して見つけた穴を直した。どれも先に回帰テストを書き、0.2.2 で落ちる（または落ちる理由になる）ことを確かめてから直した。

### 指摘への対応

- **CI で `--json` が壊れる**（cli.mjs、clipboard-sync #6 の Actions run 44047100338）：`GITHUB_ACTIONS=true` のとき、`--json` の出力の後ろに `::error` 注釈を標準出力へ足していたため JSON として読めなかった。注釈は常に標準エラーに出す。GitHub の runner（actions/runner の ScriptHandler）は `run:` の標準出力と標準エラーの両方をワークフローコマンドとして処理するので、注釈はそのまま効く。
- **テストが CI の環境変数に依存**（test/check.test.mjs）：子プロセスに `GITHUB_*`・`RUNNER_*`・`ACTIONS_*`・`CI` を引き継いでいたため、CI 上で結果が変わり、実際のステップサマリにもテストの結果を書き込んでいた。子プロセスの環境からこれらを外す。テスト用の git も、利用者の git 設定（署名の強制など）と `GIT_DIR` などに影響されないようにした。`GITHUB_ACTIONS=true GITHUB_STEP_SUMMARY=<tmp>` を付けても全件合格し、サマリに何も書かないことを確かめた。
- **禁止内容の判定順**（rules.mjs、clipboard-sync #6）：制約マーカー・公開 API の JSDoc・ライセンス・ツール指示・理由付きの無効化の免除が TODO より先に返っていたため、`/* INVARIANT: …\n * TODO: … */` や `/** TODO: … */` が通っていた。TODO 等の先送りとワークアラウンドを、すべての免除より先に判定する。
- **ライセンス判定の条件のずれ**（rules.mjs / check.mjs、youtublur #278）：ブロックをライセンスと判定する条件（`(c) 2026` を含む）と、本文の最後の行を探す条件（`LICENSE_TEXT`）が別々で、`// (c) 2026 Example Author` ＋ `// MIT` で本文が 0 行になり `TypeError` で検査全体が落ちた。条件を `isLicenseLine` / `licenseNoticeLength` の 1 か所にまとめ、本文の行数が 0 なら通常の分類に回す。`MIT` などのライセンス名だけの行もライセンス本文として扱う。

### 自分で見直して見つけた穴

- **免除**
  - ツール指示（rules.mjs）：`prettier-ignore`・`@ts-check` などの語を本文のどこかに含めば説明文ごと許可していた。本文全体が指示の形のときだけ許可する。`#region` も `#` 付きに限る。
  - ライセンスの `/* */` ブロック（rules.mjs）：ライセンス本文の後ろに続けた説明まで許可していた。本文の最後の行より後ろに文があれば説明として違反にする。
  - 生成物ヘッダ（check.mjs）：既存の手書きファイルにこの PR で `// @generated` を足すと、ファイル全体を飛ばしていた。基準側で生成物でなかったファイルは飛ばさず、足したヘッダを `generated-header-added` として違反にする。
  - 設定（check.mjs / cli.mjs）：`.comment-check.json` を作業ツリーから読んでいたため、PR で `exclude: ["**"]` や `unsupported: "warn"` を足せば検査を外せた。merge-base 側の設定で検査し、設定が変わっていれば注釈とサマリで知らせる（変更はマージ後に効く）。
  - 無効化コメントの取りこぼし（rules.mjs）：`stylelint-disable`・`yamllint disable`・`# pragma: no cover`・`# mypy: ignore-errors`・`# pyright: ignore`・`NOLINT`・`hadolint ignore` を無効化として扱う。
  - 誤検知（rules.mjs）：「あとで」を含むだけで先送り扱いにしていた（「あとで呼ぶ init()」など）。「あとで直す」「後で対応」などの言い回しに限る。ワークアラウンドの「一時的」「hack」も、「一時的な対応」「hack / hacky」に限る（「一時ファイル」「hackathon」を違反にしない）。
- **git 基準**：既存と同じ文面のコメント（例：`// TODO: fix later`）を増やしても、文面が基準側にあるだけで新規扱いにならなかった。文面ごとの件数で比べ、増えた分を新規として検査する（移動しただけなら新規にしない）。
- **抽出**：拡張子のないスクリプト（`bin/run` など）は検査対象外だった。shebang で sh / bash / python / node を判定して検査し、それ以外のインタプリタは未対応言語として扱う。
- **例外で全体が落ちる箇所**：ファイルごとの検査を try で囲み、想定外の例外はそのファイルの解析エラーとして報告して、ほかのファイルの検査を続ける。全体の失敗（設定の JSON が壊れているなど）は終了コード 2 と `::error title=comment-check crashed` で知らせる。Python の docstring の位置が取れない場合、Vue・シェルの位置情報がない場合の undefined 参照を塞いだ。密度計測でディレクトリ（サブモジュール）を読もうとして落ちるのを避けた。
- **CLI 出力**：解析エラーも `::error` 注釈に出す。
- 確かめて問題がなかったもの：TSX の `{/* */}` とテンプレートリテラル内のコメントの抽出、CRLF のファイルでの行位置とマーカー判定（回帰テストにした）。

- 設定の出どころ：基準側に `.comment-check.json` がないとき（導入 PR）だけ head 側の設定を使う。基準側にあれば基準側を使い、変更は注釈とサマリで知らせる。結果の `configSource`（`base` / `head` / `default`）で、どれを使ったかが分かる。

### 導入 PR の模擬

6 clone それぞれで、既定ブランチの先頭を基準にして、導入 PR（clipboard-sync #6、youtublur #278、vscode-line-ref-copy #63、me #146、vscode-git-graph-zero #162）の変更一式を載せ、`.github/comment-check/` を 0.2.3 に差し替えてコミットした。zenn は導入 PR がないので、共通の CLAUDE.md・rules・skills・quality.yml を置いた。そのうえで CI と同じコマンドを `GITHUB_ACTIONS=true` 付きで実行した（`npm ci`、`npm test`、`cli.mjs --base <基準> --head HEAD`）。6 リポとも違反 0・解析エラー 0・未対応 0 で終了コード 0 になった。comment-check 自身のソースは検査対象に入っていて違反はなく、skills は既定の除外で外れる。わざと TODO を足すと終了コード 1 で落ちることも確かめた。手順は `sim/simulate.sh`。

## 0.2.2（2026-11-17 JST）

kyto64/clipboard-sync PR #6 の Codex P2 4 件と、kyto64/vscode-line-ref-copy PR #63 の指摘（CodeQL high 2 件・Codex P2）への対応。どれも 0.2.1 で再現することを回帰テストで確かめてから直した。

- **生成物ヘッダの打ち切り**（check.mjs）：ファイル先頭のブロックコメントを閉じた行に同じ行でコードが続いても（`/* header */ export const value = 1;`）先頭コメント扱いが続き、次の `// @generated` でファイル全体を飛ばしていた。コメントの最終行の後ろにコードがあれば、そのコメントでヘッダを打ち切る。HTML の `<!-- … --><p>` も同じ。
- **Python の引用符**（rules.mjs）：`commentBody` が三重引用符しか外さず、`'…'` / `"…"`（r・b・u 接頭辞付きを含む）の docstring や文字列文では引用符が本文に残り、`INVARIANT:` などのマーカーが効かなかった。始まりと同じ引用符で閉じる 1 つの文字列リテラルなら、引用符の種類によらず外して判定する。
- **複数行の制約ブロックの理由**（check.mjs）：新しく足したブロックで `// INVARIANT:` の次の行に理由を書くと、先頭行だけを見て `constraint-without-reason` と報告していた。先頭行のマーカーの理由は、TODO・ワークアラウンド・理由のない無効化の行を除いたブロック全体で判定する（理由が足りなければブロックとして 1 件の違反）。TODO などの行は従来どおり行ごとに違反。
- **export 一覧で公開した宣言**（script.mjs）：`function api() {}` ＋ `export { api }`、`export { Impl as Runner }`、`export type { Shape }`、`export default main` で公開した宣言の JSDoc を公開 API として扱う（クラス・インターフェース・enum のメンバーも同様）。`export { x } from './y'` の再エクスポートでは、同名のローカル宣言を公開扱いしない。

### vscode-line-ref-copy PR #63 の指摘

- **CodeQL js/incomplete-sanitization**（cli.mjs）：ステップサマリの表のセルで、縦線だけをエスケープしてバックスラッシュをエスケープしていなかった。バックスラッシュを先にエスケープする。
- **CodeQL js/bad-tag-filter**（rules.mjs）：HTML コメントの本文を取るとき、終端 `--!>` を外していなかった。`-->` と `--!>` の両方を外す。
- **ベースライン**（check.mjs / cli.mjs）：変更ファイルと追加行は `base...head`（merge-base）で取るのに、既存コメントは `base` の先端から読んでいた。既定ブランチが先に進んでコメントを消していると、機能ブランチの既存コメントが新規違反になった。既存コメントも merge-base から読む。`--base` を省くと origin/HEAD（リモートの既定ブランチ）を使い、`master` / `main` を決め打ちしない。
- **ライセンスブロックの後ろの説明**（check.mjs / rules.mjs）：新しく足した `// Copyright …` / `// Licensed under …` の直後に続けた `// increment the counter` が、ライセンスの例外を引き継いで通っていた。ライセンス本文らしい語を含む最後の行までをライセンスとし、その後ろの行は1行ずつ分類する。SPDX 行の下に足した `// TODO`（既存ブロックへの追加）は 0.2.0 で直っていたことを回帰テストで確かめた。
- **確認だけ（0.2.0 / 0.2.1 で直っていた）**：文字列・正規表現内の `DO NOT EDIT` / `@generated` で生成物扱いにしない（0.2.0）、`export { f }` で公開した関数の JSDoc（上の 0.2.2 の修正）、MIT 全文ヘッダ（`//`・`/* */`・`#` のどれでも通る）、`// @ts-check` の直下に足した `// TODO`（0.2.0）、Python の入れ子関数の docstring（0.2.0）、`.d.ts` のファイル名（0.2.1）。どれも line-ref #63 の例を回帰テストにした。

### 同じ種類の穴（CodeQL 系の見直し）

- **Vue のブロック外のコメント**（vue.mjs）：`/<!--[\s\S]*?-->/g` の正規表現で取っていたため、`--!>` で閉じたコメントの後ろの `<template>` まで 1 つのコメントとして取り込んでいた（js/bad-tag-filter と同じ種類）。parse5 で取り出す。
- **GitHub の注釈**（cli.mjs）：`::error file=…,title=…::` のプロパティで `,` と `:` をエスケープしていなかった。ファイル名に `,` があると注釈が壊れていた。プロパティは `%2C` / `%3A` もエスケープする。
- glob.mjs の正規表現エスケープ（バックスラッシュを含む）・ほかの `replace` に、同じ種類の漏れはなかった。

### その他

- README：テスト件数の記載をやめた（件数は `npm test` の出力で見る）。actions は SHA 直書きか、タグ＋actions.lock（`gh actions-lock verify`）のどちらでもよいことを書いた。雛形の YAML にコメントで書くと、そのまま入れたリポジトリで comment-check の違反になるため README に書いた。

## 0.2.1（2026-11-17 JST）

kyto64/me PR #146 の指摘 2 件（Codex P2・Amazon Q）と、kyto64/vscode-git-graph-zero PR #162 の Codex P2 2 件への対応。

### 指摘への対応

- **Python のマルチバイト文字**（python.mjs）：`ast` の `col_offset` / `end_col_offset`（UTF-8 のバイト数）を文字位置として切り出していたため、日本語を含む docstring が後ろのコードまで取り込み、`value = "@ts-ignore"` などを検査無効化と誤判定していた。切り出しを標準ライブラリの `ast.get_source_segment`（バイト位置を文字位置に直して切り出す）に替えた。
- **shfmt の取得**（common/.github/workflows/quality.yml.example）：`go install` をやめ、公式リリースの `shfmt_v3.14.1_linux_amd64` を取ってきて sha256 `76e77641faa025814b77f153b29796b8e6fa2fca03e0c76a691608b86c7ea7bf` を `sha256sum --check` で照合する。合わなければ失敗する。

- **宣言ファイルの JSDoc**（script.mjs / index.mjs / check.mjs）：TypeScript のパーサに `'x' + ext` という仮のファイル名を渡していたため、`.d.ts` でも `isDeclarationFile` が false になり、宣言ファイルの JSDoc が公開 API の例外にならなかった。実際のファイル名を渡すようにした。判定は TypeScript に任せるので、`.d.ts` / `.d.mts` / `.d.cts` と `.d.css.ts` のような任意拡張子の宣言ファイルも対象になる。HTML・Vue の中のスクリプトは宣言ファイルではないので `embedded.<拡張子>` を渡す。
- **テストの shfmt の探し方**（test/check.test.mjs、test/helpers/shfmt.mjs）：`process.env.COMMENT_CHECK_SHFMT ??= …/.bin/shfmt` で、存在しないパスでも決め打ちしていた。`resolveShfmt` で `COMMENT_CHECK_SHFMT` を最優先し、未設定なら実在するファイルだけ（comment-check 直下の `.bin/shfmt`、次に `.github/comment-check/` として置いたときのリポジトリ直下の `.bin/shfmt`）を選び、どちらもなければ PATH の `shfmt` に任せる。

### 同じ種類の穴

- Python：行の区切りを `str.splitlines()` で数えていたため、改ページ（`\f`）や U+2028 を含むファイルで行の位置がずれ、別の箇所を docstring として切り出していた。上と同じ修正で解消（自前の位置計算をなくした）。
- ほかの抽出器（TypeScript・Vue・HTML・CSS/SCSS/LESS・YAML・シェル）を確かめ、ずれはなかった。JS の文字列位置をそのまま使うもの（TypeScript・parse5・Vue・postcss・yaml）は位置の単位が揃っており、shfmt は行番号だけを使う。テストで固定した。
- 雛形の `actions/checkout` / `actions/setup-node` を、版のプレースホルダーからコミット SHA 固定（v7.0.1 `3d3c42e5…`、v7.1.0 `949feb24…`）に、Node を `24` から `24.22.3` に固定した。npm の依存は package-lock.json の integrity で照合される（`npm ci`）。

## 0.2.0（2026-11-17 JST）

kyto64/clipboard-sync PR #6 の Codex 指摘（P2 × 5）への対応と、同じ種類の穴の修正。

### 指摘への対応

- **生成物の判定**（check.mjs）：冒頭 5 行の生のテキストに `DO NOT EDIT` があればファイルを丸ごと飛ばしていたのをやめた。パーサで取り出したコメントのうち、ファイル冒頭のもの（前にコードがない）だけで判定する。文字列リテラルの `"DO NOT EDIT"` では飛ばさない。
- **Python の docstring**（python.mjs）：モジュール直下とクラス直下のメソッドしか見ていなかった。構文木を再帰的に辿り、入れ子の関数・クラス、`if` / `try` などの下の定義も検査する。関数の中で定義したものは非公開扱い。
- **CSS の url()**（css.mjs）：手書きの字句解析をやめ、postcss のパーサに置き換えた。引用符なしの `url(/images/*.png)` やエスケープの中の `/*` をコメントと見なさない。HTML・Vue の style も同じ処理を使う。
- **ライセンス行の下のコメント**（check.mjs / rules.mjs）：連続した行コメントのブロックで、先頭のライセンス行が下に足した行まで例外にしていた。先頭行の効果（ライセンス・制約マーカー）を引き継ぐのは、ブロック全体をこの PR で追加したときだけにした。既存ブロックに足した行は1行ずつ分類する。
- **Vue の scss**（vue.mjs）：`<style lang>` を無視して CSS として読んでいた。scss / less は版固定の postcss-scss 4.0.9 / postcss-less 7.1.1 で解析し、`//` コメントも検査する。sass（インデント記法）・stylus は未対応言語として失敗させる。

### 同じ種類の穴

- ライセンス・生成物の例外を、ファイル冒頭のコメントに限った（途中の「auto-generated」「copyright」を含む説明コメントが例外になっていた）。
- 新しく追加したライセンス・制約ブロックの中でも、TODO・ワークアラウンド・理由のない検査無効化の行は引き継がずに違反にする。検査無効化の理由が別の行にある場合も違反（理由は同じ行に書く）。
- ツール指示の行（`prettier-ignore` など）の下に続けた説明行は、指示の例外を引き継がない。
- Python：docstring 以外の位置にある裸の文字列文（コメント代わりの `"""..."""`）も検査する。
- TypeScript：エクスポートしたクラスの `private` / `#name` メンバーの JSDoc を公開 API 扱いしない。
- Vue：`<template lang="pug">`、js/jsx/ts/tsx 以外の `<script lang>`、カスタムブロックは未対応言語として失敗させる（黙って通さない）。
- HTML：JSON 系の `<script type>` は JSON として解析し、それ以外の JS でない type や CSS でない `<style type>` は未対応言語として失敗させる。
- 単体の .scss / .less ファイルを検査対象にした（0.1.0 では未対応言語）。.sass / .styl は未対応言語のまま。
- 未対応言語の報告に、どの言語・ブロックかを出す。

### 依存

- 追加：postcss 8.5.33、postcss-scss 4.0.9、postcss-less 7.1.1（すべて版固定）

## 0.1.0（2026-11-17 JST）

- 最初の試作。
