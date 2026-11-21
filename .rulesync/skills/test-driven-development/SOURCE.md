# Superpowers スキルの採用元（SHA 固定）

- 採用元：https://github.com/obra/superpowers
- コミット：`22f0b463e7a5e579904dd6211a520321035526f7`（main の先頭。2026-11-03T22:17:07Z = 2026-11-04 07:17 JST。Release v7.0.2、package.json の version も 7.0.2）
- 取得日：2026-11-17（JST）
- ライセンス：MIT（Copyright (c) 2025 Jesse Vincent）。全文は同じフォルダの `LICENSE`。MIT の条件（著作権表示と許諾表示を残す）を満たすため、各スキルのフォルダに `LICENSE` とこの `SOURCE.md` を置く。
- 採用範囲：指示書 4 節で固定した2スキルだけ。Superpowers 全体、ほかのスキル、hooks、プラグイン定義は入れない。

## 取得したファイル（すべて upstream と同一）

各ファイルの git blob SHA を upstream のツリーと照合し、すべて一致した（改変なし）。

| ファイル | git blob SHA | mode |
|---|---|---|
| LICENSE | abf0390320aa14406af7a520b9b0739fdda9bf08 | 100644 |
| systematic-debugging/SKILL.md | 62fc752aaef59a8bbed5d305f4cadc60f8ae07ed | 100644 |
| systematic-debugging/root-cause-tracing.md | 0e72e8f9566b7ef85e814633d1feacad9d0c5868 | 100644 |
| systematic-debugging/defense-in-depth.md | e2483354dc2b62478a2624e34ca18bc0efe887b2 | 100644 |
| systematic-debugging/condition-based-waiting.md | 70994f777c586f7d4c43033aac34c7cf0da6688b | 100644 |
| systematic-debugging/condition-based-waiting-example.ts | 703a06b653160d060bbf46ab5c6e0cd7446bd592 | 100644 |
| systematic-debugging/find-polluter.sh | 985f5d08ccf8a3f2d40739cfcaf4413bb24bf1cb | 100755 |
| test-driven-development/SKILL.md | 46838cc9e893c06259e3bdad0fc2425b36242f15 | 100644 |
| test-driven-development/writing-good-tests.md | d3c4482fd30b4f9084bb61545fe73939a7502c28 | 100644 |

照合コマンド：`git hash-object <file>` の結果を `gh api repos/obra/superpowers/git/trees/<SHA>?recursive=1` の `sha` と比べる。

## 参照と依存

| 参照元 | 参照先 | 扱い |
|---|---|---|
| systematic-debugging/SKILL.md | `root-cause-tracing.md`、`defense-in-depth.md`、`condition-based-waiting.md`（同じフォルダ） | コピーする |
| condition-based-waiting.md | `condition-based-waiting-example.ts`（同じフォルダ） | コピーする |
| root-cause-tracing.md | `find-polluter.sh`（同じフォルダ） | コピーする（実行ビット付き） |
| test-driven-development/SKILL.md | `writing-good-tests.md`（同じフォルダ） | コピーする |
| systematic-debugging/SKILL.md | `superpowers:test-driven-development` | 採用済み。プロジェクトスキルとして置くと名前は `test-driven-development` になり、`superpowers:` の接頭辞では解決されない。CLAUDE.md の入口文で対応を書く |
| systematic-debugging/SKILL.md | `superpowers:verification-before-completion` | 採用範囲外（指示書 4 節で2スキルに固定）。入れない。代わりに `.claude/rules/root-cause-first.md` の「完了前の検証」に従うと CLAUDE.md に書く |
| writing-good-tests.md | `superpowers:writing-skills` | 説明文中の補足だけで、手順には不要。入れない |

コード上の依存（npm パッケージ、hooks、スクリプトの外部コマンド）はない。`find-polluter.sh` は bash と `npm test` を前提にしている（使うときにリポジトリのテストコマンドへ読み替える）。`condition-based-waiting-example.ts` は `~/threads/...` を import する読み物用の例で、コンパイル対象ではない。

## 最小コピー範囲の結論

2スキルのフォルダの全ファイル（8ファイル）＋ `LICENSE`。SKILL.md だけのコピーは、本文が同じフォルダのファイルを名前で参照しているため「動かない断片コピー」になる。全ファイルでも LICENSE 込みで合計約 48 KB。

## 配置時の注意（確かめた事実）

- `condition-based-waiting-example.ts` は型検査・lint の対象に入ると壊れる可能性がある。
  - tsc：既定の include（`**/*`）はドットで始まるディレクトリを拾わない。`include` 指定のない vscode-line-ref-copy の tsconfig と同じ形で試し、`.claude/` 下の .ts が対象外になることを確認した。
  - oxlint：ドットディレクトリも検査する（試して確認）。vscode-line-ref-copy の `.oxlintrc.json` と oxlint 1.94.0 でこの .ts を検査し、指摘 0 件だった。youtublur と me の `vp lint` では未確認。導入 PR の CI で確かめ、落ちたら `ignorePatterns` に `.claude/skills/**` を足す。
- コメント検査は `.claude/skills/**` を既定で除外する（upstream の原文はコメントを含み、改変しないため）。
- スキル本文は、過剰なガードを勧めるように読める箇所（`defense-in-depth.md` の「各層で検証」）と、理由コメントを勧める箇所（`condition-based-waiting.md`）がある。原文は変えず、`.claude/rules/root-cause-first.md` で「リポジトリのルールを優先」「マーカー付き制約コメントとして書く」と決めている。

## このリポジトリ（kyto64/vscode-line-ref-copy）での配置

- 正は `.rulesync/skills/systematic-debugging/` と `.rulesync/skills/test-driven-development/`。上の表のファイルは upstream とバイト単位で同じ。各フォルダに `LICENSE`（upstream の LICENSE と同一）とこの `SOURCE.md` を置く。
- `.claude/skills/` と `.agents/skills/` は `npm run rules:generate`（rulesync 33.0.0）の生成物。rulesync が SKILL.md の frontmatter（`description` の折り返し）を書き直すので、生成物の SKILL.md は upstream と同一バイトではない。本文と補助ファイルは変わらない。生成物は手で直さない。
- `find-polluter.sh` は実行ビット付き（git の mode 100755）で置く。
- コメント検査は `.rulesync/skills/**`・`.claude/skills/**`・`.agents/skills/**` を既定で除外する（upstream の原文を改変しないため）。
